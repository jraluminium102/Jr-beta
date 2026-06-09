import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

const VoidSchema = z.object({
  reason: z.string().min(1, "ต้องระบุเหตุผล"),
});

// POST /api/receipts/[id]/void — ยกเลิกใบเสร็จ (void)
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "void");

  const body = await req.json().catch(() => ({}));
  const parsed = VoidSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { reason } = parsed.data;

  const receiptId = params.id;

  // 1) ดึงใบเสร็จ
  const { data: rc, error: rcErr } = await ctx.supabase
    .from("receipts")
    .select("id, is_voided, installment_id, billing_note_id")
    .eq("id", receiptId)
    .single<{ id: number; is_voided: boolean; installment_id: number | null; billing_note_id: number | null }>();
  if (rcErr || !rc) return notFound("ไม่พบใบเสร็จ");
  if (rc.is_voided) return err("ใบเสร็จนี้ถูก void ไปแล้ว", 409);

  // 2) void ใบเสร็จ
  const { error: vErr } = await ctx.supabase
    .from("receipts")
    .update({
      is_voided: true,
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: ctx.user.id,
    })
    .eq("id", receiptId);
  if (vErr) throw new Error(vErr.message);

  // 3) ถ้ามี installment_id → คืนงวดกลับเป็น pending
  if (rc.installment_id) {
    const { error: iErr } = await ctx.supabase
      .from("billing_installments")
      .update({ paid_amount: 0, paid_date: null, status: "pending" })
      .eq("id", rc.installment_id);
    if (iErr) throw new Error("คืนงวดไม่สำเร็จ: " + iErr.message);

    // 3a) recompute สถานะใบวางบิล
    if (rc.billing_note_id) {
      const { data: bn } = await ctx.supabase
        .from("billing_notes")
        .select("total, billing_installments(paid_amount)")
        .eq("id", rc.billing_note_id)
        .single<{ total: number; billing_installments: { paid_amount: number }[] }>();

      if (bn) {
        const totalPaid = (bn.billing_installments ?? []).reduce(
          (a, i) => a + (Number(i.paid_amount) || 0), 0,
        );
        const total = Number(bn.total) || 0;
        const blStatus = totalPaid <= 0 ? "unpaid" : totalPaid >= total ? "paid" : "partial";
        await ctx.supabase
          .from("billing_notes")
          .update({ status: blStatus })
          .eq("id", rc.billing_note_id);
      }
    }
  }

  // 4) void finance_entry ที่ผูกกับ receipt นี้
  await ctx.supabase
    .from("finance_entries")
    .update({ is_voided: true, void_reason: reason, voided_at: new Date().toISOString(), voided_by: ctx.user.id })
    .eq("receipt_id", receiptId)
    .eq("is_voided", false);

  // 5) void finance_entry ที่ผูกกับ installment_id (ถ้ามีและไม่มี receipt_id ตรง)
  if (rc.installment_id) {
    await ctx.supabase
      .from("finance_entries")
      .update({ is_voided: true, void_reason: reason, voided_at: new Date().toISOString(), voided_by: ctx.user.id })
      .eq("billing_installment_id", rc.installment_id)
      .eq("is_voided", false);
  }

  // 6) audit log
  await audit({
    userId: ctx.user.id,
    action: "VOID_RECEIPT",
    table: "receipts",
    recordId: String(receiptId),
    newValue: { is_voided: true, void_reason: reason },
  });

  return ok({ ok: true });
});
