import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const SELECT = "*, job:job_id(job_code, customer_name, current_stage)";

// GET /api/floor-queue — รายการคิวงานพื้นทั้งหมด (เรียงวันที่ → bucket → sort_order)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("floor_queue", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("floor_queue_entries")
    .select(SELECT)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("bucket", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw dbError(error);
  return ok(data ?? [], { can_write: can(ctx.role, "floor_queue", "write") });
});

const createSchema = z.object({
  job_id: z.string().uuid().nullish(),
  customer_name: z.string().trim().optional(),
  work_desc: z.string().optional(),
  extra_note: z.string().optional(),
  duration_note: z.string().optional(),
  scheduled_date: z.string().nullish(),
  start_time: z.string().optional(),
  status: z.enum(["confirmed", "wait_cf", "wait_cf_jr"]).optional(),
  bucket: z.enum(["scheduled", "after_jr", "deposit_wait"]).optional(),
  kind: z.enum(["work", "assess"]).optional(),
  sort_order: z.number().int().optional(),
});

// POST /api/floor-queue — เพิ่มคิวใหม่ (ผูกงาน JR หรือพิมพ์ชื่อลูกค้าเองก็ได้)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("floor_queue", "write");
  const body = createSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  let customerName = body.customer_name?.trim() || "";
  if (body.job_id && !customerName) {
    const { data: job } = await sb.from("jobs").select("customer_name").eq("id", body.job_id).maybeSingle();
    customerName = job?.customer_name?.trim() || "";
  }
  if (!customerName) return err("กรุณาระบุชื่อลูกค้า (หรือเลือกงาน JR ที่มีชื่อลูกค้า)", 422);

  const insertRow = {
    job_id: body.job_id ?? null,
    customer_name: customerName,
    work_desc: body.work_desc ?? "",
    extra_note: body.extra_note ?? "",
    duration_note: body.duration_note ?? "",
    scheduled_date: body.scheduled_date || null,
    start_time: body.start_time || "09:00",
    status: body.status ?? "confirmed",
    bucket: body.bucket ?? (body.scheduled_date ? "scheduled" : "deposit_wait"),
    kind: body.kind ?? "work",
    sort_order: body.sort_order ?? 0,
  };

  const { data, error } = await sb.from("floor_queue_entries").insert(insertRow).select(SELECT).single();
  if (error) {
    if (error.code === "23505") return err("งานนี้อยู่ในคิวอยู่แล้ว (ผูกได้แค่ 1 แถวต่องาน)", 409);
    throw dbError(error);
  }
  if (!data) return err("เพิ่มคิวไม่สำเร็จ", 500);
  return created(data);
});
