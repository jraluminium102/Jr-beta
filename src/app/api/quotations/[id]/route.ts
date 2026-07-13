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
});

const PatchSchema = z.object({
  items: z.array(ItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  vat_rate: z.number().min(0).max(100).default(7),
  discount_pct: z.number().min(0).max(100).default(0),
  discount_amt: z.number().min(0).optional(),   // โหมดบาท — ส่งมา = ใช้ตรง ๆ (ชนะ %)
  discount_label: z.string().max(120).optional(), // หัวข้อส่วนลด
  wht_rate: z.number().min(0).max(100).default(0),
  note: z.string().optional(),
});

// PATCH /api/quotations/[id] — แก้ items/vat/discount/wht → คำนวณใหม่ด้วย computeTotals
// บล็อกถ้ามี billing_note active (status != cancelled)
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { items, vat_rate, discount_pct, discount_amt, discount_label, wht_rate, note } = parsed.data;

  const qId = params.id;

  // 1) ดึงใบเสนอเดิม
  const { data: q, error: qErr } = await ctx.supabase
    .from("quotations")
    .select("id, status")
    .eq("id", qId)
    .single<{ id: number; status: string }>();
  if (qErr || !q) return notFound("ไม่พบใบเสนอราคา");

  // 2) ตรวจ billing_note active
  const { data: activeBn } = await ctx.supabase
    .from("billing_notes")
    .select("id, code")
    .eq("quotation_id", qId)
    .neq("status", "cancelled")
    .limit(1);

  if ((activeBn ?? []).length > 0) {
    const code = (activeBn as { id: number; code: string }[])[0].code;
    return err(`มีใบวางบิล ${code} ที่ยังใช้งานอยู่ — ต้องยกเลิกใบวางบิลก่อนแก้ใบเสนอ`, 409);
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

  const { error: uErr } = await ctx.supabase
    .from("quotations")
    .update(updateData)
    .eq("id", qId);
  if (uErr) throw new Error(uErr.message);

  // 5) replace quotation_items: ลบเก่า → insert ใหม่
  const { error: delErr } = await ctx.supabase
    .from("quotation_items")
    .delete()
    .eq("quotation_id", qId);
  if (delErr) throw new Error("ลบรายการเดิมไม่สำเร็จ: " + delErr.message);

  const lineItems = items.map((it) => ({
    quotation_id: Number(qId),
    name: it.name,
    detail: it.detail,
    qty: it.qty,
    unit_price: it.unit_price,
    line_total: Math.round((it.qty * it.unit_price + Number.EPSILON) * 100) / 100,
    sort_order: it.sort_order,
  }));
  const { error: insErr } = await ctx.supabase
    .from("quotation_items")
    .insert(lineItems);
  if (insErr) throw new Error("บันทึกรายการใหม่ไม่สำเร็จ: " + insErr.message);

  // 6) audit
  await audit({
    userId: ctx.user.id,
    action: "PATCH_QUOTATION",
    table: "quotations",
    recordId: qId,
    newValue: { ...money, vat_rate, discount_pct: storedPct, discount_label: discount_label ?? "", wht_rate, item_count: items.length },
  });

  return ok({ id: Number(qId), ...money });
});
