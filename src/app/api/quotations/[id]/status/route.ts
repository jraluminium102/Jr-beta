import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import type { QuotationStatus } from "@/lib/types";

const VALID: QuotationStatus[] = ["draft", "sent", "approved", "cancelled"];

// PATCH /api/quotations/[id]/status  { status }
// ถอยสถานะ approved→sent/draft → บล็อกถ้ามี billing_note active
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "write");

  const body = await req.json().catch(() => ({}));
  const status = body.status as QuotationStatus;
  if (!VALID.includes(status)) return err("สถานะไม่ถูกต้อง", 400);

  const qId = params.id;

  // ดึงสถานะปัจจุบัน
  const { data: q, error: qErr } = await ctx.supabase
    .from("quotations")
    .select("id, status")
    .eq("id", qId)
    .single<{ id: number; status: QuotationStatus }>();
  if (qErr || !q) return notFound("ไม่พบใบเสนอราคา");

  // บล็อกการถอย approved → (sent/draft) ถ้ามีบิล active
  // ถอยสถานะทั้งที่มีใบวางบิล — ไม่บล็อกแล้ว (เจ้าของสั่ง 1 ก.ย.69 · 0133)
  //   ใบวางบิลเป็นเอกสารของตัวเอง ไม่ได้อ่านสถานะใบเสนอมาคิดยอด ถอยสถานะจึงไม่ทำบิลเพี้ยน
  //   คืนรายชื่อบิลที่ยังใช้งานอยู่ไปให้หน้าจอเตือนแทน
  const isRollback = q.status === "approved" && (status === "sent" || status === "draft");
  let warnBn: string[] = [];
  if (isRollback) {
    const { data: activeBn } = await ctx.supabase
      .from("billing_notes")
      .select("id, code")
      .eq("quotation_id", qId)
      .neq("status", "cancelled");
    warnBn = ((activeBn ?? []) as { code: string }[]).map((b) => b.code);
  }

  const { data, error } = await ctx.supabase
    .from("quotations")
    .update({ status })
    .eq("id", qId)
    .select("id, status")
    .single();
  if (error) throw new Error(error.message);

  await audit({
    userId: ctx.user.id,
    action: "STATUS_QUOTATION",
    table: "quotations",
    recordId: qId,
    oldValue: { status: q.status },
    newValue: { status },
  });

  return ok({ ...data, warnBillingNotes: warnBn });
});
