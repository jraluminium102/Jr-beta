import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

type Params = { params: { id: string } };
const schema = z.object({ reason: z.string().min(1, "ระบุเหตุผล") });

// POST /api/finance/:id/void — ห้ามลบตรง ต้อง void + เหตุผล (REQ-04)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("finance", "void");
  const { reason } = schema.parse(await req.json());

  // 1) ดึง entry ก่อน void เพื่อดู billing_installment_id + is_auto_created
  const { data: entry, error: fetchErr } = await ctx.supabase
    .from("finance_entries")
    .select("id, job_id, amount, type, channel, billing_installment_id, is_auto_created, is_voided")
    .eq("id", params.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single<any>();
  if (fetchErr || !entry) throw new Error(fetchErr?.message ?? "ไม่พบรายการ");

  // 2) void entry
  const { data, error } = await ctx.supabase
    .from("finance_entries")
    .update({
      is_voided: true,
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: ctx.user.id,
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Void failed");

  // 3) ถ้า entry ผูกกับงวด (billing_installment_id) + ไม่ใช่มัดจำ (is_auto_created=false)
  //    → คืนงวดเป็น pending + recompute สถานะใบวางบิล
  //    (เลียนแบบ logic ใน /api/receipts/[id]/void)
  if (entry.billing_installment_id && !entry.is_auto_created) {
    // 3a) คืนงวดเป็น pending
    const { error: iErr } = await ctx.supabase
      .from("billing_installments")
      .update({ paid_amount: 0, paid_date: null, status: "pending" })
      .eq("id", entry.billing_installment_id);
    if (iErr) throw new Error("คืนงวดไม่สำเร็จ: " + iErr.message);

    // 3b) หา billing_note_id จาก installment แล้ว recompute billing_notes.status
    const { data: inst } = await ctx.supabase
      .from("billing_installments")
      .select("billing_note_id")
      .eq("id", entry.billing_installment_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single<any>();

    if (inst?.billing_note_id) {
      const { data: bn } = await ctx.supabase
        .from("billing_notes")
        .select("total, billing_installments(paid_amount)")
        .eq("id", inst.billing_note_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .single<any>();

      if (bn) {
        const totalPaid = (bn.billing_installments ?? []).reduce(
          (a: number, i: { paid_amount: number }) => a + (Number(i.paid_amount) || 0), 0,
        );
        const total = Number(bn.total) || 0;
        const blStatus = totalPaid <= 0 ? "unpaid" : totalPaid >= total ? "paid" : "partial";
        await ctx.supabase
          .from("billing_notes")
          .update({ status: blStatus })
          .eq("id", inst.billing_note_id);
      }
    }
  }

  await audit({
    jobId: data.job_id, userId: ctx.user.id, action: "FINANCE_VOID",
    table: "finance_entries", recordId: params.id,
    oldValue: { amount: data.amount, type: data.type, channel: data.channel },
    newValue: { reason },
  });
  return ok(data);
});
