import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { derivePhase, PHASE_ORDER } from "@/lib/followup";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const num = (v: unknown) => Number(v ?? 0) || 0;

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — สถิติช่วงเวลา (default = ปีนี้)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("dashboard", "read");
  const sb = ctx.supabase as unknown as Sb;
  const url = new URL(req.url);

  const now = new Date();
  const from = url.searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const fromT = new Date(from + "T00:00:00").getTime();
  const toT = new Date(to + "T23:59:59").getTime();
  const inRange = (s?: string | null) => { if (!s) return false; const t = new Date(s).getTime(); return t >= fromT && t <= toT; };

  const [{ data: jobs }, { data: fin }, { data: issues }, { data: qitems }, { data: qentries }, { data: qsales }] = await Promise.all([
    sb.from("jobs").select("status, net_amount, total_amount, deposit_date, assess_date, channel, customer_name, estimator_id, estimator:estimator_id(full_name), queue_entry_id, productions(status), installations(status)"),
    sb.from("finance_entries").select("amount, payment_date").eq("is_voided", false),
    sb.from("issues").select("phase, severity, status, created_at"),
    sb.from("quotation_items").select("name, qty, category, line_total, quotation_id, quotation:quotation_id(issue_date, status, job:job_id(status))"),
    sb.from("queue_entries").select("id, job_id, customer_name, sales_id"),
    sb.from("queue_sales").select("id, name"),
  ]);

  const J = jobs ?? [], F = fin ?? [], I = issues ?? [], QI = qitems ?? [];
  // หาเซลล์ที่เข้าหน้างานจากคิว — งาน import ผูกคิวคนละทาง (บางอันมี jobs.queue_entry_id,
  // บางอันมีแค่ queue_entries.job_id ย้อนกลับ, บางอัน FK ขาดเลย) → map 3 ชั้น (เลี่ยง nested embed ambiguous)
  const salesIdToName = new Map<string, string>((qsales ?? []).map((s: any) => [s.id, s.name]));
  const qeFwd = new Map<string, string>();   // queue_entries.id → เซลล์ (jobs.queue_entry_id)
  const qeByJob = new Map<string, string>(); // queue_entries.job_id → เซลล์ (FK ย้อนกลับ)
  const qeByName = new Map<string, string>(); // customer_name → เซลล์ (fallback ชื่อลูกค้า เมื่อ FK ขาด)
  (qentries ?? []).forEach((q: any) => {
    const nm = q.sales_id ? salesIdToName.get(q.sales_id) : undefined;
    if (!nm) return;
    qeFwd.set(q.id, nm);
    if (q.job_id) qeByJob.set(q.job_id, nm);
    if (q.customer_name) qeByName.set(String(q.customer_name).trim(), nm);
  });
  const queueSalesOf = (j: any): string | null =>
    qeByJob.get(j.id)
    ?? (j.queue_entry_id ? qeFwd.get(j.queue_entry_id) : undefined)
    ?? (j.customer_name ? qeByName.get(String(j.customer_name).trim()) : undefined)
    ?? null;
  const WON = ["DEPOSITED", "COMPLETED", "IN_PRODUCTION", "INSTALLING"];

  // งานในช่วง (อิงวันเข้าประเมิน) ที่ไม่ยกเลิก
  const inJobs = J.filter((j: any) => inRange(j.assess_date) && j.status !== "CANCELLED");
  // wonJobs อิง assess_date เดียวกัน เพื่อให้ฐานตรงกับ close_rate (ไม่เกิน 100%)
  const wonJobs = inJobs.filter((j: any) => WON.includes(j.status));

  const summary = {
    jobs: inJobs.length,
    won: wonJobs.length,
    close_rate: inJobs.length ? Math.round((wonJobs.length / inJobs.length) * 100) : 0,
    revenue_closed: wonJobs.reduce((s: number, j: any) => s + num(j.net_amount), 0), // net = ก่อน VAT (ยอดขายจริง) ให้ตรง byCategory
    collected: F.filter((f: any) => inRange(f.payment_date)).reduce((s: number, f: any) => s + num(f.amount), 0),
  };

  // รายเดือน (ในช่วง — ตามเดือนของ assess/deposit/payment)
  const monthKeys: string[] = [];
  { const d = new Date(fromT); d.setDate(1); while (d.getTime() <= toT && monthKeys.length < 36) { monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() + 1); } }
  const mk = (s?: string | null) => (s ? s.slice(0, 7) : "");
  const byMonth = monthKeys.map((m) => ({
    month: m,
    quoted: J.filter((j: any) => mk(j.assess_date) === m && j.status !== "CANCELLED").reduce((s: number, j: any) => s + num(j.net_amount), 0),
    closed: J.filter((j: any) => mk(j.deposit_date) === m).reduce((s: number, j: any) => s + num(j.net_amount), 0),
    collected: F.filter((f: any) => mk(f.payment_date) === m).reduce((s: number, f: any) => s + num(f.amount), 0),
  }));

  // ปิดการขายต่อเซลล์ — ใช้ estimator ถ้ามี, ไม่งั้น fallback เซลล์ที่เข้าหน้างานจากคิว (queue_entries.sales)
  const salesMap: Record<string, { name: string; jobs: number; won: number; revenue: number }> = {};
  inJobs.forEach((j: any) => {
    const estName = j.estimator?.full_name ?? null;
    const queueName = queueSalesOf(j);                    // เซลล์ที่เข้าประเมินหน้างาน (จากคิว — 3 ชั้น)
    const key = j.estimator_id ? `e:${j.estimator_id}` : queueName ? `q:${queueName}` : "none";
    const name = estName ?? queueName ?? "ไม่ระบุ";
    salesMap[key] ??= { name, jobs: 0, won: 0, revenue: 0 };
    salesMap[key].jobs++;
    if (WON.includes(j.status)) { salesMap[key].won++; salesMap[key].revenue += num(j.net_amount); }
  });
  const bySales = Object.values(salesMap).map((s) => ({ ...s, close_rate: s.jobs ? Math.round((s.won / s.jobs) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // funnel ตามเฟส (ภาพรวมปัจจุบัน ไม่ยกเลิก)
  const phaseCount: Record<string, number> = {};
  J.filter((j: any) => j.status !== "CANCELLED").forEach((j: any) => { const p = derivePhase(j); phaseCount[p] = (phaseCount[p] ?? 0) + 1; });
  const funnel = PHASE_ORDER.map((p) => ({ phase: p, count: phaseCount[p] ?? 0 }));

  // ช่องทางลูกค้า
  const chMap: Record<string, number> = {};
  inJobs.forEach((j: any) => { chMap[j.channel ?? "OTHER"] = (chMap[j.channel ?? "OTHER"] ?? 0) + 1; });
  const byChannel = Object.entries(chMap).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

  // ประเภทงานนิยม (จากรายการในใบเสนอราคา ในช่วง) top 10
  const itemMap: Record<string, number> = {};
  QI.filter((it: any) => inRange(it.quotation?.issue_date) && it.quotation?.status !== "cancelled").forEach((it: any) => {
    const name = (it.name ?? "").trim(); if (!name) return;
    itemMap[name] = (itemMap[name] ?? 0) + num(it.qty);
  });
  const topItems = Object.entries(itemMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // สินค้าขายดีตามหมวด (0046) — แยก "เสนอราคา" (ทุกใบไม่ยกเลิก) vs "ขายได้" (งาน status=WON)
  // นับงาน = distinct quotation_id · ยอด = sum(line_total) · เฉพาะรายการที่มี category
  type CatAgg = { category: string; quoted_revenue: number; sold_revenue: number; _q: Set<unknown>; _s: Set<unknown> };
  const catMap: Record<string, CatAgg> = {};
  let uncategorized = 0;
  QI.forEach((it: any) => {
    const q = it.quotation;
    if (!q || q.status === "cancelled" || !inRange(q.issue_date)) return;
    const cat = (it.category ?? "").trim();
    if (!cat) { uncategorized++; return; }
    const lt = num(it.line_total);
    const m = (catMap[cat] ??= { category: cat, quoted_revenue: 0, sold_revenue: 0, _q: new Set(), _s: new Set() });
    m.quoted_revenue += lt; m._q.add(it.quotation_id);
    if (q.job && WON.includes(q.job.status)) { m.sold_revenue += lt; m._s.add(it.quotation_id); }
  });
  const byCategory = Object.values(catMap)
    .map((m) => ({ category: m.category, quoted_revenue: m.quoted_revenue, quoted_jobs: m._q.size, sold_revenue: m.sold_revenue, sold_jobs: m._s.size }))
    .sort((a, b) => b.sold_revenue - a.sold_revenue || b.quoted_revenue - a.quoted_revenue);

  // ปัญหา แยกเฟส/ความรุนแรง (ในช่วง)
  const inIssues = I.filter((i: any) => inRange(i.created_at));
  const issuesByPhase: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  inIssues.forEach((i: any) => {
    issuesByPhase[i.phase] = (issuesByPhase[i.phase] ?? 0) + 1;
    if (i.severity in issuesBySeverity) issuesBySeverity[i.severity]++;
  });

  return ok({
    range: { from, to },
    summary, byMonth, bySales, funnel, byChannel, topItems,
    byCategory, uncategorizedItems: uncategorized,
    issues: {
      total: inIssues.length,
      open: inIssues.filter((i: any) => i.status !== "CLOSED").length,
      byPhase: issuesByPhase, bySeverity: issuesBySeverity,
    },
  });
});
