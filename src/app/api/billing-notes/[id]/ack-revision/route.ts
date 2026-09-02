import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

/**
 * POST /api/billing-notes/[id]/ack-revision
 *   "รับทราบว่าใบเสนอ Rev ใหม่แล้ว — ยอดเดิมถูกแล้ว" → ป้ายเตือนหายจนกว่าจะ Rev อีกรอบ (0127)
 *
 * ตั้งใจให้เป็นแค่การรับทราบ: ไม่แตะยอด ไม่แตะงวด ไม่แตะสถานะ (เจ้าของเคาะ "เตือนอย่างเดียว")
 */
export const POST = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bn } = await (ctx.supabase as any)
    .from("billing_notes")
    .select("id, code, quotation_id, source_revision_no, ack_revision_no")
    .eq("id", params.id)
    .single();
  if (!bn) return notFound("ไม่พบใบวางบิล");

  let curRev = 0;
  if (bn.quotation_id != null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: q } = await (ctx.supabase as any)
      .from("quotations").select("revision_no").eq("id", bn.quotation_id).single();
    curRev = Number(q?.revision_no) || 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (ctx.supabase as any)
    .from("billing_notes").update({ ack_revision_no: curRev }).eq("id", bn.id);
  if (error && /ack_revision_no/i.test(error.message ?? ""))
    return err("ยังไม่ได้รัน migration 0127 (แก้เอกสารได้ตลอด) — รันก่อนใช้งาน", 400);
  if (error) return err(error.message, 500);

  await audit({
    userId: ctx.user.id, action: "ACK_BILLING_REVISION", table: "billing_notes", recordId: params.id,
    oldValue: { ack_revision_no: bn.ack_revision_no ?? null },
    newValue: { ack_revision_no: curRev, code: bn.code },
  });

  return ok({ ok: true, ack_revision_no: curRev });
});
