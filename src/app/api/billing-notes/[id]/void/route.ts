import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

const VoidSchema = z.object({
  reason: z.string().min(1, "ต้องระบุเหตุผล"),
});

// POST /api/billing-notes/[id]/void — ยกเลิกใบวางบิล
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "void");

  const body = await req.json().catch(() => ({}));
  const parsed = VoidSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { reason } = parsed.data;

  const bnId = params.id;

  // 1) ดึงใบวางบิล + งวด
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, billing_installments(id)")
    .eq("id", bnId)
    .single<{ id: number; status: string; billing_installments: { id: number }[] }>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  // 2) บล็อกถ้ามี receipt active ผูกอยู่กับงวดใดงวดหนึ่ง
  const instIds = (bn.billing_installments ?? []).map((i) => i.id);
  if (instIds.length > 0) {
    const { data: activeRc } = await ctx.supabase
      .from("receipts")
      .select("id, code")
      .in("installment_id", instIds)
      .eq("is_voided", false)
      .limit(1);

    if ((activeRc ?? []).length > 0) {
      const code = (activeRc as { id: number; code: string }[])[0].code;
      return err(`มีใบเสร็จ ${code} ที่ยังใช้งานอยู่ — ต้อง void ใบเสร็จก่อน`, 409);
    }
  }

  // ตรวจ receipt ที่ผูกกับ billing_note_id โดยตรง (ไม่มี installment_id) ด้วย
  const { data: directRc } = await ctx.supabase
    .from("receipts")
    .select("id, code")
    .eq("billing_note_id", bnId)
    .eq("is_voided", false)
    .limit(1);
  if ((directRc ?? []).length > 0) {
    const code = (directRc as { id: number; code: string }[])[0].code;
    return err(`มีใบเสร็จ ${code} ที่ยังใช้งานอยู่ — ต้อง void ใบเสร็จก่อน`, 409);
  }

  // 3) set billing_notes.status = 'cancelled'
  const { error: vErr } = await ctx.supabase
    .from("billing_notes")
    .update({ status: "cancelled" })
    .eq("id", bnId);
  if (vErr) throw new Error(vErr.message);

  // 4) คืนงวดทั้งหมดเป็น pending
  if (instIds.length > 0) {
    const { error: iErr } = await ctx.supabase
      .from("billing_installments")
      .update({ paid_amount: 0, paid_date: null, status: "pending" })
      .in("id", instIds);
    if (iErr) throw new Error("คืนงวดไม่สำเร็จ: " + iErr.message);
  }

  // 5) void finance_entries ที่ผูกกับงวดเหล่านี้
  if (instIds.length > 0) {
    await ctx.supabase
      .from("finance_entries")
      .update({
        is_voided: true,
        void_reason: reason,
        voided_at: new Date().toISOString(),
        voided_by: ctx.user.id,
      })
      .in("billing_installment_id", instIds)
      .eq("is_voided", false);
  }

  // 6) audit
  await audit({
    userId: ctx.user.id,
    action: "VOID_BILLING_NOTE",
    table: "billing_notes",
    recordId: bnId,
    newValue: { status: "cancelled", void_reason: reason },
  });

  return ok({ ok: true });
});
