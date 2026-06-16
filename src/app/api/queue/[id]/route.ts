import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { resolveMapLink } from "@/lib/queue-geo";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const SELECT = "*, sales:sales_id(id,name,code,team), assistant:assistant_id(id,name,code)";
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));
}

const patchSchema = z.object({
  status: z.enum(["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"]).nullish(),
  queue_date: z.string().nullish(),
  queue_time: z.string().regex(TIME_RE, "รูปแบบเวลาต้องเป็น HH:MM").nullish(),
  job_type: z.string().nullish(),
  sales_id: z.string().uuid().nullish(),
  assistant_id: z.string().uuid().nullish(),
  line_contact: z.string().nullish(),
  contact_channel: z.enum(["LINE", "FB"]).optional(),
  customer_name: z.string().min(1).optional(),
  tel: z.string().nullish(),
  address: z.string().nullish(),
  location_url: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  job_count: z.number().int().nullish(),
  assess_fee: z.number().nullish(),
  payment: z.string().nullish(),
  receipt_done: z.boolean().optional(),
  fee_paid: z.boolean().optional(),
  note_admin: z.string().nullish(),
  note_ai: z.string().nullish(),
});

// PATCH /api/queue/[id] — แก้ไขคิว (ADMIN) · updated_at อัปเดตอัตโนมัติด้วย trigger
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const body = patchSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  // resolve พิกัดเมื่อแก้ลิงก์โลเคชั่นแต่ไม่ได้ส่ง lat/lng มาเอง
  if (body.location_url && (body.lat == null || body.lng == null)) {
    const co = await resolveMapLink(body.location_url);
    if (co) { body.lat = co.lat; body.lng = co.lng; }
  }
  // ลบพิกัดเมื่อลบ location_url ออก (และ client ไม่ได้ส่ง lat/lng มาเอง)
  // body.lat/lng ที่มาจาก client จะเป็น number ถ้าส่งมาเอง — ถ้า nullish แสดงว่าไม่ได้ส่ง
  const clientSentCoords = typeof body.lat === "number" || typeof body.lng === "number";
  if ((body.location_url === null || body.location_url === "") && !clientSentCoords) {
    body.lat = null;
    body.lng = null;
  }

  const { data, error } = await sb.from("queue_entries")
    .update(body).eq("id", params.id).select(SELECT).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "ไม่พบคิวนี้ (อาจถูกลบไปแล้ว)");

  // เข้าประเมินเสร็จ (DONE) → carry-forward เป็น customer + job ครั้งเดียว (idempotent ที่ DB)
  // เฉพาะ "ประเมินหน้างาน" เท่านั้น · โชว์รูม/อื่นๆ = ปิดคิวเฉยๆ ไม่เข้า flow ลูกค้า
  if (body.status === "DONE") {
    const jt: string = ((data as { job_type?: string | null }).job_type ?? "").trim();
    const isAssess = jt === "" || jt === "ประเมินหน้างาน" || jt === "ประเมิน";
    if (!isAssess) return ok(data); // ไม่สร้างลูกค้า/งาน

    const { data: jobId, error: pErr } = await (ctx.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc("promote_queue_to_job", { p_queue_id: params.id });
    if (pErr) throw dbError(pErr);   // ให้รู้ทันทีว่า carry-forward ไม่สำเร็จ (idempotent ลองใหม่ได้)

    // คืนชีพงานที่ผูกอยู่ ถ้าเคยถูกยกเลิกแบบ "ยังไม่เริ่มงานเลย" (เช่น โดนเคลียร์ข้อมูล)
    // promote เป็น idempotent → ถ้าคิวเคย promote แล้วงานโดน cancel จะคืน job เดิม(cancelled) ไม่สร้างใหม่
    // → กด DONE จะไม่เด้งเข้า flow แบบ · เงื่อนไขเข้ม: NOT_STARTED + stage<=2 (กันคืนชีพงานที่ยกเลิกจริงหลังทำไปแล้ว)
    if (jobId) {
      const { data: jrow } = await sb.from("jobs")
        .select("status, design_state, current_stage").eq("id", jobId).maybeSingle();
      const jr = jrow as { status?: string; design_state?: string; current_stage?: number } | null;
      if (jr && jr.status === "CANCELLED" && jr.design_state === "NOT_STARTED" && (jr.current_stage ?? 0) <= 2) {
        await sb.from("jobs").update({ status: "LEAD" }).eq("id", jobId);
      }
    }
    return ok(data, { job_id: jobId });
  }
  return ok(data);
});

// DELETE /api/queue/[id] — ลบคิว (ADMIN) · เช็คว่ามีแถวจริงก่อนคืน success
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb.from("queue_entries").delete().eq("id", params.id).select("id");
  if (error) throw dbError(error);
  if (!data || data.length === 0) throw new HttpError(404, "ไม่พบคิวที่จะลบ");
  return ok({ id: params.id });
});
