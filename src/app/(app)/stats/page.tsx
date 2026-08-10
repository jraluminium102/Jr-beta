"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { PHASE_META, PHASE_ORDER, type PhaseKey } from "@/lib/followup";
import { CHANNEL } from "@/lib/constants";

type Money = number | null;
type Stats = {
  range: { from: string; to: string };
  can_finance: boolean;
  summary: { jobs: number; won: number; close_rate: number; revenue_closed: Money; collected: Money; quotations: number; ext_quotes: number; ext_pct: number };
  byMonth: { month: string; quoted: Money; closed: Money; collected: Money }[];
  byArea: { area: string; jobs: number; won: number; revenue: Money }[];
  funnel: { phase: PhaseKey; count: number }[];
  byChannel: { channel: string; count: number }[];
  topItems: { name: string; qty: number }[];
  byCategory: { category: string; quoted_revenue: Money; quoted_jobs: number; sold_revenue: Money; sold_jobs: number }[];
  uncategorizedItems: number;
  bySales: { name: string; jobs: number; quoted: number; deposited: number; revenue: Money; close_rate: number }[];
  drawing: { done: number; avg_days: number; late: number; backlog: number; byDesigner: { name: string; done: number; avg_days: number; late: number }[] };
  quotation: { done: number; avg_days: number; buckets: { d0: number; d1_2: number; d3_5: number; d6: number }; backlog: number };
  issues: { total: number; open: number; byPhase: Record<string, number>; bySeverity: Record<string, number> };
};

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

const RANGES = [
  { key: "month", label: "เดือนนี้" },
  { key: "ytd", label: "ปีนี้" },
  { key: "last_year", label: "ปีก่อน" },
  { key: "12m", label: "12 เดือน" },
];
function rangeFor(key: string): { from: string; to: string } {
  const now = new Date();
  if (key === "month") return { from: ym(new Date(now.getFullYear(), now.getMonth(), 1)), to: ym(now) };
  if (key === "last_year") return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
  if (key === "12m") return { from: ym(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: ym(now) };
  return { from: `${now.getFullYear()}-01-01`, to: ym(now) }; // ytd
}

type TabKey = "stats" | "kpi";

export default function StatsPage() {
  const [range, setRange] = useState("ytd");
  const [tab, setTab] = useState<TabKey>("stats");
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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
  useEffect(() => { load(range); }, [range, load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="chart" size={18} /></span>
          สถิติ &amp; KPI
        </h1>
        <div className="flex gap-1.5 glass rounded-xl p-1">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${range === r.key ? "bg-brand text-white shadow-brand" : "text-ink-2 hover:bg-white/60"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
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
        tab === "stats" ? <StatsTab data={data} /> : <KpiTab data={data} />
      ) : null}
    </div>
  );
}

/* ─────────────────────── TAB: สถิติ ─────────────────────── */
function StatsTab({ data }: { data: Stats }) {
  const monthMax = useMemo(() => Math.max(1, ...data.byMonth.flatMap((m) => [m.quoted ?? 0, m.closed ?? 0])), [data]);
  const funnelMax = useMemo(() => Math.max(1, ...data.funnel.map((f) => f.count)), [data]);
  const chMax = useMemo(() => Math.max(1, ...data.byChannel.map((c) => c.count)), [data]);
  const itemMax = useMemo(() => Math.max(1, ...data.topItems.map((i) => i.qty)), [data]);
  const areaMax = useMemo(() => Math.max(1, ...data.byArea.map((a) => a.jobs)), [data]);
  const canFin = data.can_finance;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="งานในช่วง" value={data.summary.jobs} />
        <Kpi label="ปิดการขายได้" value={data.summary.won} color="#0f7a38" />
        <Kpi label="อัตราปิด" value={`${data.summary.close_rate}%`} color="#b3151d" />
        <Kpi label="ใบเสนอราคา" value={data.summary.quotations} color="#1F4E78" />
        {canFin && <Kpi label="มูลค่าที่ปิด (฿)" value={baht(data.summary.revenue_closed ?? 0)} color="#1F4E78" />}
        {canFin && <Kpi label="เก็บเงินแล้ว (฿)" value={baht(data.summary.collected ?? 0)} color="#7d0f15" />}
      </div>

      {/* Out-of-system quotations */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-1">
          <h3 className="font-bold text-brand-dark">สัดส่วนใบเสนอราคานอกระบบ</h3>
          <span className="text-xs text-ink-3">นอกระบบ = พิมพ์เอง/นำเข้า (ไม่ผ่านเครื่องคิดราคา)</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-extrabold tabular-nums text-amber-600">{data.summary.ext_pct}%</div>
          <div className="flex-1">
            <div className="relative h-4 rounded-full bg-gray-100 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${100 - data.summary.ext_pct}%` }} />
              <div className="absolute inset-y-0 right-0 bg-amber-400" style={{ width: `${data.summary.ext_pct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-ink-3 mt-1">
              <span>ในระบบ {data.summary.quotations - data.summary.ext_quotes} ใบ</span>
              <span>นอกระบบ {data.summary.ext_quotes} ใบ · จากทั้งหมด {data.summary.quotations} ใบ</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* สถานที่ */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3">พื้นที่ลูกค้า (ตามจำนวนงาน)</h3>
          <div className="space-y-1.5">
            {data.byArea.map((a) => (
              <div key={a.area} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-ink-3" title={a.area}>{a.area}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-brand-navy" style={{ width: `${(a.jobs / areaMax) * 100}%`, background: "#1F4E78" }} /></div>
                <span className="w-24 text-right tabular-nums text-ink-2">{a.jobs} งาน{canFin ? ` · ฿${baht(a.revenue ?? 0)}` : ""}</span>
              </div>
            ))}
            {data.byArea.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
          </div>
        </Card>

        {/* รายได้รายเดือน */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3">รายได้รายเดือน (เสนอ vs ปิด)</h3>
          {canFin ? (
            <div className="space-y-2">
              {data.byMonth.map((m) => (
                <div key={m.month} className="text-xs">
                  <div className="flex justify-between text-ink-3 mb-0.5"><span>{m.month}</span><span className="tabular-nums">ปิด ฿{baht(m.closed ?? 0)}</span></div>
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
          <h3 className="font-bold text-brand-dark mb-3">ประเภทงานนิยม (จากใบเสนอราคา)</h3>
          <div className="space-y-1.5">
            {data.topItems.map((it) => (
              <div key={it.name} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-ink-3" title={it.name}>{it.name}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(it.qty / itemMax) * 100}%` }} /></div>
                <span className="w-20 text-right tabular-nums text-ink-2">{it.qty.toLocaleString()} ชุด/ชิ้น</span>
              </div>
            ))}
            {data.topItems.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
          </div>
        </Card>

        {/* Funnel */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3">Funnel ตามเฟส (งานปัจจุบัน)</h3>
          <div className="space-y-1.5">
            {data.funnel.map((f) => (
              <div key={f.phase} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-ink-2">{PHASE_META[f.phase].th}</span>
                <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(f.count / funnelMax) * 100}%`, background: PHASE_META[f.phase].dot }} />
                </div>
                <span className="w-8 text-right tabular-nums text-ink-2">{f.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* สินค้าขายดีตามหมวด */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-bold text-brand-dark">สินค้าขายดี (ตามหมวด)</h3>
            {data.uncategorizedItems > 0 && (
              <span className="text-[11px] text-amber-600">ยังไม่จัดหมวด {data.uncategorizedItems.toLocaleString()} รายการ (ใบเบา/นำเข้า)</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-2 font-semibold">หมวดสินค้า</th>
                <th className="font-semibold text-center">เสนอ (งาน)</th>
                {canFin && <th className="font-semibold text-right">ยอดเสนอ (฿)</th>}
                <th className="font-semibold text-center text-emerald-700">ขาย (งาน)</th>
                {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย (฿)</th>}
              </tr></thead>
              <tbody>
                {data.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-ink-2">{c.category}</td>
                    <td className="text-center tabular-nums text-ink-3">{c.quoted_jobs.toLocaleString()}</td>
                    {canFin && <td className="text-right tabular-nums text-ink-3">{baht(c.quoted_revenue ?? 0)}</td>}
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{c.sold_jobs.toLocaleString()}</td>
                    {canFin && <td className="text-right tabular-nums font-semibold text-emerald-700">{baht(c.sold_revenue ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.byCategory.length === 0 && <p className="text-ink-3 text-sm py-2">ยังไม่มีข้อมูลหมวด — ใบที่คิดผ่านเครื่องคิดราคาจะเริ่มสะสมหมวดให้เอง</p>}
          </div>
        </Card>

        {/* Issues + channel */}
        <Card className="p-5 space-y-4 lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <h3 className="font-bold text-brand-dark mb-2">ปัญหาที่บันทึก ({data.issues.total} · ค้าง {data.issues.open})</h3>
              <div className="flex gap-2 text-xs">
                <SevPill label="สูง" n={data.issues.bySeverity.HIGH ?? 0} cls="bg-red-100 text-red-800" />
                <SevPill label="กลาง" n={data.issues.bySeverity.MEDIUM ?? 0} cls="bg-amber-100 text-amber-900" />
                <SevPill label="ต่ำ" n={data.issues.bySeverity.LOW ?? 0} cls="bg-gray-200 text-gray-700" />
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink-2 mb-1.5">ช่องทางลูกค้า</h4>
              {data.byChannel.map((c) => (
                <div key={c.channel} className="flex items-center gap-2 text-xs mb-1">
                  <span className="w-16 text-ink-3">{CHANNEL[c.channel as keyof typeof CHANNEL] ?? c.channel}</span>
                  <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full" style={{ width: `${(c.count / chMax) * 100}%`, background: "#1F4E78" }} /></div>
                  <span className="w-6 text-right tabular-nums text-ink-2">{c.count}</span>
                </div>
              ))}
              {data.byChannel.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────── TAB: KPI ─────────────────────── */
function KpiTab({ data }: { data: Stats }) {
  const canFin = data.can_finance;
  const { drawing, quotation } = data;
  const bkMax = Math.max(1, quotation.buckets.d0, quotation.buckets.d1_2, quotation.buckets.d3_5, quotation.buckets.d6);

  return (
    <div className="space-y-4">
      {/* เซลล์รายคน */}
      <Card className="p-5">
        <h3 className="font-bold text-brand-dark mb-3 flex items-center gap-2"><Icon name="users" size={17} /> เซลล์รายคน</h3>
        {/* desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
              <th className="py-2 font-semibold">เซลล์</th>
              <th className="font-semibold text-center">เข้างาน</th>
              <th className="font-semibold text-center">ส่งใบเสนอ</th>
              <th className="font-semibold text-center text-emerald-700">ลูกค้ามัดจำ</th>
              <th className="font-semibold text-center">อัตราปิด</th>
              {canFin && <th className="font-semibold text-right">ยอดขาย (฿)</th>}
            </tr></thead>
            <tbody>
              {data.bySales.map((s, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium text-ink-2">{s.name}</td>
                  <td className="text-center tabular-nums text-ink-2">{s.jobs}</td>
                  <td className="text-center tabular-nums text-ink-3">{s.quoted}</td>
                  <td className="text-center tabular-nums font-semibold text-emerald-700">{s.deposited}</td>
                  <td className="text-center tabular-nums font-semibold">{s.close_rate}%</td>
                  {canFin && <td className="text-right tabular-nums">{baht(s.revenue ?? 0)}</td>}
                </tr>
              ))}
              {data.bySales.length === 0 && <tr><td colSpan={canFin ? 6 : 5} className="py-4 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
        {/* mobile */}
        <div className="md:hidden space-y-2">
          {data.bySales.map((s, i) => (
            <div key={i} className="rounded-xl border border-gray-200/70 bg-white/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-sm text-ink-2">{s.name}</span>
                <span className="text-xs font-bold text-brand tabular-nums">{s.close_rate}%</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                <span>เข้างาน <b className="tabular-nums text-ink-2">{s.jobs}</b></span>
                <span>ส่งใบเสนอ <b className="tabular-nums text-ink-2">{s.quoted}</b></span>
                <span>มัดจำ <b className="tabular-nums text-emerald-700">{s.deposited}</b></span>
                {canFin && <span className="ml-auto tabular-nums text-ink-2">฿{baht(s.revenue ?? 0)}</span>}
              </div>
            </div>
          ))}
          {data.bySales.length === 0 && <p className="text-ink-3 text-sm text-center py-3">ไม่มีข้อมูล</p>}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* เขียนแบบ */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3 flex items-center gap-2"><Icon name="pencil" size={16} /> เขียนแบบ</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Mini label="เขียนเสร็จ (ในช่วง)" value={drawing.done} />
            <Mini label="เวลาเฉลี่ย/งาน" value={`${drawing.avg_days} วัน`} color="#1F4E78" />
            <Mini label="ช้ากว่ากำหนด" value={drawing.late} color={drawing.late ? "#b3151d" : "#0f7a38"} />
            <Mini label="ค้างเกินกำหนด (ตอนนี้)" value={drawing.backlog} color={drawing.backlog ? "#b3151d" : "#0f7a38"} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">ผู้เขียนแบบ</th>
                <th className="font-semibold text-center">เสร็จ</th>
                <th className="font-semibold text-center">เฉลี่ย(วัน)</th>
                <th className="font-semibold text-center">ช้า</th>
              </tr></thead>
              <tbody>
                {drawing.byDesigner.map((d, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 font-medium text-ink-2">{d.name}</td>
                    <td className="text-center tabular-nums text-ink-2">{d.done}</td>
                    <td className="text-center tabular-nums text-ink-3">{d.avg_days}</td>
                    <td className={`text-center tabular-nums ${d.late ? "text-red-700 font-semibold" : "text-ink-3"}`}>{d.late}</td>
                  </tr>
                ))}
                {drawing.byDesigner.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-ink-3">ยังไม่มีงานเขียนเสร็จในช่วงนี้</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-3 mt-2">ระยะเวลา = วันเริ่ม→วันเสร็จ · ช้า = เสร็จเลย “กำหนดส่งแบบ”</p>
        </Card>

        {/* ใบเสนอราคา */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-3 flex items-center gap-2"><Icon name="file" size={16} /> ใบเสนอราคา</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini label="ส่งใบเสนอ (ในช่วง)" value={quotation.done} />
            <Mini label="เวลาเฉลี่ย" value={`${quotation.avg_days} วัน`} color="#1F4E78" />
            <Mini label="ค้างเกินกำหนด" value={quotation.backlog} color={quotation.backlog ? "#b3151d" : "#0f7a38"} />
          </div>
          <h4 className="text-xs font-semibold text-ink-2 mb-2">กระจายเวลาทำใบเสนอ (ประเมิน→ส่ง)</h4>
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
          <p className="text-[11px] text-ink-3 mt-3">ค้างเกินกำหนด = อยู่เฟสทำใบเสนอ ยังไม่ส่ง และเกิน 5 วันจากวันประเมิน</p>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="text-xl sm:text-2xl font-extrabold mt-1.5 tabular-nums" style={{ color: color ?? "#1f2127" }}>{value}</div>
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
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${cls}`}>{label} {n}</span>;
}
