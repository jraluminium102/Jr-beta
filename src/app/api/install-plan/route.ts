import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/install-plan?from=YYYY-MM-DD&to=YYYY-MM-DD
// คืน { teams, assignments(ในช่วง+ข้อมูลงาน), ready(งานผลิตเสร็จ รอจัดคิว) }
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "read");
  const u = new URL(req.url);
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  if (!from || !to) return err("ต้องระบุ from/to", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const SCHED = ["QUEUED", "MANUFACTURING", "QC", "READY", "ISSUE"];
  const [teamsR, asgR, readyR, prodBookR, adhocBookR] = await Promise.all([
    sb.from("install_teams").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    sb.from("install_assignments").select("*, jobs(*)").gte("date", from).lte("date", to).order("date", { ascending: true }),
    sb.from("installations").select("id, job_id, status, install_scheduled, jobs(*)").eq("status", "PENDING"),
    // "จองจากผลิต" — งานในระบบที่ตั้งวันติดตั้งตอนผลิต (planned_install_date) ในช่วงเดือนนี้ (0021/0024)
    sb.from("productions").select("id, job_id, planned_install_date, status, job:job_id(job_code, customer_name, customer_area, status)")
      .not("planned_install_date", "is", null).gte("planned_install_date", from).lte("planned_install_date", to).in("status", SCHED),
    // "จองจากผลิต" — งานจดเอง (adhoc) ที่ตั้งวันติดตั้ง
    sb.from("adhoc_production_tasks").select("id, title, customer_name, install_date, status")
      .not("install_date", "is", null).gte("install_date", from).lte("install_date", to).neq("status", "DONE"),
  ]);

  // งานที่ถูกจัดคิวติดตั้งจริงแล้ว (มีแถว install_assignments) → ไม่ต้องโชว์ overlay "จองจากผลิต" ซ้ำ
  const assignedJobIds = new Set((asgR.data ?? []).map((a: { job_id: string | null }) => a.job_id).filter(Boolean));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booked = [
    ...((prodBookR.data ?? []) as any[])
      .filter((p) => p.job && p.job.status !== "CANCELLED" && !assignedJobIds.has(p.job_id))
      .map((p) => ({ kind: "job" as const, id: p.id, job_id: p.job_id, date: p.planned_install_date, customer_name: p.job.customer_name, job_code: p.job.job_code, customer_area: p.job.customer_area, prod_status: p.status })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((adhocBookR.data ?? []) as any[])
      .map((a) => ({ kind: "adhoc" as const, id: a.id, job_id: null, date: a.install_date, customer_name: a.customer_name || a.title, job_code: null, customer_area: null, prod_status: a.status })),
  ];

  return ok({
    teams: teamsR.data ?? [],
    assignments: asgR.data ?? [],
    ready: readyR.data ?? [],
    booked,
  });
});
