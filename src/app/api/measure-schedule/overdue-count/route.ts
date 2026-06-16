import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

// GET /api/measure-schedule/overdue-count
// คืน { count } — งาน PENDING_MEASURE ที่นัดแล้ว วันผ่านแล้ว ยังไม่วัด (job ไม่ CANCELLED)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const today = new Date().toISOString().slice(0, 10);

  // ดึง id + job status เฉพาะ production ที่ overdue
  // count+join ซับซ้อนกับ Supabase generic types → ดึง rows มานับใน JS ให้ชัวร์
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any)
    .from("productions")
    .select("id, job:job_id(status)")
    .eq("status", "PENDING_MEASURE")
    .not("measure_scheduled", "is", null)
    .lt("measure_scheduled", today);

  if (error) throw new Error((error as { message: string }).message);

  // ตัด job CANCELLED ออก
  const rows = (data ?? []) as { id: string; job: { status?: string } | null }[];
  const count = rows.filter((p) => p.job?.status !== "CANCELLED").length;

  return ok({ count });
});
