import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// GET /api/production — ตารางงานผลิตทั้งหมด (สำหรับช่าง) + ข้อมูลงาน + วันสำคัญ
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const baseCols = `id, job_id, status, status_updated_at, created_at, planned_install_date, measure_scheduled, measure_actual, measure_actual_time, measured_by_name, measure_time, measurer_id, measurer_name, production_queued, production_due_date, production_done, qc_result, qc_date, qc_note, producer_note, notes`;
  let { data, error } = await ctx.supabase
    .from("productions")
    .select(`${baseCols},
      job:job_id(job_code, customer_name, customer_area, status, deposit_date, floor_work, floor_note,
        job_blocker_notes(id, tag, note, source, created_at)
      )`)
    .order("created_at", { ascending: false });
  // กันพัง: ตาราง job_blocker_notes (0098) ยังไม่รัน → query ทั้งก้อนล้ม = หน้างานผลิตทั้งหน้าโชว์ 0
  // (เจอจริงบน production 16 ก.ค.69) → ตัด join นั้นออกแล้วดึงใหม่ — โน้ตแค่ยังไม่โชว์ หน้าหลักต้องรอด
  if (error && /job_blocker_notes/i.test(error.message ?? "")) {
    ({ data, error } = await ctx.supabase
      .from("productions")
      .select(`${baseCols},
        job:job_id(job_code, customer_name, customer_area, status, deposit_date, floor_work, floor_note)`)
      .order("created_at", { ascending: false }));
  }
  if (error) throw new Error(error.message);

  // ตัดงานที่ถูกยกเลิกออก + เรียง blocker_notes เก่า→ใหม่ (PostgREST ไม่การันตี order ของ embed)
  const rows = (data ?? [])
    .filter((p: Record<string, unknown>) => {
      const job = p.job as { status?: string } | null;
      return job?.status !== "CANCELLED";
    })
    .map((p: Record<string, unknown>) => {
      const job = p.job as Record<string, unknown> | null;
      let jobRest: Record<string, unknown> | null = null;
      if (job) {
        const { job_blocker_notes, ...rest } = job as Record<string, unknown> & { job_blocker_notes?: { created_at: string }[] };
        const sortedNotes = [...(job_blocker_notes ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
        jobRest = { ...rest, job_blocker_notes: sortedNotes };
      }
      return { ...p, job: jobRest };
    });

  return ok(rows, { can_write: can(ctx.role, "production", "write") });
});
