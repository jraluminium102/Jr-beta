import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// GET /api/production — ตารางงานผลิตทั้งหมด (สำหรับช่าง) + ข้อมูลงาน + วันสำคัญ
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const { data, error } = await ctx.supabase
    .from("productions")
    .select("id, job_id, status, status_updated_at, created_at, planned_install_date, measure_scheduled, measure_actual, production_queued, production_done, qc_result, notes, job:job_id(job_code, customer_name, customer_area, status)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // ตัดงานที่ถูกยกเลิกออก
  const rows = (data ?? []).filter((p: Record<string, unknown>) => {
    const job = p.job as { status?: string } | null;
    return job?.status !== "CANCELLED";
  });

  return ok(rows, { can_write: can(ctx.role, "production", "write") });
});
