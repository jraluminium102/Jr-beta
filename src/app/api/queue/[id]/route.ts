import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const SELECT = "*, sales:sales_id(id,name,code,team)";
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
  line_contact: z.string().nullish(),
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
  note_admin: z.string().nullish(),
  note_ai: z.string().nullish(),
});

// PATCH /api/queue/[id] — แก้ไขคิว (ADMIN) · updated_at อัปเดตอัตโนมัติด้วย trigger
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const body = patchSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb.from("queue_entries")
    .update(body).eq("id", params.id).select(SELECT).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "ไม่พบคิวนี้ (อาจถูกลบไปแล้ว)");

  // เข้าประเมินเสร็จ (DONE) → carry-forward เป็น customer + job ครั้งเดียว (idempotent ที่ DB)
  if (body.status === "DONE") {
    const { data: jobId, error: pErr } = await (ctx.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc("promote_queue_to_job", { p_queue_id: params.id });
    if (pErr) return ok(data, { promote_error: pErr.message });
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
