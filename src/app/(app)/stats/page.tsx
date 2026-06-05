"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { PHASE_META, PHASE_ORDER, type PhaseKey } from "@/lib/followup";
import { CHANNEL } from "@/lib/constants";

type Stats = {
  range: { from: string; to: string };
  summary: { jobs: number; won: number; close_rate: number; revenue_closed: number; collected: number };
  byMonth: { month: string; quoted: number; closed: number; collected: number }[];
  bySales: { name: string; jobs: number; won: number; revenue: number; close_rate: number }[];
  funnel: { phase: PhaseKey; count: number }[];
  byChannel: { channel: string; count: number }[];
  topItems: { name: string; qty: number }[];
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

export default function StatsPage() {
  const [range, setRange] = useState("ytd");
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

  const monthMax = useMemo(() => Math.max(1, ...(data?.byMonth ?? []).flatMap((m) => [m.quoted, m.closed])), [data]);
  const funnelMax = useMemo(() => Math.max(1, ...(data?.funnel ?? []).map((f) => f.count)), [data]);
  const chMax = useMemo(() => Math.max(1, ...(data?.byChannel ?? []).map((c) => c.count)), [data]);
  const itemMax = useMemo(() => Math.max(1, ...(data?.topItems ?? []).map((i) => i.qty)), [data]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="chart" size={18} /></span>
          สถิติ &amp; รายงาน
        </h1>
        <div className="flex gap-1.5 glass rounded-xl p-1">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${range === r.key ? "bg-brand text-white shadow-brand" : "text-ink-2 hover:bg-white/60"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {err ? (
        <Card className="p-6"><p className="text-red-700 text-sm">{err}</p></Card>
      ) : loading && !data ? (
        <Card className="p-10"><p className="text-center text-ink-3">กำลังโหลด…</p></Card>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="งานในช่วง" value={data.summary.jobs} />
            <Kpi label="ปิดการขายได้" value={data.summary.won} color="#0f7a38" />
            <Kpi label="อัตราปิด" value={`${data.summary.close_rate}%`} color="#b3151d" />
            <Kpi label="ยอดปิด (฿)" value={baht(data.summary.revenue_closed)} color="#1F4E78" />
            <Kpi label="เก็บเงินแล้ว (฿)" value={baht(data.summary.collected)} color="#7d0f15" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Monthly revenue */}
            <Card className="p-5">
              <h3 className="font-bold text-brand-dark mb-3">รายได้รายเดือน (เสนอ vs ปิด)</h3>
              <div className="space-y-2">
                {data.byMonth.map((m) => (
                  <div key={m.month} className="text-xs">
                    <div className="flex justify-between text-ink-3 mb-0.5"><span>{m.month}</span><span className="tabular-nums">ปิด ฿{baht(m.closed)}</span></div>
                    <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-sky-300" style={{ width: `${(m.quoted / monthMax) * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-brand rounded-full" style={{ width: `${(m.closed / monthMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {data.byMonth.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
              </div>
            </Card>

            {/* Top items — ยอดนิยมบน */}
            <Card className="p-5">
              <h3 className="font-bold text-brand-dark mb-3">ประเภทงานนิยม (จากใบเสนอราคา)</h3>
              <div className="space-y-1.5">
                {data.topItems.map((it) => (
                  <div key={it.name} className="flex items-center gap-2 text-xs">
                    <span className="w-32 truncate text-ink-3" title={it.name}>{it.name}</span>
                    <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(it.qty / itemMax) * 100}%` }} /></div>
                    <span className="w-10 text-right tabular-nums text-ink-2">{baht(it.qty)}</span>
                  </div>
                ))}
                {data.topItems.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
              </div>
            </Card>

            {/* Sales close-rate */}
            <Card className="p-5 lg:col-span-2">
              <h3 className="font-bold text-brand-dark mb-3">ปิดการขายต่อเซลล์</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                    <th className="py-2 font-semibold">เซลล์</th><th className="font-semibold text-center">งาน</th>
                    <th className="font-semibold text-center">ปิด</th><th className="font-semibold text-center">อัตรา</th>
                    <th className="font-semibold text-right">ยอด (฿)</th>
                  </tr></thead>
                  <tbody>
                    {data.bySales.map((s, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 font-medium text-ink-2">{s.name}</td>
                        <td className="text-center tabular-nums text-ink-2">{s.jobs}</td>
                        <td className="text-center tabular-nums text-emerald-700">{s.won}</td>
                        <td className="text-center tabular-nums font-semibold">{s.close_rate}%</td>
                        <td className="text-right tabular-nums">{baht(s.revenue)}</td>
                      </tr>
                    ))}
                    {data.bySales.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
                  </tbody>
                </table>
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

            {/* Issues + channel — สถานะออฟฟิศ ท้ายสุด */}
            <Card className="p-5 space-y-4">
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
                    <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-brand-navy" style={{ width: `${(c.count / chMax) * 100}%`, background: "#1F4E78" }} /></div>
                    <span className="w-6 text-right tabular-nums text-ink-2">{c.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
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
function SevPill({ label, n, cls }: { label: string; n: number; cls: string }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${cls}`}>{label} {n}</span>;
}
