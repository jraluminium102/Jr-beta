import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { regenSetsFromQuotation } from "@/lib/production/regen-sets";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };
type Sb = { from: (t: string) => any };

/**
 * Rev. หลังมัดจำ (0169)
 *   GET  /api/jobs/[id]/rev-review            → ประวัติรีวิว Rev ของงาน (ล่าสุดก่อน)
 *   POST /api/jobs/[id]/rev-review            → ฝ่ายผลิต "รับทราบ" {review_id, note?, sets?: "regen"|"keep"}
 *        sets=regen → ดึงชุดผลิตใหม่จากใบเสนอ Rev ล่าสุด (แทนที่ชุด auto · สถานะผลิตของชุดรีเซ็ต) ก่อนปิดรีวิว
 */
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("job_rev_reviews").select("*").eq("job_id", params.id).order("created_at", { ascending: false }).limit(20);
  if (error) return ok([]);   // ยังไม่รัน 0169
  return ok(data ?? []);
});

const ackSchema = z.object({
  review_id: z.number().int().positive(),
  note: z.string().max(300).optional(),
  sets: z.enum(["regen", "keep"]).optional(),
});

export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;
  const body = ackSchema.parse(await req.json().catch(() => ({})));

  const { data: rv, error: rErr } = await sb.from("job_rev_reviews").select("id, job_id, quotation_id, rev_no, ack_at, sets_regen").eq("id", body.review_id).maybeSingle();
  if (rErr) return err("ยังไม่ได้รัน migration 0169 (Rev หลังมัดจำ)", 400);
  if (!rv || rv.job_id !== params.id) return notFound("ไม่พบรายการ Rev ของงานนี้");
  if (rv.ack_at) return err("รายการนี้รับทราบไปแล้ว", 409);

  let regen: unknown = null;
  if (body.sets === "regen") {
    // ดึงชุดใหม่จากใบเสนอที่ Rev — replace ชุด auto (คงชุดที่เพิ่มมือ) · force ข้าม guard ชุดปนหลายใบ (ฝ่ายผลิตตัดสินใจเองแล้ว)
    regen = await regenSetsFromQuotation(sb, params.id, ctx.user.id, { replace: true, quotationId: Number(rv.quotation_id), force: true });
  }

  // claim: ปิดได้คนเดียว (กดซ้ำ/2 คนพร้อมกัน → คนหลัง 409)
  const { data: won, error: uErr } = await sb.from("job_rev_reviews").update({
    ack_at: new Date().toISOString(), ack_by: ctx.user.id, ack_by_name: ctx.profile.full_name ?? "",
    ack_note: String(body.note ?? "").trim().slice(0, 300), ack_sets: body.sets ?? "",
  }).eq("id", body.review_id).is("ack_at", null).select("id");
  if (uErr) return err("บันทึกรับทราบไม่สำเร็จ: " + uErr.message, 500);
  if (!(won ?? []).length) return err("รายการนี้เพิ่งถูกรับทราบโดยคนอื่น", 409);

  await audit({ jobId: params.id, userId: ctx.user.id, action: "JOB_REV_ACK", table: "job_rev_reviews", recordId: String(body.review_id),
    newValue: { rev_no: rv.rev_no, sets: body.sets ?? "", note: body.note ?? "", by: ctx.profile.full_name ?? "" } });
  return ok({ id: body.review_id, regen });
});
