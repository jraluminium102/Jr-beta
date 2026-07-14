import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { computeTotals } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { fail, UNAUTHORIZED } from "@/lib/bff";

// GET /api/quotations/[id]  → ใบเสนอ + รายการ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "quotation_items", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

const ItemSchema = z.object({
  name: z.string().min(1),
  detail: z.string().default(""),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  sort_order: z.number().int().default(0),
  category: z.string().optional(),        // หมวดสินค้า → สถิติ (คงไว้ตอนแก้จากเครื่องคิด)
  product_id: z.string().optional(),
  group_label: z.string().optional(),     // หัวข้อชุด (0076 เช่น "ห้องนอน 1") — เดิม PATCH ทำหาย (QA HIGH-3)
  calc_recipe: z.any().optional(),        // สูตรคิดราคา 4.0 ต่อข้อ (0093) — โหลดกลับเข้าเครื่องคิดได้
});

const PatchSchema = z.object({
  items: z.array(ItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  vat_rate: z.number().min(0).max(100).default(7),
  discount_pct: z.number().min(0).max(100).default(0),
  discount_amt: z.number().min(0).optional(),   // โหมดบาท — ส่งมา = ใช้ตรง ๆ (ชนะ %)
  discount_label: z.string().max(120).optional(), // หัวข้อส่วนลด
  wht_rate: z.number().min(0).max(100).default(0),
  note: z.string().optional(),
  // ระบบ Rev (0093): none=บันทึกทับเฉยๆ · rev=ขึ้น Rev ใหม่ (ทับ) · rev_keep=ขึ้น Rev ใหม่ + เก็บฉบับเดิมเป็นประวัติ
  revision_action: z.enum(["none", "rev", "rev_keep"]).optional(),
  revision_label: z.string().max(40).optional(), // ป้าย Rev พิมพ์เอง (เว้น = auto RevXX)
});

// PATCH /api/quotations/[id] — แก้ items/vat/discount/wht → คำนวณใหม่ด้วย computeTotals
// บล็อกถ้ามี billing_note active (status != cancelled)
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { items, vat_rate, discount_pct, discount_amt, discount_label, wht_rate, note, revision_action, revision_label } = parsed.data;

  const qId = params.id;

  // 1) ดึงใบเสนอเดิม (รวม rev ปัจจุบัน — คอลัมน์อาจยังไม่มีถ้า 0093 ยังไม่รัน → fallback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = null;
  {
    const r1 = await ctx.supabase
      .from("quotations")
      .select("id, status, revision_no, revision_label")
      .eq("id", qId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single<any>();
    if (r1.error && /revision_/i.test(r1.error.message ?? "")) {
      const r2 = await ctx.supabase.from("quotations").select("id, status").eq("id", qId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .single<any>();
      q = r2.data;
    } else q = r1.data;
  }
  if (!q) return notFound("ไม่พบใบเสนอราคา");

  // 2) ตรวจ billing_note active — แก้ราคาใบที่วางบิลแล้วไม่ได้ (มติเจ้าของ: ยกเลิกบิลเดิม → แก้ → ออกบิลใหม่)
  const { data: activeBn } = await ctx.supabase
    .from("billing_notes")
    .select("id, code")
    .eq("quotation_id", qId)
    .neq("status", "cancelled")
    .limit(1);

  if ((activeBn ?? []).length > 0) {
    const code = (activeBn as { id: number; code: string }[])[0].code;
    return err(`มีใบวางบิล ${code} ที่ยังใช้งานอยู่ — ยกเลิกใบวางบิลเดิมก่อน แล้วค่อยแก้ราคา/ออกใบวางบิลใหม่`, 409);
  }

  // 2.5) ระบบ Rev (0093) — snapshot ฉบับปัจจุบัน (หัว+รายการ+สูตร) เก็บเป็นประวัติก่อนทับ
  // บัญชีสั่ง: ใบที่ "ส่งลูกค้าแล้ว" (sent/approved) ต้อง snapshot เสมอ ไม่ว่าผู้ใช้เลือกโหมดไหน
  // — ตัวเลขที่เคยยื่นให้ลูกค้าต้องกู้กลับได้เสมอ (audit trail)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fullQ } = await ctx.supabase
    .from("quotations").select("*, quotation_items(*)").eq("id", qId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single<any>();
  const mustSnapshot = revision_action === "rev_keep" || ["sent", "approved"].includes(String(q.status));
  if (mustSnapshot && fullQ) {
    const { error: snapErr } = await ctx.supabase.from("quotation_revisions").insert({
      quotation_id: Number(qId),
      revision_no: Number(q.revision_no) || 0,
      label: String(q.revision_label ?? ""),
      snapshot: fullQ,
      created_by: ctx.user.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (snapErr) {
      // แยกสาเหตุด้วย Postgres error code (QA MEDIUM): 42P01 = ตารางไม่มี (0093 ยังไม่รัน) · 42501/RLS = ติดสิทธิ์
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pgCode = String((snapErr as any).code ?? "");
      const tableMissing = pgCode === "42P01" || /relation .*quotation_revisions.* does not exist/i.test(snapErr.message ?? "");
      // ผู้ใช้ตั้งใจเก็บประวัติ (rev_keep) → ห้ามเงียบ · ส่วน sent/approved ที่บังคับเอง → non-fatal (log)
      if (revision_action === "rev_keep") {
        if (tableMissing) {
          return err("ยังไม่ได้รัน migration 0093 (ประวัติ Rev) — รันก่อนใช้ 'Rev ใหม่ (เก็บของเดิม)' หรือเลือกแบบไม่เก็บประวัติ", 400);
        }
        if (pgCode === "42501" || /row-level security/i.test(snapErr.message ?? "")) {
          return err("สิทธิ์ไม่พอสำหรับเก็บประวัติ Rev (ต้อง ADMIN/SALES/ACCOUNTING)", 403);
        }
        return err("เก็บประวัติฉบับเดิมไม่สำเร็จ: " + snapErr.message, 500);
      }
      console.warn("[quotations PATCH] forced snapshot (sent/approved) failed (non-fatal):", snapErr.message);
    }
  }
  let revUpdate: Record<string, unknown> = {};
  if (revision_action === "rev" || revision_action === "rev_keep") {
    const curNo = Number(q.revision_no) || 0;
    const nextNo = curNo + 1;
    const label = (revision_label ?? "").trim() || `Rev${String(nextNo).padStart(2, "0")}`;
    revUpdate = { revision_no: nextNo, revision_label: label };
  } else if (revision_label !== undefined) {
    // แก้เฉพาะป้าย Rev (ไม่นับเลขเพิ่ม) — เช่น พิมพ์ป้ายเอง/ลบป้าย
    revUpdate = { revision_label: revision_label.trim() };
  }

  // 3) คำนวณยอดใหม่ทั้งหมดด้วย computeTotals (ส่งบาทมา = ใช้ตรง ๆ · ไม่งั้นคิดจาก %)
  const money = computeTotals({ items, vat_rate, discount_pct, wht_rate, ...(discount_amt != null ? { discount_amt } : {}) });
  // discount_pct ที่เก็บ = derived จากยอดจริง (โหมดบาท) เพื่อโชว์ให้ตรง · amt เป็นตัวตั้ง
  const storedPct = discount_amt != null
    ? (money.subtotal > 0 ? Math.round((money.discount_amt / money.subtotal) * 10000) / 100 : 0)
    : discount_pct;

  // 4) update quotations header
  const updateData: Record<string, unknown> = {
    vat_rate,
    discount_pct: storedPct,
    wht_rate,
    subtotal: money.subtotal,
    discount_amt: money.discount_amt,
    vat_amt: money.vat_amt,
    total: money.total,
    wht_amt: money.wht_amt,
    net: money.net,
  };
  if (discount_label !== undefined) updateData.discount_label = discount_label;
  if (note !== undefined) updateData.note = note;
  Object.assign(updateData, revUpdate);

  let { error: uErr } = await ctx.supabase
    .from("quotations")
    .update(updateData)
    .eq("id", qId);
  // กันพัง: 0093 (revision_*) ยังไม่รัน → update ซ้ำแบบตัด rev ออก (ยอดยังถูก)
  if (uErr && /revision_/i.test(uErr.message ?? "")) {
    const { revision_no: _rn, revision_label: _rl, ...noRev } = updateData as Record<string, unknown>;
    ({ error: uErr } = await ctx.supabase.from("quotations").update(noRev).eq("id", qId));
  }
  if (uErr) throw new Error(uErr.message);

  // 5) replace quotation_items — atomic ผ่าน RPC (0093 · delete+insert ใน txn เดียว กันหัวใบมียอดแต่ไม่มีรายการ)
  const lineItems = items.map((it) => ({
    quotation_id: Number(qId),
    name: it.name,
    detail: it.detail,
    qty: it.qty,
    unit_price: it.unit_price,
    line_total: Math.round((it.qty * it.unit_price + Number.EPSILON) * 100) / 100,
    sort_order: it.sort_order,
    category: String(it.category ?? ""),
    product_id: String(it.product_id ?? ""),
    group_label: String(it.group_label ?? ""), // หัวข้อชุด (0076) — เดิมหายตอน PATCH (QA HIGH-3)
    calc_recipe: it.calc_recipe ?? null,   // สูตรคิดราคา 4.0 (0093) — null = ข้อพิมพ์มือ/ค่าบริการ
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbRpc = ctx.supabase as any;
  const { error: rpcErr } = await sbRpc.rpc("replace_quotation_items", {
    p_q_id: Number(qId),
    p_items: lineItems,
  });
  if (rpcErr) {
    // RPC ยังไม่มี (0093 ยังไม่รัน) → fallback ทางเดิม (delete→insert · ไม่ atomic แต่ใช้งานได้)
    if (!/replace_quotation_items|function/i.test(rpcErr.message ?? "")) {
      throw new Error("บันทึกรายการใหม่ไม่สำเร็จ: " + rpcErr.message);
    }
    const { error: delErr } = await ctx.supabase
      .from("quotation_items")
      .delete()
      .eq("quotation_id", qId);
    if (delErr) throw new Error("ลบรายการเดิมไม่สำเร็จ: " + delErr.message);
    let { error: insErr } = await ctx.supabase
      .from("quotation_items")
      .insert(lineItems);
    // กันพัง: 0093 (calc_recipe) / 0076 (group_label) ยังไม่รัน → insert ซ้ำแบบตัดคอลัมน์นั้นออก
    if (insErr && /calc_recipe|group_label/i.test(insErr.message ?? "")) {
      const noRecipe = lineItems.map(({ calc_recipe: _cr, group_label: _gl, ...r }) => r);
      ({ error: insErr } = await ctx.supabase.from("quotation_items").insert(noRecipe));
    }
    if (insErr) throw new Error("บันทึกรายการใหม่ไม่สำเร็จ: " + insErr.message);
  }

  // 6) audit — เก็บ oldValue (ยอดเดิม) ด้วย เพื่อตรวจย้อนหลังได้แม้ไม่ได้ snapshot (บัญชีสั่ง)
  await audit({
    userId: ctx.user.id,
    action: "PATCH_QUOTATION",
    table: "quotations",
    recordId: qId,
    oldValue: fullQ
      ? { subtotal: fullQ.subtotal, discount_amt: fullQ.discount_amt, vat_amt: fullQ.vat_amt, total: fullQ.total, net: fullQ.net, item_count: (fullQ.quotation_items ?? []).length, revision_label: fullQ.revision_label ?? "" }
      : undefined,
    newValue: { ...money, vat_rate, discount_pct: storedPct, discount_label: discount_label ?? "", wht_rate, item_count: items.length, ...(revUpdate.revision_label ? { revision_label: revUpdate.revision_label } : {}) },
  });

  return ok({ id: Number(qId), ...money });
});
