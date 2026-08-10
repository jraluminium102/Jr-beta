import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const num = (v: unknown) => Number(v ?? 0) || 0;

function dayDiff(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a + "T00:00:00").getTime();
  const tb = new Date(b + "T00:00:00").getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10 : 0);

// ── พื้นที่: กรุงเทพจัดกลุ่มเป็น "โซน/ทิศ" (ไม่โชว์เขตดิบ) · ต่างจังหวัดเอาแค่จังหวัด · ภูเก็ตเจาะอำเภอ ──
// map เขตกรุงเทพ 50 เขต → โซน (แก้ย้ายเขตได้ถ้าจัดโซนไม่ตรงใจ)
const BKK_ZONE: Record<string, string> = {
  // กลาง
  พระนคร: "กลาง", ดุสิต: "กลาง", ป้อมปราบศัตรูพ่าย: "กลาง", สัมพันธวงศ์: "กลาง", ปทุมวัน: "กลาง",
  บางรัก: "กลาง", สาทร: "กลาง", บางคอแหลม: "กลาง", ยานนาวา: "กลาง", ราชเทวี: "กลาง",
  พญาไท: "กลาง", ดินแดง: "กลาง", ห้วยขวาง: "กลาง", วัฒนา: "กลาง", คลองเตย: "กลาง",
  // เหนือ
  จตุจักร: "เหนือ", บางซื่อ: "เหนือ", หลักสี่: "เหนือ", ดอนเมือง: "เหนือ", สายไหม: "เหนือ",
  บางเขน: "เหนือ", ลาดพร้าว: "เหนือ",
  // ตะวันออก
  บางกะปิ: "ตะวันออก", วังทองหลาง: "ตะวันออก", บึงกุ่ม: "ตะวันออก", คันนายาว: "ตะวันออก", สะพานสูง: "ตะวันออก",
  มีนบุรี: "ตะวันออก", คลองสามวา: "ตะวันออก", หนองจอก: "ตะวันออก", ลาดกระบัง: "ตะวันออก", ประเวศ: "ตะวันออก",
  สวนหลวง: "ตะวันออก", บางนา: "ตะวันออก", พระโขนง: "ตะวันออก",
  // ใต้
  จอมทอง: "ใต้", ราษฎร์บูรณะ: "ใต้", ทุ่งครุ: "ใต้", บางขุนเทียน: "ใต้", บางบอน: "ใต้", หนองแขม: "ใต้",
  // ตะวันตก (ฝั่งธน)
  ธนบุรี: "ตะวันตก", คลองสาน: "ตะวันตก", บางกอกใหญ่: "ตะวันตก", บางกอกน้อย: "ตะวันตก", บางพลัด: "ตะวันตก",
  ตลิ่งชัน: "ตะวันตก", ทวีวัฒนา: "ตะวันตก", ภาษีเจริญ: "ตะวันตก", บางแค: "ตะวันตก",
};
const BKK_DISTRICTS = Object.keys(BKK_ZONE);
const PHUKET_AMPHOE = ["เมืองภูเก็ต", "เมือง", "กะทู้", "ถลาง"];

// address เต็ม → ป้ายพื้นที่ · "" = ไม่มีที่อยู่ · "?" = มีที่อยู่แต่แยกไม่ได้
function areaLabel(raw?: string | null): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // 1) กรุงเทพ — จับชื่อเขตที่รู้จัก (รองรับ "เขตบางนา" / "แขวง...เขต..." / พิมพ์เขตเปล่า)
  for (const d of BKK_DISTRICTS) { if (s.includes(d)) return "กรุงเทพฯ · " + BKK_ZONE[d]; }
  // 2) ภูเก็ต — เจาะอำเภอ
  if (s.includes("ภูเก็ต")) {
    for (const a of PHUKET_AMPHOE) { if (s.includes(a)) return "ภูเก็ต · " + (a === "เมือง" ? "เมืองภูเก็ต" : a); }
    return "ภูเก็ต";
  }
  // 3) ต่างจังหวัด — เอาแค่จังหวัด
  const pm = s.match(/จังหวัด\s*([ก-๙]+)/) || s.match(/(?:^|[^ก-๙])จ\.\s*([ก-๙]+)/);
  if (pm) return pm[1];
  // 4) มีคำว่ากรุงเทพแต่ไม่เจอเขต
  if (/กรุงเทพ|กทม/.test(s)) return "กรุงเทพฯ · ไม่ระบุโซน";
  return "?"; // มีที่อยู่แต่แยกพื้นที่ไม่ได้
}

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — สถิติ + KPI (money ถูกซ่อนถ้าไม่มีสิทธิ์ jobs:finance_fields)
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

  const [jobs, fin, issues, quotations, qitems, queueRows, salesRows, custRows] = await Promise.all([
    fetchAllPaged<any>((f, t) => sb.from("jobs")
      .select("id, job_code, status, current_stage, net_amount, deposit_date, assess_date, quote_sent_date, design_state, design_start, design_end, design_due_date, on_hold, customer_area, customer_id, customer_name, channel, estimator_id, estimator:estimator_id(full_name), designer_ref, designer_lookup:designer_ref(name), queue_entry_id")
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
    fetchAllPaged<any>((f, t) => sb.from("queue_entries")
      .select("id, job_id, customer_name, sales_id, address, contact_channel, job_type, queue_date, status")
      .order("id", { ascending: true }).range(f, t)),
    sb.from("queue_sales").select("id, name"),
    fetchAllPaged<any>((f, t) => sb.from("customers")
      .select("id, address, contact_channel")
      .order("id", { ascending: true }).range(f, t)),
  ]);

  const J = jobs ?? [], F = fin ?? [], I = issues ?? [], QI = qitems ?? [], QT = quotations ?? [];
  const WON = ["DEPOSITED", "COMPLETED", "IN_PRODUCTION", "INSTALLING"];
  const isWon = (j: any) => WON.includes(j.status);

  // ── เซลล์ + ที่อยู่จากคิว (linkage 3 ชั้น: job_id / queue_entry_id / ชื่อลูกค้า) ──
  const salesIdToName = new Map<string, string>(((salesRows as any)?.data ?? salesRows ?? []).map?.((s: any) => [s.id, s.name]) ?? []);
  const nameByJob = new Map<string, string>(), nameByQe = new Map<string, string>(), nameByCust = new Map<string, string>();
  const addrByJob = new Map<string, string>(), addrByQe = new Map<string, string>(), addrByCust = new Map<string, string>();
  const chByJob = new Map<string, string>(), chByQe = new Map<string, string>(), chByCust = new Map<string, string>();
  const normCh = (v: unknown): string | null => {
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "FB" || s === "FACEBOOK") return "FACEBOOK";
    if (s === "IG" || s === "INSTAGRAM") return "INSTAGRAM";
    if (s === "LINE") return "LINE";
    if (s === "OTHER") return "OTHER";
    return null;
  };
  (queueRows ?? []).forEach((q: any) => {
    const nm = q.sales_id ? salesIdToName.get(q.sales_id) : undefined;
    if (nm) { nameByQe.set(q.id, nm); if (q.job_id) nameByJob.set(q.job_id, nm); if (q.customer_name) nameByCust.set(String(q.customer_name).trim(), nm); }
    const a = String(q.address ?? "").trim();
    if (a) { addrByQe.set(q.id, a); if (q.job_id) addrByJob.set(q.job_id, a); if (q.customer_name) addrByCust.set(String(q.customer_name).trim(), a); }
    const ch = normCh(q.contact_channel);
    if (ch) { chByQe.set(q.id, ch); if (q.job_id) chByJob.set(q.job_id, ch); if (q.customer_name) chByCust.set(String(q.customer_name).trim(), ch); }
  });
  const custAddrById = new Map<string, string>(), custChById = new Map<string, string>();
  (custRows ?? []).forEach((c: any) => {
    const a = String(c.address ?? "").trim(); if (a) custAddrById.set(String(c.id), a);
    const ch = normCh(c.contact_channel); if (ch) custChById.set(String(c.id), ch);
  });
  // ช่องทางจริงอยู่ที่คิว (contact_channel LINE/FB) / ทะเบียนลูกค้า — jobs.channel มักว่าง (default OTHER)
  const channelOf = (j: any): string =>
    (j.queue_entry_id ? chByQe.get(j.queue_entry_id) : undefined)
    ?? chByJob.get(j.id)
    ?? (j.customer_name ? chByCust.get(String(j.customer_name).trim()) : undefined)
    ?? (j.customer_id != null ? custChById.get(String(j.customer_id)) : undefined)
    ?? normCh(j.channel) ?? "OTHER";
  // เซลล์ของงาน — ยึดคิวก่อน (ให้ตรงกับจำนวนเข้าประเมิน) แล้ว fallback estimator
  const jobSalesName = (j: any): string =>
    nameByJob.get(j.id)
    ?? (j.queue_entry_id ? nameByQe.get(j.queue_entry_id) : undefined)
    ?? (j.customer_name ? nameByCust.get(String(j.customer_name).trim()) : undefined)
    ?? j.estimator?.full_name ?? "ไม่ระบุ";
  const addressOf = (j: any): string => {
    const manual = String(j.customer_area ?? "").trim(); if (manual) return manual;
    return addrByJob.get(j.id)
      ?? (j.queue_entry_id ? addrByQe.get(j.queue_entry_id) : undefined)
      ?? (j.customer_name ? addrByCust.get(String(j.customer_name).trim()) : undefined)
      ?? (j.customer_id != null ? custAddrById.get(String(j.customer_id)) : undefined)
      ?? "";
  };

  const inJobs = J.filter((j: any) => inRange(j.assess_date) && j.status !== "CANCELLED");
  const wonJobs = inJobs.filter(isWon);
  // งานที่ "มัดจำในช่วงนี้" (อิงวันมัดจำจริง — ไม่สนว่าเข้าประเมินเดือนไหน)
  const depositedInRange = J.filter((j: any) => inRange(j.deposit_date) && j.status !== "CANCELLED");

  // ── summary ──
  const collected = F.filter((f: any) => inRange(f.payment_date)).reduce((s: number, f: any) => s + num(f.amount), 0);
  const revenue_closed = wonJobs.reduce((s: number, j: any) => s + num(j.net_amount), 0);
  const revenue_deposited = depositedInRange.reduce((s: number, j: any) => s + num(j.net_amount), 0);

  // ใบเสนอในช่วง (มีรายการ ≥1) + สัดส่วนนอกระบบ (ทุกรายการ category ว่าง = พิมพ์เอง/นำเข้า)
  const catByQuote = new Map<string, boolean>(), quoteHasItems = new Set<string>();
  QI.forEach((it: any) => {
    const qid = String(it.quotation_id); quoteHasItems.add(qid);
    catByQuote.set(qid, (catByQuote.get(qid) ?? false) || !!(it.category ?? "").trim());
  });
  const inQuotes = QT.filter((q: any) => inRange(q.issue_date) && q.status !== "cancelled" && quoteHasItems.has(String(q.id)));
  const extQuotes = inQuotes.filter((q: any) => !catByQuote.get(String(q.id)));
  const ext_pct = inQuotes.length ? Math.round((extQuotes.length / inQuotes.length) * 1000) / 10 : 0;

  const summary = {
    jobs: inJobs.length,                                 // เข้าประเมินในช่วง (cohort)
    won: wonJobs.length,                                 // มัดจำ "จากที่ประเมินในช่วง" (cohort)
    close_rate: inJobs.length ? Math.round((wonJobs.length / inJobs.length) * 100) : 0,
    deposited_period: depositedInRange.length,           // มัดจำ "ที่เกิดในช่วง" (อิงวันมัดจำ)
    revenue_closed: mask(revenue_closed),                // ยอดขายจาก cohort
    revenue_deposited: mask(revenue_deposited),          // ยอดขายที่ปิดในช่วง (อิงวันมัดจำ)
    collected: mask(collected),
    quotations: inQuotes.length,
    ext_quotes: extQuotes.length,
    ext_pct,
  };

  // ── รายชื่อลูกค้าที่มัดจำในช่วง (สำหรับกดดูรายชื่อ · อิงวันมัดจำ) ──
  const deposits = depositedInRange
    .map((j: any) => ({
      id: j.id, job_code: j.job_code ?? null, customer_name: j.customer_name ?? "",
      deposit_date: j.deposit_date ?? null, net: mask(num(j.net_amount)),
      sales: jobSalesName(j), area: areaLabel(addressOf(j)) || "-",
    }))
    .sort((a, b) => String(b.deposit_date ?? "").localeCompare(String(a.deposit_date ?? "")));

  // ── รายเดือน (เสนอ=net ตามเดือนประเมิน · ปิด=net ตามเดือนมัดจำ) ──
  const monthKeys: string[] = [];
  { const d = new Date(fromT); d.setDate(1); while (d.getTime() <= toT && monthKeys.length < 36) { monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); d.setMonth(d.getMonth() + 1); } }
  const mk = (s?: string | null) => (s ? s.slice(0, 7) : "");
  const byMonth = monthKeys.map((m) => ({
    month: m,
    quoted: mask(J.filter((j: any) => mk(j.assess_date) === m && j.status !== "CANCELLED").reduce((s: number, j: any) => s + num(j.net_amount), 0)),
    closed: mask(J.filter((j: any) => mk(j.deposit_date) === m && j.status !== "CANCELLED").reduce((s: number, j: any) => s + num(j.net_amount), 0)),
  }));

  // ── พื้นที่ (โซนกรุงเทพ / จังหวัด / ภูเก็ตรายอำเภอ) ──
  const areaMap: Record<string, { area: string; jobs: number; won: number; revenue: number }> = {};
  let areaUnknown = 0, areaOther = 0;
  inJobs.forEach((j: any) => {
    const label = areaLabel(addressOf(j));
    if (label === "") { areaUnknown++; return; }
    if (label === "?") { areaOther++; return; }
    const m = (areaMap[label] ??= { area: label, jobs: 0, won: 0, revenue: 0 });
    m.jobs++;
    if (isWon(j)) { m.won++; m.revenue += num(j.net_amount); }
  });
  const byArea = Object.values(areaMap).sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue).slice(0, 20)
    .map((a) => ({ area: a.area, jobs: a.jobs, won: a.won, revenue: mask(a.revenue) }));

  // ── ช่องทางลูกค้า (ดึงจากคิว/ทะเบียน — jobs.channel มักว่าง · โชว์ครบ 4 ช่อง) ──
  const CH_ALL = ["LINE", "FACEBOOK", "INSTAGRAM", "OTHER"];
  const chMap: Record<string, number> = { LINE: 0, FACEBOOK: 0, INSTAGRAM: 0, OTHER: 0 };
  inJobs.forEach((j: any) => { chMap[channelOf(j)]++; });
  const byChannel = CH_ALL.map((channel) => ({ channel, count: chMap[channel] }));

  // ── ประเภทงานนิยม (รวมชื่อฐานเดียวกัน — ตัดวงเล็บหมายเหตุ เช่น "ประตูบานเปิด (หน้าชงกาแฟ)" = "ประตูบานเปิด") ──
  const baseName = (n: string) => n.replace(/\s*[（(].*$/s, "").trim() || n.trim();
  const itemMap: Record<string, number> = {};
  QI.filter((it: any) => inRange(it.quotation?.issue_date) && it.quotation?.status !== "cancelled" && !!(it.category ?? "").trim())
    .forEach((it: any) => { const name = baseName((it.name ?? "").trim()); if (name) itemMap[name] = (itemMap[name] ?? 0) + num(it.qty); });
  const topItems = Object.entries(itemMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 12);

  // ── สินค้าขายดีตามหมวด (ละเอียด: ใบ/ชิ้น/ยอด/ราคาเฉลี่ย/%ปิด · เสนอ vs ขายได้) ──
  type CatAgg = { category: string; q_rev: number; s_rev: number; q_qty: number; s_qty: number; _q: Set<unknown>; _s: Set<unknown> };
  const catMap: Record<string, CatAgg> = {};
  let uncategorized = 0;
  QI.forEach((it: any) => {
    const q = it.quotation;
    if (!q || q.status === "cancelled" || !inRange(q.issue_date)) return;
    const cat = (it.category ?? "").trim();
    if (!cat) { uncategorized++; return; }
    const lt = num(it.line_total), qty = num(it.qty);
    const m = (catMap[cat] ??= { category: cat, q_rev: 0, s_rev: 0, q_qty: 0, s_qty: 0, _q: new Set(), _s: new Set() });
    m.q_rev += lt; m.q_qty += qty; m._q.add(it.quotation_id);
    if (q.job && WON.includes(q.job.status)) { m.s_rev += lt; m.s_qty += qty; m._s.add(it.quotation_id); }
  });
  const byCategory = Object.values(catMap)
    .map((m) => ({
      category: m.category,
      quoted_jobs: m._q.size, quoted_qty: m.q_qty, quoted_revenue: mask(m.q_rev),
      sold_jobs: m._s.size, sold_qty: m.s_qty, sold_revenue: mask(m.s_rev),
      avg_price: mask(m.s_qty ? Math.round(m.s_rev / m.s_qty) : 0),
      win_rate: m._q.size ? Math.round((m._s.size / m._q.size) * 100) : 0,
      _s: m.s_rev,
    }))
    .sort((a, b) => b._s - a._s || (b.sold_jobs - a.sold_jobs))
    .map(({ _s, ...c }) => c);

  // ════════ KPI ════════

  // ── เข้าหน้างานอื่น (ไม่ใช่ประเมิน) ต่อเซลล์ — จากคิว (queue_date ในช่วง · job_type ไม่ใช่ประเมิน) ──
  const isAssessType = (jt: unknown) => { const s = String(jt ?? "").trim(); return !s || /ประเมิน/.test(s); };
  const otherVisitByName: Record<string, number> = {};
  (queueRows ?? []).forEach((q: any) => {
    if (q.status === "CANCELLED" || !inRange(q.queue_date) || isAssessType(q.job_type)) return;
    const nm = q.sales_id ? salesIdToName.get(q.sales_id) : undefined; if (!nm) return;
    otherVisitByName[nm] = (otherVisitByName[nm] ?? 0) + 1;
  });

  // ── เซลล์รายคน: เข้าประเมิน / เข้าหน้างานอื่น / มัดจำ(จากประเมิน) / มัดจำ(ในช่วง) / ยอดขาย / ยอดเสนอ ──
  type SM = { name: string; assess: number; won_cohort: number; dep_period: number; quoted_amt: number; sold_amt: number };
  const salesMap: Record<string, SM> = {};
  const get = (nm: string): SM => (salesMap[nm] ??= { name: nm, assess: 0, won_cohort: 0, dep_period: 0, quoted_amt: 0, sold_amt: 0 });
  inJobs.forEach((j: any) => {
    const m = get(jobSalesName(j));
    m.assess++;
    if (j.quote_sent_date) m.quoted_amt += num(j.net_amount);
    if (isWon(j)) m.won_cohort++;
  });
  // มัดจำในช่วง (อิงวันมัดจำ) + ยอดขายในช่วง — อาจเป็นงานที่ประเมินเดือนอื่น
  depositedInRange.forEach((j: any) => { const m = get(jobSalesName(j)); m.dep_period++; m.sold_amt += num(j.net_amount); });
  Object.keys(otherVisitByName).forEach((nm) => get(nm));
  const bySales = Object.values(salesMap)
    .map((s) => ({
      name: s.name, assess: s.assess, other_visits: otherVisitByName[s.name] ?? 0,
      won_cohort: s.won_cohort, close_rate: s.assess ? Math.round((s.won_cohort / s.assess) * 100) : 0,
      deposited_period: s.dep_period,
      quoted_amount: mask(s.quoted_amt), sold_amount: mask(s.sold_amt), _sold: s.sold_amt,
    }))
    .sort((a, b) => (showFinance ? b._sold - a._sold || b.deposited_period - a.deposited_period : b.deposited_period - a.deposited_period || b.assess - a.assess))
    .map(({ _sold, ...s }) => s);

  // ── เขียนแบบ: จำนวนที่เขียนเสร็จ / เวลาเฉลี่ย(เริ่ม→เสร็จ) / ช้ากว่ากำหนด ──
  const drawnInRange = J.filter((j: any) => j.status !== "CANCELLED" && inRange(j.design_end) && j.design_state === "DONE");
  const drawDurations = drawnInRange.map((j: any) => dayDiff(j.design_start, j.design_end)).filter((d: number | null): d is number => d != null && d >= 0);
  const drawLate = drawnInRange.filter((j: any) => j.design_due_date && j.design_end && j.design_end > j.design_due_date).length;
  const drawByDesignerMap: Record<string, { name: string; ref: number | null; done: number; _dur: number[]; late: number }> = {};
  drawnInRange.forEach((j: any) => {
    const ref = j.designer_ref ?? null;
    const key = ref != null ? `r:${ref}` : "none";
    const name = j.designer_lookup?.name ?? "ไม่ระบุผู้เขียน";
    const m = (drawByDesignerMap[key] ??= { name, ref, done: 0, _dur: [], late: 0 });
    m.done++;
    const d = dayDiff(j.design_start, j.design_end); if (d != null && d >= 0) m._dur.push(d);
    if (j.design_due_date && j.design_end && j.design_end > j.design_due_date) m.late++;
  });
  const drawing = {
    done: drawnInRange.length,
    avg_days: avg(drawDurations),
    late: drawLate,
    byDesigner: Object.values(drawByDesignerMap).map((m) => ({ name: m.name, ref: m.ref, done: m.done, avg_days: avg(m._dur), late: m.late })).sort((a, b) => b.done - a.done),
  };

  // ── ใบเสนอราคา: จำนวนที่ส่ง / เวลาเฉลี่ย(ประเมิน→ส่ง) / กระจายตัว ──
  const sentInRange = J.filter((j: any) => inRange(j.quote_sent_date) && j.status !== "CANCELLED");
  const turnarounds = sentInRange.map((j: any) => dayDiff(j.assess_date, j.quote_sent_date)).filter((d: number | null): d is number => d != null && d >= 0);
  const buckets = { d0: 0, d1_2: 0, d3_5: 0, d6: 0 };
  turnarounds.forEach((d) => { if (d === 0) buckets.d0++; else if (d <= 2) buckets.d1_2++; else if (d <= 5) buckets.d3_5++; else buckets.d6++; });
  const quotation = { done: sentInRange.length, avg_days: avg(turnarounds), no_time: sentInRange.length - turnarounds.length, buckets };

  // ── ปัญหา (ในช่วง) ──
  const inIssues = I.filter((i: any) => inRange(i.created_at));
  const issuesBySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  inIssues.forEach((i: any) => { if (i.severity in issuesBySeverity) issuesBySeverity[i.severity]++; });

  return ok({
    range: { from, to },
    can_finance: showFinance,
    summary, deposits, byMonth, byArea, areaUnknown, areaOther, byChannel, topItems,
    byCategory, uncategorizedItems: uncategorized,
    bySales, drawing, quotation,
    issues: { total: inIssues.length, open: inIssues.filter((i: any) => i.status !== "CLOSED").length, bySeverity: issuesBySeverity },
  });
});
