import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { derivePhase, phaseSince, daysSince, overdueDays, type PhaseKey } from "@/lib/followup";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };

// GET /api/followup — ติดตามงานลูกค้าทุกคน: เฟสปัจจุบัน + วันค้าง + ปัญหา
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "read");
  const url = new URL(req.url);
  const phaseF = url.searchParams.get("phase");
  const q = url.searchParams.get("q");
  const onlyIssue = url.searchParams.get("issue") === "1";
  const onlyOverdue = url.searchParams.get("overdue") === "1";

  const sb = ctx.supabase as unknown as Sb;
  let query = sb.from("jobs")
    .select("id,job_code,customer_name,customer_tel,customer_area,status,current_stage,design_state,on_hold,updated_at,created_at," +
      "estimator:estimator_id(full_name)," +
      "productions(status,status_updated_at,planned_install_date)," +
      "installations(status,updated_at),issues(status,severity)")
    .order("updated_at", { ascending: false });
  if (q) query = query.or(`customer_name.ilike.%${q}%,job_code.ilike.%${q}%`);
  if (url.searchParams.get("my") === "1") query = query.eq("estimator_id", ctx.user.id); // เฉพาะงานของฉัน

  const { data, error } = await query;
  if (error) throw dbError(error);

  let rows = (data ?? []).map((j: any) => {
    const phase = derivePhase(j) as PhaseKey;
    const days = daysSince(phaseSince(j));
    const issues = (j.issues ?? []) as { status: string; severity: string }[];
    const open = issues.filter((i) => i.status !== "CLOSED");
    const prod = Array.isArray(j.productions) ? j.productions[0] : j.productions;
    return {
      id: j.id, job_code: j.job_code, customer_name: j.customer_name,
      customer_tel: j.customer_tel, customer_area: j.customer_area, status: j.status,
      estimator: j.estimator?.full_name ?? null, on_hold: !!j.on_hold,
      phase, days_in_phase: days, overdue: !j.on_hold && days > overdueDays(phase),
      open_issues: open.length, high_issue: open.some((i) => i.severity === "HIGH"),
      planned_install_date: prod?.planned_install_date ?? null,
    };
  });

  if (phaseF) rows = rows.filter((r) => r.phase === phaseF);
  if (onlyIssue) rows = rows.filter((r) => r.open_issues > 0);
  if (onlyOverdue) rows = rows.filter((r) => r.overdue && r.phase !== "CANCELLED");

  // เรียง: ค้างนานก่อน (overdue → วันค้างมาก) ยกเว้นยกเลิกไว้ท้าย
  rows.sort((a, b) => {
    if ((a.phase === "CANCELLED") !== (b.phase === "CANCELLED")) return a.phase === "CANCELLED" ? 1 : -1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.days_in_phase - a.days_in_phase;
  });

  const activeRows = rows.filter((r) => r.phase !== "CANCELLED");
  return ok(rows, {
    total: rows.length,
    overdue: activeRows.filter((r) => r.overdue).length,
    with_issues: activeRows.filter((r) => r.open_issues > 0).length,
  });
});
