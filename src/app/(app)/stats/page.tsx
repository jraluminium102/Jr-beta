"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { CHANNEL } from "@/lib/constants";

type Money = number | null;
type Deposit = { id: string; job_code: string | null; customer_name: string; deposit_date: string | null; net: Money; net_vat: Money; sales: string; area: string };
type Stats = {
  range: { from: string; to: string };
  can_finance: boolean;
  summary: { jobs: number; won: number; close_rate: number; deposited_period: number; revenue_closed: Money; revenue_deposited: Money; revenue_closed_vat: Money; revenue_deposited_vat: Money; collected: Money; quotations: number; ext_quotes: number; ext_pct: number };
  deposits: Deposit[];
  byMonth: { month: string; quoted: Money; closed: Money; closed_vat: Money }[];
  byArea: { area: string; jobs: number; won: number; revenue: Money }[];
  areaUnknown: number;
  areaOther: number;
  byChannel: { channel: string; count: number }[];
  topItems: { name: string; qty: number }[];
  byCategory: { category: string; quoted_jobs: number; quoted_qty: number; quoted_revenue: Money; sold_jobs: number; sold_qty: number; sold_revenue: Money; avg_price: Money; win_rate: number }[];
  uncategorizedItems: number;
  bySales: { name: string; assess: number; other_visits: number; won_cohort: number; close_rate: number; deposited_period: number; quoted_amount: Money; sold_amount: Money }[];
  drawing: { done: number; avg_days: number; late: number; byDesigner: { name: string; ref: number | null; done: number; avg_days: number; late: number }[] };
  quotation: { done: number; avg_days: number; no_time: number; buckets: { d0: number; d1_2: number; d3_5: number; d6: number } };
  issues: { total: number; open: number; bySeverity: Record<string, number> };
};

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function monthLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${TH_MON[m - 1]} ${(y + 543) % 100}`; }

const PRESETS = [
  { key: "ytd", label: "ปีนี้" },
  { key: "last_year", label: "ปีก่อน" },
  { key: "12m", label: "12 เดือน" },
];
function rangeFor(key: string): { from: string; to: string } {
  const now = new Date();
  if (key.startsWith("m:")) { const [y, m] = key.slice(2).split("-").map(Number); return { from: `${key.slice(2)}-01`, to: ymd(new Date(y, m, 0)) }; }
  if (key === "last_year") return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
  if (key === "12m") return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: ymd(now) };
  return { from: `${now.getFullYear()}-01-01`, to: ymd(now) }; // ytd
}
function monthOptions(): string[] {
  const now = new Date(); const out: string[] = [];
  for (let i = 0; i < 18; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}
const fmtDate = (s: string | null) => { if (!s) return "-"; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${(Number(y) + 543) % 100}`; };

type TabKey = "stats" | "kpi";

export default function StatsPage() {
  const [sel, setSel] = useState("ytd");
  const [tab, setTab] = useState<TabKey>("stats");
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState<{ title: string; rows: Deposit[] } | null>(null);
  const months = useMemo(() => monthOptions(), []);

  const load = useCallback(async (key: string) => {
    setLoading(true); setErr("");
    try {
      const { from, to } = rangeFor(key);
      const res = await fetch(`/api/stats?from=${from}&to=${to}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "โหลดสถิติไม่สำเร็จ");
      setData(json.data as Stats);
    } catch (e) { setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(sel); }, [sel, load]);

  const openDeposits = (title: string, filterSales?: string) => {
    if (!data) return;
    const rows = filterSales ? data.deposits.filter((d) => d.sales === filterSales) : data.deposits;
    setModal({ title, rows });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="chart" size={18} /></span>
          สถิติ &amp; KPI
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={sel.startsWith("m:") ? sel : ""} onChange={(e) => e.target.value && setSel(e.target.value)}
            className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-ink-2 shadow-sm">
            <option value="">เลือกเดือน…</option>
            {months.map((m) => <option key={m} value={`m:${m}`}>{monthLabel(m)}</option>)}
          </select>
          <div className="flex gap-1.5 glass rounded-xl p-1">
            {PRESETS.map((r) => (
              <button key={r.key} onClick={() => setSel(r.key)}
                className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${sel === r.key ? "bg-brand text-white shadow-brand" : "text-ink-2 hover:bg-white/60"}`}>{r.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 glass rounded-xl p-1 w-fit">
        {([{ k: "stats", label: "สถิติ", icon: "chart" }, { k: "kpi", label: "KPI ทีมงาน", icon: "users" }] as const).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`press rounded-lg px-4 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 ${tab === t.k ? "bg-brand text-white shadow-brand" : "text-ink-2 hover:bg-white/60"}`}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      {err ? (
        <Card className="p-6"><p className="text-red-700 text-sm">{err}</p></Card>
      ) : loading && !data ? (
        <Card className="p-10"><p className="text-center text-ink-3">กำลังโหลด…</p></Card>
      ) : data ? (
        tab === "stats" ? <StatsTab data={data} onDeposits={openDeposits} /> : <KpiTab data={data} onDeposits={openDeposits} />
      ) : null}

      {modal && <DepositsModal title={modal.title} rows={modal.rows} canFin={!!data?.can_finance} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ─────────────────────── TAB: สถิติ ─────────────────────── */
function StatsTab({ data, onDeposits }: { data: Stats; onDeposits: (title: string, sales?: string) => void }) {
  const monthMax = useMemo(() => Math.max(1, ...data.byMonth.flatMap((m) => [m.quoted ?? 0, m.closed ?? 0])), [data]);
  const chMax = useMemo(() => Math.max(1, ...data.byChannel.map((c) => c.count)), [data]);
  const itemMax = useMemo(() => Math.max(1, ...data.topItems.map((i) => i.qty)), [data]);
  const areaMax = useMemo(() => Math.max(1, ...data.byArea.map((a) => a.jobs)), [data]);
  const canFin = data.can_finance;
  const s = data.summary;

  return (
    <div className="space-y-4">
      {/* กลุ่ม 1: cohort ที่เข้าประเมินในช่วงนี้ */}
      <div>
        <div className="text-xs font-semibold text-ink-3 mb-1.5">งานที่เข้าประเมินในช่วงนี้ → ปิดการขายได้แค่ไหน</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="เข้าประเมิน (งาน)" value={s.jobs} />
          <Kpi label="มัดจำ (จากที่ประเมินช่วงนี้)" value={s.won} color="#0f7a38" />
          <Kpi label="อัตราปิดการขาย" value={`${s.close_rate}%`} color="#b3151d" />
          <Kpi label="ออกใบเสนอราคา" value={s.quotations} color="#1F4E78" />
        </div>
      </div>
      {/* กลุ่ม 2: ที่เกิดขึ้นจริงในช่วงนี้ (อิงวันมัดจำ/รับเงิน) */}
      <div>
        <div className="text-xs font-semibold text-ink-3 mb-1.5">ยอดที่ปิด/รับจริงในช่วงนี้ (อิงวันมัดจำ ไม่สนว่าประเมินเดือนไหน)</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button onClick={() => onDeposits(`ลูกค้ามัดจำในช่วงนี้ (${s.deposited_period} งาน)`)} className="press text-left">
            <Card className="p-4 h-full hover:ring-2 hover:ring-brand/30">
              <div className="text-xs font-medium text-ink-3 flex items-center gap-1">ลูกค้ามัดจำ (ในช่วงนี้) <Icon name="search" size={12} /></div>
              <div className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums text-emerald-700">{s.deposited_period}</div>
              <div className="text-[10px] text-brand mt-0.5">กดดูรายชื่อ</div>
            </Card>
          </button>
          {canFin && <Kpi label="ยอดขายที่ปิดได้ · ก่อน VAT (฿)" value={baht(s.revenue_deposited ?? 0)} color="#1F4E78" sub={<>หลัง VAT ฿{baht(s.revenue_deposited_vat ?? 0)}</>} />}
          {canFin && <Kpi label="เก็บเงินเข้าจริง (฿)" value={baht(s.collected ?? 0)} color="#7d0f15" />}
          {!canFin && <div />}
        </div>
        {canFin && <p className="text-[11px] text-ink-3 mt-1"><b>ยอดขายที่ปิดได้</b> = มูลค่างานที่ลูกค้ามัดจำในช่วงนี้ อิงยอดจากใบวางบิล (ก่อน/หลัง VAT · เต็มมูลค่า ไม่สนเก็บครบงวดยัง) · <b>เก็บเงินเข้าจริง</b> = เงินสดที่รับเข้ามาจริง</p>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* พื้นที่ (ตาราง: เข้า/ปิด/%/ยอด) */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3">พื้นที่ลูกค้า</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">พื้นที่</th>
                <th className="font-semibold text-center">เข้า</th>
                <th className="font-semibold text-center text-emerald-700">ปิดได้</th>
                <th className="font-semibold text-center">% ปิด</th>
                {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย</th>}
              </tr></thead>
              <tbody>
                {data.byArea.map((a) => (
                  <tr key={a.area} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 font-medium text-ink-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 rounded" style={{ width: `${Math.max(6, (a.jobs / areaMax) * 60)}px`, background: "#1F4E78" }} />
                        {a.area}
                      </span>
                    </td>
                    <td className="text-center tabular-nums text-ink-2">{a.jobs}</td>
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{a.won}</td>
                    <td className="text-center tabular-nums text-ink-3">{a.jobs ? Math.round((a.won / a.jobs) * 100) : 0}%</td>
                    {canFin && <td className="text-right tabular-nums text-ink-2">{baht(a.revenue ?? 0)}</td>}
                  </tr>
                ))}
                {data.byArea.length === 0 && <tr><td colSpan={canFin ? 5 : 4} className="py-3 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
          {(data.areaOther > 0 || data.areaUnknown > 0) && (
            <p className="text-[11px] text-ink-3 mt-2">
              {data.areaOther > 0 && <>* อีก {data.areaOther} งานมีที่อยู่แต่ระบุพื้นที่ไม่ได้ </>}
              {data.areaUnknown > 0 && <>· {data.areaUnknown} งานไม่มีที่อยู่</>}
            </p>
          )}
        </Card>

        {/* รายได้รายเดือน + legend */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark">รายได้รายเดือน</h3>
            <div className="flex items-center gap-3 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-sky-300" /> เสนอราคา</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-brand" /> ปิดได้ (มัดจำ)</span>
            </div>
          </div>
          {canFin ? (
            <div className="space-y-2">
              {data.byMonth.map((m) => (
                <div key={m.month} className="text-xs">
                  <div className="flex justify-between text-ink-3 mb-0.5"><span>{monthLabel(m.month)}</span><span className="tabular-nums">ปิด ฿{baht(m.closed ?? 0)}</span></div>
                  <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-sky-300" style={{ width: `${((m.quoted ?? 0) / monthMax) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-brand rounded-full" style={{ width: `${((m.closed ?? 0) / monthMax) * 100}%` }} />
                  </div>
                </div>
              ))}
              {data.byMonth.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
            </div>
          ) : <p className="text-ink-3 text-sm">— ไม่มีสิทธิ์ดูยอดเงิน —</p>}
        </Card>

        {/* ประเภทงานนิยม */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-1">ประเภทงานนิยม</h3>
          <p className="text-[11px] text-ink-3 mb-2.5">รวมชื่อรุ่นเดียวกัน · เฉพาะใบที่คิดผ่านระบบ</p>
          <div className="space-y-1.5">
            {data.topItems.map((it) => (
              <div key={it.name} className="flex items-center gap-2 text-xs">
                <span className="w-36 truncate text-ink-3" title={it.name}>{it.name}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(it.qty / itemMax) * 100}%` }} /></div>
                <span className="w-16 text-right tabular-nums text-ink-2">{it.qty.toLocaleString()} ชุด</span>
              </div>
            ))}
            {data.topItems.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
          </div>
        </Card>

        {/* ช่องทางลูกค้า */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-1">ช่องทางลูกค้า</h3>
          <p className="text-[11px] text-ink-3 mb-2.5">ดึงจากช่องทางในคิว/ทะเบียนลูกค้า</p>
          <div className="space-y-1.5">
            {data.byChannel.map((c) => (
              <div key={c.channel} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-ink-3">{CHANNEL[c.channel as keyof typeof CHANNEL] ?? c.channel}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full" style={{ width: `${(c.count / chMax) * 100}%`, background: "#1F4E78" }} /></div>
                <span className="w-8 text-right tabular-nums text-ink-2">{c.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* สินค้าขายดี (ละเอียด) */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-1">
            <h3 className="font-bold text-brand-dark">สินค้าขายดี (ตามหมวด)</h3>
            {data.uncategorizedItems > 0 && <span className="text-[11px] text-amber-600">ยังไม่จัดหมวด {data.uncategorizedItems.toLocaleString()} รายการ (ใบเบา/นำเข้า)</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-2 font-semibold">หมวดสินค้า</th>
                <th className="font-semibold text-center">เสนอ (ใบ)</th>
                <th className="font-semibold text-center">เสนอ (ชุด)</th>
                <th className="font-semibold text-center text-emerald-700">ขาย (ใบ)</th>
                <th className="font-semibold text-center text-emerald-700">ขาย (ชุด)</th>
                <th className="font-semibold text-center">% ปิด</th>
                {canFin && <th className="font-semibold text-right">ราคาเฉลี่ย/ชุด</th>}
                {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย (฿)</th>}
              </tr></thead>
              <tbody>
                {data.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-ink-2">{c.category}</td>
                    <td className="text-center tabular-nums text-ink-3">{c.quoted_jobs.toLocaleString()}</td>
                    <td className="text-center tabular-nums text-ink-3">{c.quoted_qty.toLocaleString()}</td>
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{c.sold_jobs.toLocaleString()}</td>
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{c.sold_qty.toLocaleString()}</td>
                    <td className="text-center tabular-nums"><span className={c.win_rate >= 50 ? "text-emerald-700 font-semibold" : "text-ink-3"}>{c.win_rate}%</span></td>
                    {canFin && <td className="text-right tabular-nums text-ink-3">{baht(c.avg_price ?? 0)}</td>}
                    {canFin && <td className="text-right tabular-nums font-semibold text-emerald-700">{baht(c.sold_revenue ?? 0)}</td>}
                  </tr>
                ))}
                {data.byCategory.length === 0 && <tr><td colSpan={canFin ? 8 : 6} className="py-3 text-center text-ink-3">ยังไม่มีข้อมูลหมวด</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* นอกระบบ (เล็ก) + issues */}
        <Card className="p-4 lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-4 items-center">
            <div className="flex items-center gap-3">
              <div className="text-xs text-ink-3 shrink-0">ใบเสนอนอกระบบ<br /><span className="text-[10px]">(พิมพ์เอง/นำเข้า)</span></div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums text-amber-600">{s.ext_pct}%</span><span className="text-[11px] text-ink-3">{s.ext_quotes}/{s.quotations} ใบ</span></div>
                <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                  <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${100 - s.ext_pct}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-amber-400" style={{ width: `${s.ext_pct}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs sm:justify-end">
              <span className="text-ink-3">ปัญหาที่บันทึก ({data.issues.total} · ค้าง {data.issues.open}):</span>
              <SevPill label="สูง" n={data.issues.bySeverity.HIGH ?? 0} cls="bg-red-100 text-red-800" />
              <SevPill label="กลาง" n={data.issues.bySeverity.MEDIUM ?? 0} cls="bg-amber-100 text-amber-900" />
              <SevPill label="ต่ำ" n={data.issues.bySeverity.LOW ?? 0} cls="bg-gray-200 text-gray-700" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────── TAB: KPI ─────────────────────── */
function KpiTab({ data, onDeposits }: { data: Stats; onDeposits: (title: string, sales?: string) => void }) {
  const canFin = data.can_finance;
  const { drawing, quotation } = data;
  const bkMax = Math.max(1, quotation.buckets.d0, quotation.buckets.d1_2, quotation.buckets.d3_5, quotation.buckets.d6);

  return (
    <div className="space-y-4">
      {/* เซลล์รายคน */}
      <Card className="p-5">
        <h3 className="font-bold text-brand-dark mb-1 flex items-center gap-2"><Icon name="users" size={17} /> เซลล์รายคน</h3>
        <p className="text-[11px] text-ink-3 mb-3">เข้าประเมิน/เข้าหน้างานอื่น = ไปหน้างานในช่วงนี้ · <b>มัดจำจากประเมิน</b> = งานที่ประเมินช่วงนี้แล้วปิดได้ (คู่กับ %ปิด) · <b>มัดจำในช่วง</b> = ปิดได้จริงในช่วงนี้ (กดดูรายชื่อ)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
              <th className="py-2 font-semibold">เซลล์</th>
              <th className="font-semibold text-center">เข้าประเมิน</th>
              <th className="font-semibold text-center">เข้าหน้างานอื่น</th>
              <th className="font-semibold text-center">มัดจำจากประเมิน</th>
              <th className="font-semibold text-center">% ปิด</th>
              <th className="font-semibold text-center text-emerald-700">มัดจำในช่วง</th>
              {canFin && <th className="font-semibold text-right">ยอดเสนอ (฿)</th>}
              {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย (฿)</th>}
            </tr></thead>
            <tbody>
              {data.bySales.map((s, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium text-ink-2">{s.name}</td>
                  <td className="text-center tabular-nums text-ink-2">{s.assess}</td>
                  <td className="text-center tabular-nums text-ink-3">{s.other_visits}</td>
                  <td className="text-center tabular-nums text-ink-2">{s.won_cohort}</td>
                  <td className="text-center tabular-nums font-semibold">{s.close_rate}%</td>
                  <td className="text-center tabular-nums font-semibold text-emerald-700">
                    {s.deposited_period > 0
                      ? <button onClick={() => onDeposits(`ลูกค้ามัดจำในช่วงนี้ — ${s.name}`, s.name)} className="press underline decoration-dotted underline-offset-2 hover:text-brand">{s.deposited_period}</button>
                      : 0}
                  </td>
                  {canFin && <td className="text-right tabular-nums text-ink-3">{baht(s.quoted_amount ?? 0)}</td>}
                  {canFin && <td className="text-right tabular-nums font-semibold text-emerald-700">{baht(s.sold_amount ?? 0)}</td>}
                </tr>
              ))}
              {data.bySales.length === 0 && <tr><td colSpan={canFin ? 8 : 6} className="py-4 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* เขียนแบบ (กดไปหน้าเขียนแบบได้) */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark flex items-center gap-2"><Icon name="pencil" size={16} /> เขียนแบบ</h3>
            <Link href="/designer" className="press text-xs text-brand font-semibold inline-flex items-center gap-1 hover:underline">เปิดหน้าเขียนแบบ <Icon name="external" size={13} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini label="จำนวนงานที่เขียนเสร็จ" value={drawing.done} />
            <Mini label="ใช้เวลาเฉลี่ย/งาน" value={`${drawing.avg_days} วัน`} color="#1F4E78" />
            <Mini label="เสร็จช้ากว่ากำหนด" value={drawing.late} color={drawing.late ? "#b3151d" : "#0f7a38"} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">ผู้เขียนแบบ</th>
                <th className="font-semibold text-center">จำนวนงาน</th>
                <th className="font-semibold text-center">เฉลี่ย (วัน)</th>
                <th className="font-semibold text-center">ช้า</th>
              </tr></thead>
              <tbody>
                {drawing.byDesigner.map((d, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 font-medium">
                      {d.ref != null
                        ? <Link href={`/designer?designer=${d.ref}`} className="press text-brand hover:underline">{d.name}</Link>
                        : <span className="text-ink-2">{d.name}</span>}
                    </td>
                    <td className="text-center tabular-nums text-ink-2">{d.done}</td>
                    <td className="text-center tabular-nums text-ink-3">{d.avg_days}</td>
                    <td className={`text-center tabular-nums ${d.late ? "text-red-700 font-semibold" : "text-ink-3"}`}>{d.late}</td>
                  </tr>
                ))}
                {drawing.byDesigner.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-ink-3">ยังไม่มีงานเขียนเสร็จในช่วงนี้</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-3 mt-2">เวลาเฉลี่ย = วันเริ่มเขียน → วันเขียนเสร็จ · “ช้า” = เขียนเสร็จเลยวันกำหนดส่งแบบ · กดชื่อผู้เขียนเพื่อดูงานในบอร์ด</p>
        </Card>

        {/* ใบเสนอราคา */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3 flex items-center gap-2"><Icon name="file" size={16} /> ใบเสนอราคา</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Mini label="จำนวนใบเสนอที่ส่ง" value={quotation.done} />
            <Mini label="ใช้เวลาเฉลี่ย" value={`${quotation.avg_days} วัน`} color="#1F4E78" />
          </div>
          <h4 className="text-xs font-semibold text-ink-2 mb-2">กระจายเวลาทำใบเสนอ</h4>
          <div className="space-y-1.5">
            {[
              { label: "ภายในวันเดียว", v: quotation.buckets.d0, c: "#0f7a38" },
              { label: "1–2 วัน", v: quotation.buckets.d1_2, c: "#34d399" },
              { label: "3–5 วัน", v: quotation.buckets.d3_5, c: "#fbbf24" },
              { label: "เกิน 5 วัน", v: quotation.buckets.d6, c: "#b3151d" },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2 text-xs">
                <span className="w-24 text-ink-3">{b.label}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full rounded" style={{ width: `${(b.v / bkMax) * 100}%`, background: b.c }} /></div>
                <span className="w-8 text-right tabular-nums text-ink-2">{b.v}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-3 mt-3">เวลาเฉลี่ย = นับจาก <b>วันเข้าประเมินหน้างาน</b> ถึง <b>วันส่งใบเสนอ</b>{quotation.no_time > 0 ? ` · อีก ${quotation.no_time} ใบไม่มีข้อมูลวันที่` : ""}</p>
        </Card>
      </div>
    </div>
  );
}

/* ─── modal รายชื่อลูกค้ามัดจำ ─── */
function DepositsModal({ title, rows, canFin, onClose }: { title: string; rows: Deposit[]; canFin: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
          <h3 className="font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="press text-ink-3 hover:text-ink"><Icon name="close" size={20} /></button>
        </div>
        <div className="overflow-y-auto p-3">
          {rows.length === 0 ? <p className="text-center text-ink-3 py-6 text-sm">ไม่มีรายการ</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">ลูกค้า</th>
                <th className="font-semibold">พื้นที่</th>
                <th className="font-semibold">เซลล์</th>
                <th className="font-semibold text-center">วันมัดจำ</th>
                {canFin && <th className="font-semibold text-right">ก่อน VAT (฿)</th>}
                {canFin && <th className="font-semibold text-right">หลัง VAT (฿)</th>}
              </tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 text-ink-2">{d.customer_name}{d.job_code ? <span className="text-[11px] text-ink-3"> · {d.job_code}</span> : ""}</td>
                    <td className="text-ink-3 text-xs">{d.area}</td>
                    <td className="text-ink-3 text-xs">{d.sales}</td>
                    <td className="text-center tabular-nums text-ink-3 text-xs">{fmtDate(d.deposit_date)}</td>
                    {canFin && <td className="text-right tabular-nums text-ink-2">{baht(d.net ?? 0)}</td>}
                    {canFin && <td className="text-right tabular-nums text-ink-2">{baht(d.net_vat ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-black/10 text-xs text-ink-3 flex justify-between">
          <span>รวม {rows.length} งาน</span>
          {canFin && <span className="tabular-nums">ก่อน VAT ฿{baht(rows.reduce((a, d) => a + (d.net ?? 0), 0))} · หลัง VAT ฿{baht(rows.reduce((a, d) => a + (d.net_vat ?? 0), 0))}</span>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  return (
    <Card className="p-4 h-full">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums" style={{ color: color ?? "#1f2127" }}>{value}</div>
      {sub != null && <div className="text-[11px] text-ink-3 mt-0.5 tabular-nums">{sub}</div>}
    </Card>
  );
}
function Mini({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200/70 bg-white/50 p-3 text-center">
      <div className="text-xl font-extrabold tabular-nums" style={{ color: color ?? "#1f2127" }}>{value}</div>
      <div className="text-[11px] text-ink-3 mt-0.5">{label}</div>
    </div>
  );
}
function SevPill({ label, n, cls }: { label: string; n: number; cls: string }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${cls}`}>{label} {n}</span>;
}
