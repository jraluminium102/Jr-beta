import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { derivePhase, phaseSince, daysSince, overdueDays, type PhaseKey } from "@/lib/followup";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };

// stage ranges ตาม group
const GROUP_RANGES: Record<string, [number, number]> = {
  production: [9, 19],
  install:    [20, 24],
};

// GET /api/followup — ติดตามงานลูกค้า (ตัด stage≤2 LEAD + CANCELLED ออก)
// params:
//   ?group=production|install — กรองตาม current_stage range
//   ?issue=1                  — เฉพาะงานที่มี open_issues>0 (ทุก stage 3-24)
//   ?phase=                   — กรอง PhaseKey (backward compat)
//   ?q=                       — ค้นชื่อ/job_code
//   ?my=1                     — เฉพาะงานของฉัน (estimator_id=user)
//   ?overdue=1                — เฉพาะงานค้างนาน
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "read");
  const url = new URL(req.url);
  const phaseF = url.searchParams.get("phase");
  const groupF = url.searchParams.get("group");
  const q = url.searchParams.get("q");
  const onlyIssue = url.searchParams.get("issue") === "1";
  const onlyOverdue = url.searchParams.get("overdue") === "1";

  const sb = ctx.supabase as unknown as Sb;
  let query = sb.from("jobs")
    .select("id,job_code,customer_name,customer_tel,customer_area,status,current_stage,design_state,on_hold,remark,updated_at,created_at," +
      "estimator:estimator_id(full_name)," +
      "productions(status,status_updated_at,planned_install_date)," +
      "installations(status,updated_at),issues(status,severity)," +
      "quotations!quotations_job_id_fkey(net,created_at)")
    .order("updated_at", { ascending: false });

  // ตัด LEAD (stage ≤ 2) และ CANCELLED ออก
  query = query.gte("current_stage", 3).not("status", "eq", "CANCELLED");

  if (q) query = query.or(`customer_name.ilike.%${q}%,job_code.ilike.%${q}%`);
  if (url.searchParams.get("my") === "1") query = query.eq("estimator_id", ctx.user.id);

  // group filter ใช้ range กรองตาม current_stage
  if (groupF && GROUP_RANGES[groupF]) {
    const [lo, hi] = GROUP_RANGES[groupF];
    query = query.gte("current_stage", lo).lte("current_stage", hi);
  }

  const { data, error } = await query;
  if (error) throw dbError(error);

  let rows = (data ?? []).map((j: any) => {
    const phase = derivePhase(j) as PhaseKey;
    const days = daysSince(phaseSince(j));
    const issues = (j.issues ?? []) as { status: string; severity: string }[];
    const open = issues.filter((i) => i.status !== "CLOSED");
    const prod = Array.isArray(j.productions) ? j.productions[0] : j.productions;
    const quos: any[] = Array.isArray(j.quotations) ? j.quotations : (j.quotations ? [j.quotations] : []);
    const latestQ = quos.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
    const has_billed = quos.some((qq: any) => {
      const bn = qq?.billing_notes;
      return Array.isArray(bn) ? bn.length > 0 : !!bn;
    });
    return {
      id: j.id, job_code: j.job_code, customer_name: j.customer_name,
      customer_tel: j.customer_tel, customer_area: j.customer_area, status: j.status,
      current_stage: j.current_stage as number,
      remark: (j.remark as string | null) ?? null,
      estimator: j.estimator?.full_name ?? null, on_hold: !!j.on_hold,
      phase, days_in_phase: days, overdue: !j.on_hold && days > overdueDays(phase),
      open_issues: open.length, high_issue: open.some((i) => i.severity === "HIGH"),
      planned_install_date: prod?.planned_install_date ?? null,
      net: latestQ?.net ?? null,
      has_billed,
    };
  });

  if (phaseF) rows = rows.filter((r) => r.phase === phaseF);
  if (onlyIssue) rows = rows.filter((r) => r.open_issues > 0);
  if (onlyOverdue) rows = rows.filter((r) => r.overdue);

  // เรียง: high_issue ก่อน → overdue → days_in_phase มาก → on_hold ท้าย
  rows.sort((a, b) => {
    if (a.on_hold !== b.on_hold) return a.on_hold ? 1 : -1;
    if (a.high_issue !== b.high_issue) return a.high_issue ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.days_in_phase - a.days_in_phase;
  });

  const activeRows = rows;
  const maxDays = activeRows.length ? Math.max(...activeRows.map((r) => r.days_in_phase)) : 0;
  return ok(rows, {
    total: rows.length,
    overdue: activeRows.filter((r) => r.overdue).length,
    with_issues: activeRows.filter((r) => r.open_issues > 0).length,
    high_issues: activeRows.filter((r) => r.high_issue).length,
    max_days: maxDays,
  });
});
