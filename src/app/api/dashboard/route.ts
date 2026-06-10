import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { STAGE_GROUP } from "@/lib/stages";

// Ops dashboard — work-tracking only (no revenue / finance_entries).
// All monetary stats are intentionally omitted; see stats page for those.

export const GET = withRoute(async () => {
  const ctx = await requirePermission("dashboard", "read");
  const sb = ctx.supabase;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sevenAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [{ data: jobs }, { data: prods }, { data: issues }] = await Promise.all([
    sb.from("jobs").select(
      "id, job_code, customer_name, status, current_stage, updated_at, on_hold, design_due_date, design_state"
    ),
    sb.from("productions").select(
      "job_id, planned_install_date, status, status_updated_at, created_at, job:job_id(job_code, customer_name, status)"
    ),
    sb.from("issues").select("id, status, severity, phase, detail, due_date, reported_at, job_id"),
  ]);

  const J = jobs ?? [];
  const P = prods ?? [];
  const I = issues ?? [];

  // ── 1. Jobs by status ──────────────────────────────────────────────────────
  const jobsByStatus: Record<string, number> = {};
  J.forEach((j: any) => {
    jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;
  });

  // ── 2. Jobs by stage group (ขาย / มัดจำ / ผลิต / ติดตั้ง) ────────────────
  // Exclude CANCELLED / COMPLETED from operational view
  const activeJobs = J.filter((j: any) => !["CANCELLED", "COMPLETED"].includes(j.status));
  const jobsByStageGroup: Record<string, number> = {};
  activeJobs.forEach((j: any) => {
    const grp = STAGE_GROUP[j.current_stage as number] ?? "อื่นๆ";
    jobsByStageGroup[grp] = (jobsByStageGroup[grp] ?? 0) + 1;
  });

  // ── 3. งานค้างเกิน 7 วัน ─────────────────────────────────────────────────
  // วัด "ไม่ขยับขั้นจริง" โดยใช้ productions.status_updated_at ถ้ามี
  // (ป้องกัน false-positive: งานที่ขยับ production แต่ updated_at ของ jobs ยังเก่า)
  const prodLastMap = new Map<string, Date>();
  P.forEach((p: any) => {
    const ts = p.status_updated_at ?? p.created_at;
    if (!ts) return;
    const d = new Date(ts);
    const prev = prodLastMap.get(p.job_id);
    if (!prev || d > prev) prodLastMap.set(p.job_id, d);
  });

  const staleJobs = activeJobs
    .filter((j: any) => {
      if (j.on_hold) return false;
      // ถ้ามี production record ให้ใช้ status_updated_at ของ production แทน
      const last = prodLastMap.get(j.id) ?? (j.updated_at ? new Date(j.updated_at) : null);
      return last && last < sevenAgo;
    })
    .map((j: any) => {
      const last = prodLastMap.get(j.id) ?? new Date(j.updated_at);
      return {
        jobCode: j.job_code as string,
        customerName: j.customer_name as string,
        status: j.status as string,
        days: Math.floor((now.getTime() - last.getTime()) / 86_400_000),
      };
    })
    .sort((a: any, b: any) => b.days - a.days);

  // ── 4. เลยกำหนด ───────────────────────────────────────────────────────────
  // 4a. Design overdue: design_due_date < today AND design_state != DONE AND active
  const designOverdue = activeJobs.filter((j: any) =>
    j.design_due_date && j.design_due_date < today && j.design_state !== "DONE"
  ).map((j: any) => ({
    jobCode: j.job_code as string,
    customerName: j.customer_name as string,
    type: "design" as const,
    dueDate: j.design_due_date as string,
    days: Math.floor((now.getTime() - new Date(j.design_due_date).getTime()) / 86_400_000),
  }));

  // 4b. Install overdue: planned_install_date < today AND production status != READY
  const installOverdue = P.filter((p: any) => {
    const jobStatus = (p.job as any)?.status;
    if (["CANCELLED", "COMPLETED"].includes(jobStatus)) return false;
    if (p.status === "READY") return false;
    return p.planned_install_date && p.planned_install_date < today;
  }).map((p: any) => ({
    jobCode: (p.job as any)?.job_code as string,
    customerName: (p.job as any)?.customer_name as string,
    type: "install" as const,
    dueDate: p.planned_install_date as string,
    days: Math.floor((now.getTime() - new Date(p.planned_install_date).getTime()) / 86_400_000),
  }));

  // Merge + deduplicate by jobCode (prefer design if duplicate)
  const overdueMap = new Map<string, typeof designOverdue[number] | typeof installOverdue[number]>();
  [...installOverdue, ...designOverdue].forEach((o) => {
    if (!overdueMap.has(o.jobCode) || o.type === "design") overdueMap.set(o.jobCode, o);
  });
  const overdueJobs = [...overdueMap.values()].sort((a, b) => b.days - a.days);

  // ── 5. Issues ─────────────────────────────────────────────────────────────
  const openIssues = I.filter((i: any) => i.status !== "CLOSED");
  const closedIssues = I.filter((i: any) => i.status === "CLOSED");

  // Count by severity (open only)
  const issuesBySeverity: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  openIssues.forEach((i: any) => {
    issuesBySeverity[i.severity] = (issuesBySeverity[i.severity] ?? 0) + 1;
  });

  // Issues overdue (due_date < today and not CLOSED)
  const issuesOverdue = openIssues.filter(
    (i: any) => i.due_date && i.due_date < today
  ).length;

  // Top open issues (by severity then reported_at oldest first), capped at 8
  const SEV_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const topIssues = [...openIssues]
    .sort((a: any, b: any) =>
      (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) ||
      new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()
    )
    .slice(0, 8)
    .map((i: any) => ({
      id: i.id as string,
      phase: i.phase as string,
      severity: i.severity as string,
      detail: (i.detail as string).slice(0, 60),
      dueDate: i.due_date as string | null,
      overdue: !!(i.due_date && i.due_date < today),
    }));

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalActive = activeJobs.length;
  const onHoldCount = activeJobs.filter((j: any) => j.on_hold).length;

  return ok({
    // operational counts
    totalActive,
    onHoldCount,
    jobsByStatus,
    jobsByStageGroup,
    // stale work
    staleJobs: staleJobs.slice(0, 10),
    staleTotal: staleJobs.length,
    // overdue deadlines
    overdueJobs: overdueJobs.slice(0, 10),
    overdueTotal: overdueJobs.length,
    // issues
    openIssuesCount: openIssues.length,
    closedIssuesCount: closedIssues.length,
    issuesBySeverity,
    issuesOverdue,
    topIssues,
  });
});
