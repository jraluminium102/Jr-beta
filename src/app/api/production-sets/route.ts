import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// หมายเหตุ: planned_install_date อยู่บนตาราง productions ไม่ใช่ jobs — ห้ามใส่ใน jobs embed (PostgREST error)
const SELECT =
  "*, job:job_id(job_code, customer_name, customer_area, status, current_stage)";

// GET /api/production-sets?job_id= — รายการชุดงานผลิต (กรองตามงานได้)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as Sb;
  const jobId = new URL(req.url).searchParams.get("job_id");
  let qy = sb.from("production_sets").select(SELECT);
  if (jobId) qy = qy.eq("job_id", jobId);
  const { data, error } = await qy
    .order("seq", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw dbError(error);
  return ok(data ?? [], { can_write: can(ctx.role, "production", "write") });
});

const createSchema = z.object({
  job_id: z.string().uuid(),
  set_label: z.string().optional(),
  seq: z.number().int().optional(),
});

// POST /api/production-sets — เพิ่มชุดงานเข้าแผนผลิต
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const body = createSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  // prefill จาก job: คนวัด/วันวัดจริง/วันติดตั้ง จาก productions ถ้ามี
  const { data: prod } = await sb
    .from("productions")
    .select("measure_actual, measurer_name, planned_install_date")
    .eq("job_id", body.job_id)
    .maybeSingle();

  const { data, error } = await sb
    .from("production_sets")
    .insert({
      job_id: body.job_id,
      set_label: body.set_label ?? "",
      seq: body.seq ?? 0,
      measure_actual: prod?.measure_actual ?? null,
      measurer_name: prod?.measurer_name ?? "",
      install_date: prod?.planned_install_date ?? null,
      created_by: ctx.user.id,
    })
    .select(SELECT)
    .single();
  if (error) throw dbError(error);
  if (!data) return err("เพิ่มชุดงานไม่สำเร็จ", 500);
  return ok(data, undefined, 201);
});
