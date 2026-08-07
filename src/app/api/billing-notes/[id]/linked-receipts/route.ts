import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";

// GET /api/billing-notes/[id]/linked-receipts
//   คืนใบเสร็จ/ใบกำกับภาษี active (is_voided=false) ที่ผูกกับใบวางบิลนี้
//   (ทาง installment ของบิล หรือผูก billing_note_id ตรง) — ให้ UI โชว์ก่อนยืนยัน cascade void
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "read");

  const bnId = params.id;
  // defense-in-depth: bnId ต้องเป็นจำนวนเต็ม (กัน filter-injection ตอนต่อ .or() string · แม้ .eq ด้านล่างจะ error อยู่แล้ว)
  if (!/^\d+$/.test(String(bnId))) return notFound("ไม่พบใบวางบิล");
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, billing_installments(id)")
    .eq("id", bnId)
    .single<{ id: number; billing_installments: { id: number }[] }>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");

  const instIds = (bn.billing_installments ?? []).map((i) => i.id);

  const orParts = [`billing_note_id.eq.${bnId}`];
  if (instIds.length > 0) orParts.push(`installment_id.in.(${instIds.join(",")})`);

  const { data: receipts, error } = await ctx.supabase
    .from("receipts")
    .select("id, code, issue_date, amount, net")
    .eq("is_voided", false)
    .or(orParts.join(","));
  if (error) throw new Error(error.message);

  return ok({ receipts: receipts ?? [] });
});
