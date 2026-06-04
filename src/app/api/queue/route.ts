import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Supabase generics ซับซ้อนเกินไปสำหรับ chaining แบบมีเงื่อนไข — ใช้ as any เหมือน /api/jobs
type Sb = { from: (t: string) => any };

const SELECT = "*, sales:sales_id(id,name,code,team)";
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// "" -> null (กัน date/uuid/number ว่างทำ DB พัง) ก่อนเข้า zod
function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));
}

const entrySchema = z.object({
  status: z.enum(["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"]).nullish(),
  queue_date: z.string().nullish(),
  queue_time: z.string().regex(TIME_RE, "รูปแบบเวลาต้องเป็น HH:MM").nullish(),
  job_type: z.string().nullish(),
  sales_id: z.string().uuid().nullish(),
  line_contact: z.string().nullish(),
  customer_name: z.string().min(1, "กรุณาระบุชื่อลูกค้า"),
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

// GET /api/queue — รายการคิว + รายชื่อเซลล์ (สำหรับ dropdown)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;
  const canWrite = can(ctx.role, "queue", "write");

  const { data: salesRows } = await sb.from("queue_sales").select("*").eq("active", true).order("team").order("name");

  let query = sb.from("queue_entries").select(SELECT)
    .order("queue_date", { ascending: true, nullsFirst: true })
    .order("queue_time", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  // เซลล์เห็นเฉพาะคิวของตัวเอง (ผูกผ่าน queue_sales.profile_id) — RLS กันชั้น DB ด้วย
  let unlinked = false;
  if (!canWrite && ctx.role === "SALES") {
    const mine = (salesRows ?? []).find((s: any) => s.profile_id === ctx.user.id);
    if (mine) query = query.eq("sales_id", mine.id);
    else unlinked = true;
  }

  const rows = unlinked ? [] : (await query).data ?? [];

  return ok(rows, { can_write: canWrite, role: ctx.role, unlinked, sales: salesRows ?? [] });
});

// POST /api/queue — สร้างคิวใหม่ (ADMIN)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = entrySchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb.from("queue_entries")
    .insert({ ...body, status: body.status ?? "PENDING", created_by: ctx.user.id })
    .select(SELECT).single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(400, "สร้างคิวไม่สำเร็จ");
  return created(data);
});
