import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";
import { derivePhase, PHASE_ORDER, overdueDays } from "@/lib/followup";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { buildSalesResolver } from "@/lib/sales-resolve";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const num = (v: unknown) => Number(v ?? 0) || 0;

// นับวันแบบ inclusive-diff (a→b) จาก date string — ใช้กับระยะเวลาเขียนแบบ/ทำใบเสนอ
function dayDiff(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a + "T00:00:00").getTime();
  const tb = new Date(b + "T00:00:00").getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10 : 0);

// ดึง "พื้นที่" (เขต/อำเภอ/จังหวัด) จากที่อยู่เต็ม — ที่อยู่ไทยหลายอันไม่มีเว้นวรรค เลยตัดที่คำหลัก/ตัวเลข
function extractArea(raw?: string | null): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // ตัดหางตั้งแต่คำจังหวัด/รหัสไปรษณีย์/ตัวเลข (กันเก็บชื่อยาวเกิน)
  const cut = (t: string) => {
    const i = t.search(/กรุงเทพ|กทม|จังหวัด|จ\.|แขวง|ตำบล|ต\.|รหัส|\d/);
    return (i > 0 ? t.slice(0, i) : t).trim();
  };
  let m: RegExpMatchArray | null;
  if ((m = s.match(/เขต\s*([ก-๙].*)/))) { const v = cut(m[1]); if (v) return "เขต" + v; }
  if ((m = s.match(/จังหวัด\s*([ก-๙]+)/))) return m[1];
  if ((m = s.match(/(?:^|[^ก-๙])จ\.\s*([ก-๙]+)/))) return m[1];
  if ((m = s.match(/อำเภอ\s*([ก-๙].*)/))) { const v = cut(m[1]); if (v) return "อ." + v; }
  if ((m = s.match(/(?:^|[^ก-๙])อ\.\s*([ก-๙]+)/))) return "อ." + m[1];
  if (/กรุงเทพ|กทม/.test(s)) return "กรุงเทพฯ";
  // ค่าที่พิมพ์เองสั้น ๆ (เช่น "บางนา") ใช้ตรง ๆ · ยาวเกินตัดให้สั้น
  return s.length > 16 ? s.slice(0, 16) + "…" : s;
}

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — สถิติ + KPI ช่วงเวลา (default = ปีนี้)
//   money จะถูกซ่อน (null) ถ้า role ไม่มีสิทธิ์ดูฟิลด์การเงิน (jobs:finance_fields)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("dashboard", "read");
  const sb = ctx.supabase as unknown as Sb;
  const showFinance = can(ctx.role, "jobs:finance_fields", "read");
  const mask = (n: number): number | null => (showFinance ? n : null);
  const url = new URL(req.url);

  const now = new Date();
  const from = url.searchParams.get("from") || `${now.getFullYear()}-01-01`;
  const to = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const fromT = new Date(from + "T00:00:00").getTime();
  const toT = new Date(to + "T23:59:59").getTime();
  const inRange = (s?: string | null) => { if (!s) return false; const t = new Date(s).getTime(); return t >= fromT && t <= toT; };
  const today = now.toISOString().slice(0, 10);

  // ── ดึงข้อมูล (แบ่งหน้า กัน cap 1,000 แถว — ตารางพวกนี้โตเกิน 1,000 ได้) ──
  const [jobs, fin, issues, quotations, qitems, salesOf, queueRows, custRows] = await Promise.all([
    fetchAllPaged<any>((f, t) => sb.from("jobs")
      .select("id, job_code, status, current_stage, net_amount, deposit_date, deposit_amount, assess_date, quote_sent_date, design_state, design_start, design_end, design_due_date, on_hold, customer_area, customer_id, customer_name, channel, estimator_id, estimator:estimator_id(full_name), designer_ref, designer_lookup:designer_ref(name), queue_entry_id, productions(status), installations(status)")
      .order("id", { ascending: true }).range(f, t)),
    fetchAllPaged<any>((f, t) => sb.from("finance_entries")
      .select("amount, payment_date").eq("is_voided", false)
      .order("id", { ascending: true }).range(f, t)),
    fetchAllPaged<any>((f, t) => sb.from("issues")
      .select("phase, severity, status, created_at")
      .order("id", { ascending: true }).range(f, t)),
    fetchAllPaged<any>((f, t) => sb.from("quotations")
      .select("id, issue_date, status")
      .order("id", { ascending: true }).range(f, t)),
    fetchAllPaged<any>((f, t) => sb.from("quotation_items")
      .select("name, qty, category, line_total, quotation_id, quotation:quotation_id(issue_date, status, job:job_id(status))")
      .order("id", { ascending: true }).range(f, t)),
    buildSalesResolver(sb),
    // ที่อยู่หน้างานจริง (สำหรับ "พื้นที่") — customer_area มักว่าง ต้องดึงจากคิว/ทะเบียนลูกค้า
    fetchAllPaged<any>((f, t) => sb.from("queue_entries")
      .select("id, job_id, customer_name, address")
      .order("id", { ascending: true }).range(f, t)),
    fetchAllPaged<any>((f, t) => sb.from("customers")
      .select("id, address")
      .order("id", { ascending: true }).range(f, t)),
  ]);

  const J = jobs ?? [], F = fin ?? [], I = issues ?? [], QI = qitems ?? [], QT = quotations ?? [];
  const WON = ["DEPOSITED", "COMPLETED", "IN_PRODUCTION", "INSTALLING"];
  const isWon = (j: any) => WON.includes(j.status);
  const salesNameOf = (j: any): string =>
    salesOf({ id: j.id, queue_entry_id: j.queue_entry_id, customer_name: j.customer_name, estimator_name: j.estimator?.full_name ?? null }) ?? "ไม่ระบุ";

  // ── resolver ที่อยู่หน้างาน (fallback: customer_area พิมพ์เอง → คิว(job_id/queue_entry_id/ชื่อ) → ทะเบียนลูกค้า) ──
  const qAddrByJob = new Map<string, string>();
  const qAddrByQe = new Map<string, string>();
  const qAddrByName = new Map<string, string>();
  (queueRows ?? []).forEach((q: any) => {
    const addr = String(q.address ?? "").trim();
    if (!addr) return;
    if (q.job_id) qAddrByJob.set(q.job_id, addr);
    qAddrByQe.set(q.id, addr);
    if (q.customer_name) qAddrByName.set(String(q.customer_name).trim(), addr);
  });
  const custAddrById = new Map<string, string>();
  (custRows ?? []).forEach((c: any) => { const a = String(c.address ?? "").trim(); if (a) custAddrById.set(String(c.id), a); });
  const addressOf = (j: any): string => {
    const manual = String(j.customer_area ?? "").trim();
    if (manual) return manual;
    return qAddrByJob.get(j.id)
      ?? (j.queue_entry_id ? qAddrByQe.get(j.queue_entry_id) : undefined)
      ?? (j.customer_name ? qAddrByName.get(String(j.customer_name).trim()) : undefined)
      ?? (j.customer_id != null ? custAddrById.get(String(j.customer_id)) : undefined)
      ?? "";
  };

  // งานในช่วง (อิงวันเข้าประเมิน) ที่ไม่ยกเลิก · won อิงฐานเดียวกันเพื่อให้ close_rate ไม่เกิน 100%
  const inJobs = J.filter((j: any) => inRange(j.assess_date) && j.status !== "CANCELLED");
  const wonJobs = inJobs.filter(isWon);

  // ── summary ──
  const collected = F.filter((f: any) => inRange(f.payment_date)).reduce((s: number, f: any) => s + num(f.amount), 0);
  const revenue_closed = wonJobs.reduce((s: number, j: any) => s + num(j.net_amount), 0);

  // ใบเสนอราคาในช่วง (ไม่ยกเลิก · มีรายการอย่างน้อย 1) + สัดส่วน "นอกระบบ"
  //   นอกระบบ = ไม่มีรายการที่ผ่านเครื่องคิดราคาเลย (category ว่างทั้งใบ = พิมพ์เอง/นำเข้า)
  const catByQuote = new Map<string, boolean>();      // quotation_id → มีรายการที่มี category (คิดจากระบบ)
  const quoteHasItems = new Set<string>();            // ใบที่มีรายการจริง (กันใบร่างเปล่านับเป็นนอกระบบ)
  QI.forEach((it: any) => {
    const qid = String(it.quotation_id);
    quoteHasItems.add(qid);
    const hasCat = !!(it.category ?? "").trim();
    catByQuote.set(qid, (catByQuote.get(qid) ?? false) || hasCat);
  });
  const inQuotes = QT.filter((q: any) => inRange(q.issue_date) && q.status !== "cancelled" && quoteHasItems.has(String(q.id)));
  const extQuotes = inQuotes.filter((q: any) => !catByQuote.get(String(q.id)));   // นอกระบบ = ไม่มีรายการคิดจากระบบเลย
  const ext_pct = inQuotes.length ? Math.round((extQuotes.length / inQuotes.length) * 1000) / 10 : 0;

  const summary = {
    jobs: inJobs.length,
    won: wonJobs.length,
    close_rate: inJobs.length ? Math.round((wonJobs.length / inJobs.length) * 100) : 0,
    revenue_closed: mask(revenue_closed),
    collected: mask(collected),
    quotations: inQuotes.length,
    ext_quotes: extQuotes.length,
    ext_pct,
  };

  // ── รายเดือน (เสนอ vs ปิด vs เก็บ) ──
  const monthKeys: string[] = [];
  { const d = new Date(fromT); d.setDate(1); while (d.getTime() <= toT && monthKeys.length < 36) { monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() + 1); } }
  const mk = (s?: string | null) => (s ? s.slice(0, 7) : "");
  const byMonth = monthKeys.map((m) => ({
    month: m,
    quoted: mask(J.filter((j: any) => mk(j.assess_date) === m && j.status !== "CANCELLED").reduce((s: number, j: any) => s + num(j.net_amount), 0)),
    closed: mask(J.filter((j: any) => mk(j.deposit_date) === m && j.status !== "CANCELLED").reduce((s: number, j: any) => s + num(j.net_amount), 0)),
    collected: mask(F.filter((f: any) => mk(f.payment_date) === m).reduce((s: number, f: any) => s + num(f.amount), 0)),
  }));

  // ── สถานที่ (ดึงเขต/อำเภอ/จังหวัด จากที่อยู่หน้างานจริง) — งานในช่วง ──
  const areaMap: Record<string, { area: string; jobs: number; won: number; revenue: number }> = {};
  let areaUnknown = 0;
  inJobs.forEach((j: any) => {
    const area = extractArea(addressOf(j));
    if (!area) { areaUnknown++; return; }
    const m = (areaMap[area] ??= { area, jobs: 0, won: 0, revenue: 0 });
    m.jobs++;
    if (isWon(j)) { m.won++; m.revenue += num(j.net_amount); }
  });
  const byArea = Object.values(areaMap)
    .sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue)
    .slice(0, 15)
    .map((a) => ({ area: a.area, jobs: a.jobs, won: a.won, revenue: mask(a.revenue) }));

  // ── funnel (ภาพรวมปัจจุบัน ไม่ยกเลิก) ──
  const phaseCount: Record<string, number> = {};
  J.filter((j: any) => j.status !== "CANCELLED").forEach((j: any) => { const p = derivePhase(j); phaseCount[p] = (phaseCount[p] ?? 0) + 1; });
  const funnel = PHASE_ORDER.map((p) => ({ phase: p, count: phaseCount[p] ?? 0 }));

  // ── ช่องทางลูกค้า ──
  const chMap: Record<string, number> = {};
  inJobs.forEach((j: any) => { chMap[j.channel ?? "OTHER"] = (chMap[j.channel ?? "OTHER"] ?? 0) + 1; });
  const byChannel = Object.entries(chMap).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

  // ── ประเภทงานนิยม (จากรายการใบเสนอราคาในช่วง) top 10 ──
  const itemMap: Record<string, number> = {};
  QI.filter((it: any) => inRange(it.quotation?.issue_date) && it.quotation?.status !== "cancelled").forEach((it: any) => {
    const name = (it.name ?? "").trim(); if (!name) return;
    itemMap[name] = (itemMap[name] ?? 0) + num(it.qty);
  });
  const topItems = Object.entries(itemMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // ── สินค้าขายดีตามหมวด — เสนอ (ทุกใบ) vs ขายได้ (งาน WON) ──
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
    .map((m) => ({ category: m.category, quoted_revenue: mask(m.quoted_revenue), quoted_jobs: m._q.size, sold_revenue: mask(m.sold_revenue), sold_jobs: m._s.size }))
    .sort((a, b) => (b.sold_revenue ?? 0) - (a.sold_revenue ?? 0) || (b.quoted_revenue ?? 0) - (a.quoted_revenue ?? 0));

  // ════════ KPI ════════

  // ── เซลล์รายคน: เข้างาน / ส่งใบเสนอ / มัดจำ / ยอดขาย / อัตราปิด ──
  //   key ด้วยชื่อที่ resolve แล้วเสมอ (กันเซลล์คนเดียวแตกเป็น 2 แถว เมื่อบางงานมี estimator_id บางงานมาจาก fallback คิว)
  const salesMap: Record<string, { name: string; jobs: number; quoted: number; deposited: number; revenue: number }> = {};
  inJobs.forEach((j: any) => {
    const name = salesNameOf(j);
    const m = (salesMap[name] ??= { name, jobs: 0, quoted: 0, deposited: 0, revenue: 0 });
    m.jobs++;
    if (j.quote_sent_date) m.quoted++;
    if (isWon(j)) { m.deposited++; m.revenue += num(j.net_amount); }
  });
  const bySales = Object.values(salesMap)
    .map((s) => ({ name: s.name, jobs: s.jobs, quoted: s.quoted, deposited: s.deposited, revenue: mask(s.revenue), close_rate: s.jobs ? Math.round((s.deposited / s.jobs) * 100) : 0, _rev: s.revenue }))
    // ไม่มีสิทธิ์ดูเงิน → เรียงด้วยจำนวนมัดจำ/งาน (กันเดาอันดับยอดขายจากลำดับแถว)
    .sort((a, b) => (showFinance ? b._rev - a._rev || b.deposited - a.deposited : b.deposited - a.deposited || b.jobs - a.jobs))
    .map(({ _rev, ...s }) => s);

  // ── เขียนแบบ: จำนวนที่เขียนเสร็จ / ระยะเวลาเฉลี่ย / ช้ากว่ากำหนด / ค้างเกินกำหนด ──
  const drawnInRange = J.filter((j: any) => j.status !== "CANCELLED" && inRange(j.design_end) && j.design_state === "DONE");
  const drawDurations = drawnInRange.map((j: any) => dayDiff(j.design_start, j.design_end)).filter((d: number | null): d is number => d != null && d >= 0);
  const drawLate = drawnInRange.filter((j: any) => j.design_due_date && j.design_end && j.design_end > j.design_due_date).length;
  // งานเขียนแบบที่ยัง active (ยังไม่ถึงมัดจำ ไม่พัก) แต่เลยกำหนด — ภาระค้างปัจจุบัน (ไม่อิงช่วง · parity กับ /designer)
  const drawBacklog = J.filter((j: any) =>
    j.status !== "CANCELLED" && !j.on_hold && j.design_state && j.design_state !== "DONE" && j.design_state !== "NOT_STARTED" &&
    (j.current_stage ?? 0) < 8 && j.design_due_date && j.design_due_date < today).length;

  const drawByDesignerMap: Record<string, { name: string; done: number; _dur: number[]; late: number }> = {};
  drawnInRange.forEach((j: any) => {
    const name = j.designer_lookup?.name ?? "ไม่ระบุผู้เขียน";
    const m = (drawByDesignerMap[name] ??= { name, done: 0, _dur: [], late: 0 });
    m.done++;
    const d = dayDiff(j.design_start, j.design_end);
    if (d != null && d >= 0) m._dur.push(d);
    if (j.design_due_date && j.design_end && j.design_end > j.design_due_date) m.late++;
  });
  const drawByDesigner = Object.values(drawByDesignerMap)
    .map((m) => ({ name: m.name, done: m.done, avg_days: avg(m._dur), late: m.late }))
    .sort((a, b) => b.done - a.done);

  const drawing = {
    done: drawnInRange.length,
    avg_days: avg(drawDurations),
    late: drawLate,
    backlog: drawBacklog,
    byDesigner: drawByDesigner,
  };

  // ── ใบเสนอราคา: จำนวนที่ส่ง / ระยะเวลาเฉลี่ย (ประเมิน→ส่งใบเสนอ) / กระจายตัว / ค้างเกินกำหนด ──
  const sentInRange = J.filter((j: any) => inRange(j.quote_sent_date) && j.status !== "CANCELLED");
  const turnarounds = sentInRange.map((j: any) => dayDiff(j.assess_date, j.quote_sent_date)).filter((d: number | null): d is number => d != null && d >= 0);
  const buckets = { d0: 0, d1_2: 0, d3_5: 0, d6: 0 };
  turnarounds.forEach((d) => { if (d === 0) buckets.d0++; else if (d <= 2) buckets.d1_2++; else if (d <= 5) buckets.d3_5++; else buckets.d6++; });
  // งานที่อยู่เฟส "ทำใบเสนอราคา" แต่ยังไม่ส่ง และค้างเกินกำหนด (overdueDays QUOTE = 5 วัน)
  const quoteBacklog = J.filter((j: any) => {
    if (j.status === "CANCELLED" || j.quote_sent_date) return false;
    if (derivePhase(j) !== "QUOTE") return false;
    const d = dayDiff(j.assess_date, today);
    return d != null && d > overdueDays("QUOTE");
  }).length;

  const quotation = {
    done: sentInRange.length,
    avg_days: avg(turnarounds),
    buckets,
    backlog: quoteBacklog,
  };

  // ── ปัญหา (ในช่วง) ──
  const inIssues = I.filter((i: any) => inRange(i.created_at));
  const issuesByPhase: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  inIssues.forEach((i: any) => {
    issuesByPhase[i.phase] = (issuesByPhase[i.phase] ?? 0) + 1;
    if (i.severity in issuesBySeverity) issuesBySeverity[i.severity]++;
  });

  return ok({
    range: { from, to },
    can_finance: showFinance,
    summary, byMonth, byArea, areaUnknown, funnel, byChannel, topItems,
    byCategory, uncategorizedItems: uncategorized,
    bySales, drawing, quotation,
    issues: {
      total: inIssues.length,
      open: inIssues.filter((i: any) => i.status !== "CLOSED").length,
      byPhase: issuesByPhase, bySeverity: issuesBySeverity,
    },
  });
});
