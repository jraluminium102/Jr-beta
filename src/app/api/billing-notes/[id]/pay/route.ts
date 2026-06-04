import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";

const PaySchema = z.object({
  installment_id: z.number({ required_error: "ต้องระบุงวดที่รับชำระ" }),
  paid_amount:    z.number().positive("ยอดรับชำระต้องมากกว่า 0"),
  paid_date:      z.string().optional(),
});

// PATCH /api/billing-notes/[id]/pay  → บันทึกรับชำระงวด + recompute สถานะใบวางบิล
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("billing", "write");

  const body = await req.json().catch(() => null);
  const parsed = PaySchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { installment_id, paid_amount, paid_date } = parsed.data;

  // 1) ดึงงวด (ยืนยันว่าอยู่ในใบวางบิลนี้จริง)
  const { data: inst, error: iErr } = await ctx.supabase
    .from("billing_installments")
    .select("amount")
    .eq("id", installment_id)
    .eq("billing_note_id", params.id)
    .single<{ amount: number }>();
  if (iErr || !inst) return notFound("ไม่พบงวดในใบวางบิลนี้");

  // installment_status enum = ('pending','paid') เท่านั้น
  const instStatus = paid_amount >= (Number(inst.amount) || 0) ? "paid" : "pending";

  // 2) update งวดที่รับชำระ
  const { error: uErr } = await ctx.supabase
    .from("billing_installments")
    .update({
      paid_amount,
      paid_date: paid_date || new Date().toISOString().slice(0, 10),
      status: instStatus,
    })
    .eq("id", installment_id)
    .eq("billing_note_id", params.id);
  if (uErr) return err("บันทึกรับชำระไม่สำเร็จ: " + uErr.message, 500);

  // 3) recompute สถานะใบวางบิลจากผลรวม paid_amount เทียบ total
  const { data: bn, error: bErr } = await ctx.supabase
    .from("billing_notes")
    .select("total, billing_installments(paid_amount)")
    .eq("id", params.id)
    .single<{ total: number; billing_installments: { paid_amount: number }[] }>();
  if (bErr || !bn) return notFound("ไม่พบใบวางบิล");

  const totalPaid = (bn.billing_installments ?? []).reduce((a, i) => a + (Number(i.paid_amount) || 0), 0);
  const total = Number(bn.total) || 0;
  const status = totalPaid <= 0 ? "unpaid" : totalPaid >= total ? "paid" : "partial";

  const { error: sErr } = await ctx.supabase
    .from("billing_notes")
    .update({ status })
    .eq("id", params.id);
  if (sErr) return err("อัปเดตสถานะไม่สำเร็จ: " + sErr.message, 500);

  return ok({ ok: true });
});
