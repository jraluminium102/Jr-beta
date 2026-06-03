import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

export const GET = withRoute(async () => {
  const ctx = await requirePermission("dashboard", "read");
  const sb = ctx.supabase;
  const now = new Date();

  const [{ data: jobs }, { data: fin }, { data: issues }, { data: prods }] = await Promise.all([
    sb.from("jobs").select("status, total_amount, deposit_date, assess_date, job_code, customer_name"),
    sb.from("finance_entries").select("amount, payment_date").eq("is_voided", false),
    sb.from("issues").select("status"),
    sb.from("productions").select("status, status_updated_at, created_at, job:job_id(job_code, customer_name, status)"),
  ]);

  const J = jobs ?? []; const F = fin ?? []; const I = issues ?? []; const P = prods ?? [];

  const jobsByStatus: Record<string, number> = {};
  J.forEach((j: any) => { jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1; });

  const totalClosed = J.filter((j: any) => ["DEPOSITED", "COMPLETED"].includes(j.status))
    .reduce((s: number, j: any) => s + Number(j.total_amount ?? 0), 0);
  const collected = F.reduce((s: number, f: any) => s + Number(f.amount), 0);

  // monthly 6 เดือน
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, "yyyy-MM") };
  });
  const monthlyRevenue = months.map(({ start, end, label }) => {
    const inRange = (s?: string) => s && new Date(s) >= start && new Date(s) <= end;
    const quoted = J.filter((j: any) => inRange(j.assess_date) && j.status !== "CANCELLED").reduce((s: number, j: any) => s + Number(j.total_amount ?? 0), 0);
    const closed = J.filter((j: any) => inRange(j.deposit_date)).reduce((s: number, j: any) => s + Number(j.total_amount ?? 0), 0);
    const got = F.filter((f: any) => inRange(f.payment_date)).reduce((s: number, f: any) => s + Number(f.amount), 0);
    return { month: label, quoted, closed, collected: got, outstanding: closed - got };
  });

  const active = J.filter((j: any) => j.status !== "CANCELLED").length;
  const won = J.filter((j: any) => ["DEPOSITED", "COMPLETED"].includes(j.status)).length;
  const closeRate = active ? Math.round((won / active) * 100) : 0;

  // overdue: production ไม่อัพเดท > 7 วัน (ไม่ READY/COMPLETED/CANCELLED)
  const sevenAgo = new Date(now.getTime() - 7 * 864e5);
  const overdueAll = P.filter((p: any) => {
    const last = p.status_updated_at ? new Date(p.status_updated_at) : new Date(p.created_at);
    const jobStatus = p.job?.status;
    return p.status !== "READY" && !["COMPLETED", "CANCELLED"].includes(jobStatus) && last < sevenAgo;
  }).map((p: any) => {
    const last = p.status_updated_at ? new Date(p.status_updated_at) : new Date(p.created_at);
    return { jobCode: p.job?.job_code, customerName: p.job?.customer_name, days: Math.floor((now.getTime() - last.getTime()) / 864e5) };
  }).sort((a: any, b: any) => b.days - a.days);

  return ok({
    jobsByStatus, totalClosed, collected, outstanding: totalClosed - collected, closeRate,
    monthlyRevenue,
    openIssues: I.filter((i: any) => i.status !== "CLOSED").length,
    closedIssues: I.filter((i: any) => i.status === "CLOSED").length,
    overdueJobs: overdueAll.slice(0, 10),
    overdueTotal: overdueAll.length,
  });
});
