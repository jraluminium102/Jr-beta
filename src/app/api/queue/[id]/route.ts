import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
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
  target_job_id: z.string().uuid().nullish(), // (0044) เคลียร์แบบ
  clear_revise: z.boolean().optional(),       // (0044) toggle "มีแก้ใบเสนอ+แบบ" — ไม่ใช่คอลัมน์ DB
});

const PRE_DEPOSIT = ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"];

// PATCH /api/queue/[id] — แก้ไขคิว (ADMIN) · updated_at อัปเดตอัตโนมัติด้วย trigger
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const rawBody = patchSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  // แยก field ที่ไม่ใช่คอลัมน์ DB ออกก่อน update (กัน DB error)
  const { clear_revise, ...body } = rawBody;

  // resolve พิกัดเมื่อแก้ลิงก์โลเคชั่นแต่ไม่ได้ส่ง lat/lng มาเอง
  if (body.location_url && (body.lat == null || body.lng == null)) {
    const co = await resolveMapLink(body.location_url);
    if (co) { body.lat = co.lat; body.lng = co.lng; }
  }
  const clientSentCoords = typeof body.lat === "number" || typeof body.lng === "number";
  if ((body.location_url === null || body.location_url === "") && !clientSentCoords) {
    body.lat = null;
    body.lng = null;
  }

  const { data, error } = await sb.from("queue_entries")
    .update(body).eq("id", params.id).select(SELECT).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "ไม่พบคิวนี้ (อาจถูกลบไปแล้ว)");

  // ─── DONE handling ──────────────────────────────────────────────────────────
  if (body.status === "DONE") {
    const jt: string = ((data as { job_type?: string | null }).job_type ?? "").trim();
    const isClearRevise = jt === "เคลียร์แบบ";
    const isAssess = !isClearRevise && (jt === "" || jt === "ประเมินหน้างาน" || jt === "ประเมิน");

    // [BUG-1 Route guard] เคลียร์แบบต้องมี target_job_id ก่อนปิดงาน
    if (isClearRevise) {
      const tid = (data as { target_job_id?: string | null }).target_job_id;
      if (!tid) throw new HttpError(400, "เคลียร์แบบต้องเลือกงานเดิมก่อนปิดงาน");
    }

    // โชว์รูม / อื่นๆ ที่ไม่ใช่ 2 path หลัก → ปิดคิวเฉยๆ
    if (!isClearRevise && !isAssess) {
      return ok(data);
    }

    // เรียก RPC — idempotent ลองใหม่ได้
    const { data: jobId, error: pErr } = await (ctx.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc("promote_queue_to_job", { p_queue_id: params.id });
    if (pErr) throw dbError(pErr);

    if (!jobId) return ok(data, { job_id: null });

    // ─── path เคลียร์แบบ ──────────────────────────────────────────────────
    if (isClearRevise) {
      if (clear_revise !== false) {
        // set design_state = REVISING + bump revise count (ถ้ายังไม่ REVISING)
        // + coalesce design_start = today
        const today = new Date().toISOString().slice(0, 10);
        const { data: jrow } = await sb.from("jobs")
          .select("design_state, design_start, design_revise_count")
          .eq("id", jobId)
          .maybeSingle();
        const jr = jrow as {
          design_state?: string;
          design_start?: string | null;
          design_revise_count?: number;
        } | null;

        const alreadyRevising = jr?.design_state === "REVISING";
        await sb.from("jobs").update({
          design_state: "REVISING",
          design_revise_count: alreadyRevising
            ? (jr?.design_revise_count ?? 0)
            : (jr?.design_revise_count ?? 0) + 1,
          design_start: jr?.design_start ?? today,
          // อย่าล้าง quote_sent_date — งานกลับเข้าใบเสนอตาม flow เดิม
        }).eq("id", jobId);

        await audit({
          jobId,
          userId: ctx.user.id,
          action: "CLEAR_REVISE_QUEUE_DONE",
          table: "jobs",
          recordId: jobId,
          newValue: {
            design_state: "REVISING",
            triggered_by_queue: params.id,
          },
        });
      }
      return ok(data, { job_id: jobId });
    }

    // ─── path ประเมินหน้างาน ──────────────────────────────────────────────
    // คืนชีพงานที่ถูก cancel ก่อนเริ่มจริง (idempotent)
    const { data: jrow2 } = await sb.from("jobs")
      .select("status, design_state, current_stage").eq("id", jobId).maybeSingle();
    const jr2 = jrow2 as { status?: string; design_state?: string; current_stage?: number } | null;
    if (jr2 && jr2.status === "CANCELLED" && jr2.design_state === "NOT_STARTED" && (jr2.current_stage ?? 0) <= 2) {
      await sb.from("jobs").update({ status: "LEAD" }).eq("id", jobId);
    }

    // ─── wiring มัดจำหน้างาน (ฟีเจอร์ A) ────────────────────────────────
    if (body.payment === "มัดจำหน้างาน") {
      // โหลดสถานะปัจจุบัน (อาจเพิ่งเป็น LEAD จาก cancel-revive ข้างบน)
      const { data: jobCurrent } = await sb.from("jobs")
        .select("status").eq("id", jobId).maybeSingle();
      const currentStatus = (jobCurrent as { status?: string } | null)?.status ?? "";

      if (PRE_DEPOSIT.includes(currentStatus)) {
        const today = new Date().toISOString().slice(0, 10);
        const { error: depErr } = await sb.from("jobs").update({
          status: "DEPOSITED",
          deposit_date: today,
          onsite_deposit: true,
          // deposit_amount = null → trigger tg_on_deposit สร้าง production ข้าม finance
        }).eq("id", jobId);

        if (!depErr) {
          await audit({
            jobId,
            userId: ctx.user.id,
            action: "ONSITE_DEPOSIT_QUEUE_DONE",
            table: "jobs",
            recordId: jobId,
            newValue: {
              status: "DEPOSITED",
              deposit_date: today,
              onsite_deposit: true,
              deposit_amount: null,
            },
          });
        }
        // best-effort: ไม่ throw ถ้า deposit update พัง (แจ้ง admin ทีหลังได้)
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
