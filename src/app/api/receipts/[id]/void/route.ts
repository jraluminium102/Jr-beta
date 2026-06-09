import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  // 4) void/unlink finance_entries ที่ผูกกับ receipt นี้
  // [HIGH-2] ถ้า entry เป็น is_auto_created=true (มัดจำที่รับจริง) → unlink แทน void
  //           (set billing_installment_id=null, source=null, receipt_id=null, คง amount + is_voided=false)
  //           ถ้า is_auto_created=false → void ตามปกติ
  await voidOrUnlinkByReceiptId(ctx.supabase, receiptId, reason, ctx.user.id);

  // 5) void/unlink finance_entry ที่ผูกกับ installment_id (ถ้ามีและยังไม่ถูกจัดการด้านบน)
  if (rc.installment_id) {
    await voidOrUnlinkByInstallmentId(ctx.supabase, rc.installment_id, reason, ctx.user.id);
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

// ─── helpers: void หรือ unlink finance_entries [HIGH-2] ───────────────────────

/**
 * void หรือ unlink finance_entries ที่ผูกกับ receipt_id นี้
 * is_auto_created=true → unlink (คงเงินมัดจำจริง)
 * is_auto_created=false → void ตามปกติ
 */
async function voidOrUnlinkByReceiptId(
  supabase: SupabaseClient,
  receiptId: string | number,
  reason: string,
  userId: string,
) {
  const { data: entries } = await supabase
    .from("finance_entries")
    .select("id, is_auto_created")
    .eq("receipt_id", receiptId)
    .eq("is_voided", false);

  if (!entries || entries.length === 0) return;

  const now = new Date().toISOString();
  for (const entry of entries as { id: string; is_auto_created: boolean }[]) {
    if (entry.is_auto_created) {
      // unlink: คง amount + is_voided=false, ล้าง billing link
      await supabase
        .from("finance_entries")
        .update({ billing_installment_id: null, receipt_id: null, source: null })
        .eq("id", entry.id);
    } else {
      // void ตามปกติ
      await supabase
        .from("finance_entries")
        .update({ is_voided: true, void_reason: reason, voided_at: now, voided_by: userId })
        .eq("id", entry.id);
    }
  }
}

/**
 * void หรือ unlink finance_entries ที่ผูกกับ billing_installment_id นี้
 * (เฉพาะที่ยังไม่ถูกจัดการจาก voidOrUnlinkByReceiptId)
 * is_auto_created=true → unlink; is_auto_created=false → void
 */
async function voidOrUnlinkByInstallmentId(
  supabase: SupabaseClient,
  installmentId: number,
  reason: string,
  userId: string,
) {
  const { data: entries } = await supabase
    .from("finance_entries")
    .select("id, is_auto_created")
    .eq("billing_installment_id", installmentId)
    .eq("is_voided", false);

  if (!entries || entries.length === 0) return;

  const now = new Date().toISOString();
  for (const entry of entries as { id: string; is_auto_created: boolean }[]) {
    if (entry.is_auto_created) {
      await supabase
        .from("finance_entries")
        .update({ billing_installment_id: null, receipt_id: null, source: null })
        .eq("id", entry.id);
    } else {
      await supabase
        .from("finance_entries")
        .update({ is_voided: true, void_reason: reason, voided_at: now, voided_by: userId })
        .eq("id", entry.id);
    }
  }
}
