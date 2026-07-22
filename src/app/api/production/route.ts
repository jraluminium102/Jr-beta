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

  // ใบตัดต่องาน (0094) — query แยก (พังไม่กระทบตารางหลัก) → ชิปกดเปิดบนการ์ด
  const jobIds = (data ?? []).map((p: Record<string, unknown>) => p.job_id as string | null).filter((x): x is string => !!x);
  const cutsByJob: Record<string, { id: number; code: string | null; name: string; status: string }[]> = {};
  if (jobIds.length) {
    const { data: cuts } = await ctx.supabase.from("cutlists").select("id, code, name, status, job_id").in("job_id", jobIds);
    for (const c of (cuts ?? []) as Record<string, unknown>[]) {
      (cutsByJob[c.job_id as string] ??= []).push({ id: c.id as number, code: (c.code as string) ?? null, name: (c.name as string) ?? "", status: (c.status as string) ?? "draft" });
    }
  }

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
      return { ...p, job: jobRest, cutlists: p.job_id ? (cutsByJob[p.job_id as string] ?? []) : [] };
    });

  // งานจดเอง (adhoc · 0023) — โผล่หน้าผลิตออฟฟิศด้วย (เดิมโผล่แค่ตารางช่าง → ลูกค้าที่เพิ่มเองหายไป · เจ้าของสั่ง 22 ก.ค.69)
  const { data: adhoc } = await ctx.supabase
    .from("adhoc_production_tasks")
    .select("id, title, customer_name, produce_date, install_date, producer_note, status, created_at")
    .neq("status", "DONE")
    .order("created_at", { ascending: false });

  return ok(rows, { can_write: can(ctx.role, "production", "write"), adhoc: adhoc ?? [] });
});
