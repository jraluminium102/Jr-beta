import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { err, notFound } from "@/lib/bff/response";
import { suggestInstallments, computeTotals } from "@/lib/money";

// GET /api/billing-notes/[id]  → ใบวางบิล + งวดชำระ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "billing_installments", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

// ──────────────────────────────────────────────────────────────────
// PATCH /api/billing-notes/[id]  → แก้ยอดบิล + re-split งวดใหม่
// รับได้ 2 โหมด:
//   (A) { total }                         → override ยอดตรงๆ (เดิม)
//   (B) { discount_pct, vat_rate, wht_rate } → แก้ footer (คิดใหม่จาก subtotal ของบิล) net→total
// Guard: ห้ามแก้ถ้ามีงวด paid หรือมี receipt/finance_entry ผูกอยู่
// ──────────────────────────────────────────────────────────────────
const PatchSchema = z.object({
  total: z.number({ invalid_type_error: "ยอดต้องเป็นตัวเลข" }).positive("ยอดต้องมากกว่า 0").optional(),
  discount_pct: z.number().min(0, "ส่วนลดต้อง ≥ 0").max(100, "ส่วนลดต้องอยู่ 0–100%").optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  wht_rate: z.number().min(0).max(100).optional(),
  labor_ratio: z.number().min(0, "% ค่าแรงต้อง ≥ 0").max(100, "% ค่าแรงต้องอยู่ 0–100").nullable().optional(),
});

export const PATCH = withRoute(
  async (req: Request, { params }: { params: { id: string } }) => {
    const ctx = await requirePermission("finance", "write");

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.errors[0].message, 400);

    // โหมด B = แก้ footer (มี field ภาษี/ส่วนลดอย่างน้อย 1 ตัว) · ไม่งั้นโหมด A = แก้ยอดตรง
    const isBreakdownMode =
      parsed.data.discount_pct != null || parsed.data.vat_rate != null || parsed.data.wht_rate != null;
    if (!isBreakdownMode && parsed.data.total == null) return err("ต้องระบุยอดใหม่ หรือ ส่วนลด/VAT", 400);
    const bnId = params.id;

    // 1) ดึงใบวางบิล + งวดปัจจุบัน (subtotal ใช้เป็นฐานโหมด B)
    // ดึง breakdown เดิมด้วย (ใช้ rollback ให้ครบถ้า RPC fail — บัญชีเตือน footer ต้องตรง total เสมอ)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bn, error: bnErr } = await (ctx.supabase as any)
      .from("billing_notes")
      .select("id, total, subtotal, discount_pct, discount_amt, vat_rate, vat_amt, wht_rate, wht_amt, has_tax_breakdown, labor_ratio, quotation_id, status, billing_installments(id, status, paid_amount)")
      .eq("id", bnId)
      .single();
    if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
    if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว แก้ยอดไม่ได้", 409);

    // breakdown เดิม (สำหรับ rollback) — คืนให้ครบทุกคอลัมน์ ไม่ใช่แค่ total
    const oldBreakdown = {
      subtotal: Number(bn.subtotal) || 0, discount_pct: Number(bn.discount_pct) || 0, discount_amt: Number(bn.discount_amt) || 0,
      vat_rate: Number(bn.vat_rate) || 0, vat_amt: Number(bn.vat_amt) || 0, wht_rate: Number(bn.wht_rate) || 0, wht_amt: Number(bn.wht_amt) || 0,
      has_tax_breakdown: !!bn.has_tax_breakdown, labor_ratio: bn.labor_ratio == null ? null : Number(bn.labor_ratio),
    };

    // คำนวณ newTotal + breakdown ตามโหมด
    let newTotal: number;
    let breakdown: Record<string, number | boolean | null>;
    if (isBreakdownMode) {
      // ฐานยอดก่อน VAT = subtotal จาก "ใบเสนอต้นทาง" (เชื่อถือได้เสมอ) ไม่ใช่ bn.subtotal ที่อาจถูก flatten (0078)
      // → ใช้ได้ทุกใบ (เก่า/ใหม่) และไม่มีทางคิด VAT ทับ เพราะฐานมาจากใบเสนอเสมอ
      let sub = 0;
      if (bn.quotation_id) {
        const { data: q } = await ctx.supabase
          .from("quotations").select("subtotal").eq("id", bn.quotation_id)
          .single<{ subtotal: number | null }>();
        sub = Number(q?.subtotal) || 0;
      }
      if (sub <= 0) {
        return err("ใบวางบิลนี้ไม่มีใบเสนอต้นทางที่มียอดก่อนภาษี (นำเข้า/ใบเก่า) — แก้ VAT/ส่วนลดไม่ได้ ใช้ 'แก้ยอดบิล' แทน", 409);
      }
      const disc = Number(parsed.data.discount_pct) || 0;
      const vat = Number(parsed.data.vat_rate) || 0;
      const wht = Number(parsed.data.wht_rate) || 0;
      const bt = computeTotals({ items: [{ qty: 1, unit_price: sub }], vat_rate: vat, discount_pct: disc, wht_rate: wht });
      newTotal = bt.net;
      breakdown = {
        subtotal: bt.subtotal, discount_pct: disc, discount_amt: bt.discount_amt,
        vat_rate: vat, vat_amt: bt.vat_amt, wht_rate: wht, wht_amt: bt.wht_amt, has_tax_breakdown: true,
      };
      // labor_ratio ปรับได้พร้อมกัน (null = ล้างการแยกค่าแรง/ค่าของ) — ตั้งเฉพาะเมื่อส่งมา
      if (parsed.data.labor_ratio !== undefined) breakdown.labor_ratio = parsed.data.labor_ratio;
    } else {
      // แก้ยอดตรง = ยอดล้วน (flat) → ตั้ง breakdown ให้ตรงกับ total (footer ไม่เพี้ยน) + has_tax_breakdown=false
      newTotal = Math.round((parsed.data.total! + Number.EPSILON) * 100) / 100; // round2
      breakdown = {
        subtotal: newTotal, discount_pct: 0, discount_amt: 0,
        vat_rate: 0, vat_amt: 0, wht_rate: 0, wht_amt: 0, has_tax_breakdown: false,
      };
    }
    if (newTotal <= 0) return err("ยอดสุทธิต้องมากกว่า 0", 400);

    const installments = bn.billing_installments ?? [];
    const instIds = installments.map((i) => i.id);

    // 2) guard: มีงวด paid หรือ receipt/finance_entry ผูกอยู่
    const hasPaidInstallment = installments.some(
      (i) => i.status === "paid" || (Number(i.paid_amount) || 0) > 0
    );
    if (hasPaidInstallment) {
      return err("มีการชำระแล้ว แก้ยอดไม่ได้ ต้องยกเลิกบิลออกใหม่", 409);
    }
    if (instIds.length > 0) {
      const [{ count: rcCount }, { count: feCount }] = await Promise.all([
        ctx.supabase
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .in("installment_id", instIds),
        ctx.supabase
          .from("finance_entries")
          .select("id", { count: "exact", head: true })
          .in("billing_installment_id", instIds),
      ]);
      if ((rcCount ?? 0) > 0 || (feCount ?? 0) > 0) {
        return err("มีการชำระแล้ว แก้ยอดไม่ได้ ต้องยกเลิกบิลออกใหม่", 409);
      }
    }

    const oldTotal = Number(bn.total) || 0;

    // 3) อัปเดต total + breakdown ก่อน (RPC อ่าน total ใหม่ → งวดตรง · footer ตรง total เสมอ)
    let { error: upErr } = await ctx.supabase
      .from("billing_notes")
      .update({ total: newTotal, ...breakdown })
      .eq("id", bnId);
    // กันพัง: ถ้า 0078/0079/0081 (ยอดแยก) ยังไม่รัน → อัปเดตแค่ total (ยอดยังถูก)
    if (upErr && /subtotal|discount_amt|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|labor_ratio/i.test(upErr.message ?? "")) {
      ({ error: upErr } = await ctx.supabase.from("billing_notes").update({ total: newTotal }).eq("id", bnId));
    }
    if (upErr) return err("อัปเดตยอดไม่สำเร็จ: " + upErr.message, 500);

    // 4) re-split งวดผ่าน RPC replace_billing_installments (1 txn → constraint ผ่าน)
    const plan = suggestInstallments(newTotal);
    const items = plan.map((p) => ({
      seq: p.seq,
      label: p.label,
      amount: p.amount,
      due_date: null,
    }));

    const sb = ctx.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ error: { message: string } | null }>;
    };
    const { error: rpcErr } = await sb.rpc("replace_billing_installments", {
      p_bn_id: Number(bnId),
      p_items: items,
    });
    if (rpcErr) {
      // rollback total + breakdown ให้ครบถ้า RPC ล้มเหลว (best-effort) — footer ต้องตรง total เดิม
      let { error: rbErr } = await ctx.supabase
        .from("billing_notes")
        .update({ total: oldTotal, ...oldBreakdown })
        .eq("id", bnId);
      if (rbErr) ({ error: rbErr } = await ctx.supabase.from("billing_notes").update({ total: oldTotal }).eq("id", bnId));
      return err("re-split งวดไม่สำเร็จ: " + rpcErr.message, 500);
    }

    // 5) audit
    await audit({
      userId: ctx.user.id,
      action: isBreakdownMode ? "UPDATE_BILLING_BREAKDOWN" : "UPDATE_BILLING_TOTAL",
      table: "billing_notes",
      recordId: bnId,
      oldValue: { total: oldTotal },
      newValue: { total: newTotal, ...(breakdown ?? {}), installments: items },
    });

    return ok({ ok: true, total: newTotal, installments: items });
  }
);
