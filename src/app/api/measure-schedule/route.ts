import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

// GET /api/measure-schedule
// คืนรายการนัดวัดหน้างาน (PENDING_MEASURE ที่มี measure_scheduled + ที่ไม่มี)
// join: jobs (customer_name, customer_area, customer_tel, job_code) + profiles (measurer)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");

  // ดึง PENDING_MEASURE ทั้งหมด (นัดแล้ว + รอนัด) และ MEASURED ล่าสุด 7 วัน (อ้างอิง)
  const { data, error } = await ctx.supabase
    .from("productions")
    .select(`
      id,
      job_id,
      status,
      measure_scheduled,
      measure_time,
      measure_actual,
      measure_actual_time,
      measured_by_name,
      measurer_id,
      measurer_name,
      job:job_id(job_code, customer_name, customer_area, customer_tel, status),
      measurer:measurer_id(full_name)
    `)
    .in("status", ["PENDING_MEASURE", "MEASURED"])
    .order("measure_scheduled", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  // ตัดงานที่ job ถูกยกเลิก
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const rows = (data ?? [])
    .filter((p) => {
      const job = p.job as { status?: string } | null;
      if (job?.status === "CANCELLED") return false;
      // MEASURED แสดงเฉพาะ 7 วันล่าสุด (อ้างอิง)
      if (p.status === "MEASURED") {
        return p.measure_actual != null && p.measure_actual >= sevenDaysAgo;
      }
      return true; // PENDING_MEASURE ทั้งหมด
    })
    .map((p) => {
      const job = p.job as { job_code?: string; customer_name?: string; customer_area?: string | null; customer_tel?: string | null } | null;
      const measurer = p.measurer as { full_name?: string | null } | null;
      // ใช้ measurer_name (free-text 0040) เป็นหลัก — fallback ชื่อจาก profile
      const displayMeasurerName = (p.measurer_name as string | null) ?? measurer?.full_name ?? null;
      return {
        production_id: p.id,
        job_id: p.job_id,
        job_code: job?.job_code ?? null,
        customer_name: job?.customer_name ?? null,
        customer_area: job?.customer_area ?? null,
        customer_tel: job?.customer_tel ?? null,
        measure_scheduled: p.measure_scheduled,
        measure_time: p.measure_time ?? null,
        measure_actual: p.measure_actual ?? null,
        measure_actual_time: (p.measure_actual_time as string | null) ?? null,
        measured_by_name: (p.measured_by_name as string | null) ?? null,
        measurer_name: displayMeasurerName,
        measurer_id: p.measurer_id,
        status: p.status,
        // สถานะเลยนัดแล้วยังไม่วัด
        is_overdue: p.status === "PENDING_MEASURE" && p.measure_scheduled != null && p.measure_scheduled < today,
      };
    });

  // เรียง: PENDING_MEASURE นัดแล้ว → เรียง date + time, PENDING_MEASURE ไม่มีนัด, MEASURED
  const scheduled   = rows.filter((r) => r.status === "PENDING_MEASURE" && r.measure_scheduled != null);
  const unscheduled = rows.filter((r) => r.status === "PENDING_MEASURE" && r.measure_scheduled == null);
  const measured    = rows.filter((r) => r.status === "MEASURED");

  // เรียง scheduled: date asc → time asc (null last)
  scheduled.sort((a, b) => {
    const da = a.measure_scheduled ?? "9999";
    const db = b.measure_scheduled ?? "9999";
    if (da !== db) return da.localeCompare(db);
    const ta = a.measure_time ?? "99:99";
    const tb = b.measure_time ?? "99:99";
    return ta.localeCompare(tb);
  });

  // เรียง measured: measure_actual desc (ล่าสุดขึ้นก่อน)
  measured.sort((a, b) => (b.measure_actual ?? "").localeCompare(a.measure_actual ?? ""));

  return ok({
    scheduled,
    unscheduled,
    measured,
    today,
  });
});
