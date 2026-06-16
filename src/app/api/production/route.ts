import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// GET /api/production — ตารางงานผลิตทั้งหมด (สำหรับช่าง) + ข้อมูลงาน + วันสำคัญ + BOQ summary
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const { data, error } = await ctx.supabase
    .from("productions")
    .select(`id, job_id, status, status_updated_at, created_at, planned_install_date, measure_scheduled, measure_actual, measure_actual_time, measured_by_name, measure_time, measurer_id, measurer_name, production_queued, production_done, qc_result, qc_date, qc_note, producer_note, notes,
      job:job_id(job_code, customer_name, customer_area, status, deposit_date,
        boqs(id, status, boq_items(id))
      )`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // ตัดงานที่ถูกยกเลิกออก + แปลง boqs → boq_summary (id, status, item_count)
  const rows = (data ?? [])
    .filter((p: Record<string, unknown>) => {
      const job = p.job as { status?: string } | null;
      return job?.status !== "CANCELLED";
    })
    .map((p: Record<string, unknown>) => {
      const job = p.job as Record<string, unknown> | null;
      const boqs = (job?.boqs as { id: number; status: string; boq_items: unknown[] }[] | null) ?? [];
      // ใช้ BOQ ล่าสุด (เรียง id desc — id เป็น serial)
      const latestBoq = boqs.length > 0
        ? boqs.reduce((a, b) => (b.id > a.id ? b : a))
        : null;
      const boq_summary = latestBoq
        ? { id: latestBoq.id, status: latestBoq.status, item_count: latestBoq.boq_items.length }
        : null;
      // ตัด boqs ออกจาก job ก่อน return เพื่อไม่ให้ payload พอง
      let jobRest: Record<string, unknown> | null = null;
      if (job) {
        const { boqs: _b, ...rest } = job as Record<string, unknown>;
        void _b;
        jobRest = rest;
      }
      return { ...p, job: jobRest, boq_summary };
    });

  return ok(rows, { can_write: can(ctx.role, "production", "write") });
});
