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
    .select("id, status, job_id")
    .eq("id", qId)
    .single<{ id: number; status: QuotationStatus; job_id: string | null }>();
  if (qErr || !q) return notFound("ไม่พบใบเสนอราคา");

  // 1 งาน = 1 ใบเสนอ (16 ต.ค.69): กู้ใบที่ยกเลิกกลับมา ขณะงานมีใบอื่นใช้งานอยู่ = ปนอีก → ไม่ให้ (DB 0156 ล็อกซ้ำ)
  if (q.status === "cancelled" && status !== "cancelled" && q.job_id) {
    const { data: others } = await ctx.supabase.from("quotations").select("code")
      .eq("job_id", q.job_id).neq("status", "cancelled").neq("id", qId).limit(3);
    const codes = ((others ?? []) as { code: string }[]).map((o) => o.code);
    if (codes.length) return err(`กู้ใบนี้กลับไม่ได้ — งานนี้มีใบเสนอ ${codes.join(", ")} ใช้งานอยู่แล้ว (1 งาน = 1 ใบเสนอ) · ยกเลิกใบนั้นก่อน หรือออกใบใหม่เป็นออเดอร์ใหม่`, 409);
  }

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
