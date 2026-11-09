"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { CHANNEL } from "@/lib/constants";

/**
 * หน้า "สถิติ & KPI" — รื้อใหม่ 9 พ.ย.69 หลังออดิต 3 ทีม (นักบัญชี · นักวิเคราะห์ · QA)
 *   · ทุกคำว่า "ปิดได้/ขาย" = ลูกค้ามัดจำในช่วงที่เลือก (ฐานเดียวทั้งหน้า) · กลุ่ม "ติดตามจากที่ประเมิน" แยกชัด
 *   · ตัวเลขหลักกดดูรายชื่อได้ทุกตัว (ตรวจย้อนกลับได้) · เทียบช่วงก่อนหน้า · เตือนเมื่อข้อมูลโหลดไม่ครบ
 *   · ค่าเงิน null = ไม่มีสิทธิ์ (ซ่อนทั้งคอลัมน์)
 */

type Money = number | null;
type Row = { id: string; job_code: string | null; customer_name: string; date: string | null; net: Money; net_vat: Money; sales: string; area: string; src: "bill" | "quote" | "none"; stage: string; days?: number | null; note?: string };
type Stats = {
  range: { from: string; to: string; today: string; span_days: number };
  can_finance: boolean;
  warnings: string[];
  summary: {
    assessed: number; quoted: number; quoted_amount: Money; deposited: number; revenue: Money; revenue_vat: Money;
    revenue_from_quote: number; revenue_zero: number; revenue_multi_quote: number; cancelled_after_deposit: number; cancelled_after_deposit_amount: Money; avg_ticket: Money;
    prev: { from: string; to: string; assessed: number; quoted: number; deposited: number; revenue: Money; quoted_amount: Money };
    cohort: { assessed: number; quoted: number; won: number; lost: number; pending: number; quote_rate: number; close_rate: number; close_rate_of_quoted: number; won_amount: Money; pending_amount: Money; lag_median_days: number; immature: boolean };
    quotation_docs: number; ext_quotes: number; ext_pct: number;
  };
  lists: { deposits: Row[]; quoted: Row[]; assessed: Row[]; cohort_won: Row[]; cohort_pending: Row[]; cohort_lost: Row[]; cancelled_after_deposit: Row[] };
  byMonth: { month: string; partial: boolean; assessed: number; cohort_won: number; cohort_close_rate: number; quoted: number; quoted_amount: Money; deposited: number; revenue: Money; revenue_vat: Money; deposit_per_quote: number }[];
  byArea: { area: string; assessed: number; deposited: number; revenue: Money }[];
  areaUnknown: number; areaOther: number; areaUnknownDep: number;
  byChannel: { channel: string; assessed: number; deposited: number }[];
  topItems: { name: string; quoted_jobs: number; sold_jobs: number; qty: number }[];
  byCategory: { category: string; quoted_jobs: number; quoted_qty: number; quoted_revenue: Money; sold_jobs: number; sold_qty: number; sold_revenue: Money; avg_price: Money }[];
  uncategorizedItems: number;
  bySales: { name: string; assessed: number; other_visits: number; quoted_cohort: number; won_cohort: number; close_rate: number; deposited: number; quoted_amount: Money; sold_amount: Money }[];
  drawing: { done: number; avg_days: number; late: number; byDesigner: { name: string; ref: number | null; done: number; avg_days: number; late: number }[] };
  quotation: { done: number; avg_days: number; median_days: number; no_time: number; buckets: { d0: number; d1_2: number; d3_5: number; d6: number }; cycle_avg_days: number; cycle_median_days: number };
  issues: { total: number; open: number; bySeverity: Record<string, number> };
};

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function monthLabel(ym: string) { const [y, m] = ym.split("-").map(Number); return `${TH_MON[m - 1]} ${(y + 543) % 100}`; }
const fmtDate = (s: string | null | undefined) => { if (!s) return "-"; const [y, m, d] = s.slice(0, 10).split("-"); return `${Number(d)}/${Number(m)}/${(Number(y) + 543) % 100}`; };
const fmtRange = (from: string, to: string) => (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`);

const PRESETS = [
  { key: "this_month", label: "เดือนนี้" },
  { key: "last_month", label: "เดือนก่อน" },
  { key: "ytd", label: "ปีนี้" },
  { key: "12m", label: "12 เดือน" },
  { key: "last_year", label: "ปีก่อน" },
];
function rangeFor(key: string): { from: string; to: string } {
  const now = new Date();
  if (key.startsWith("m:")) { const [y, m] = key.slice(2).split("-").map(Number); return { from: `${key.slice(2)}-01`, to: ymd(new Date(y, m, 0)) }; }
  if (key === "this_month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  if (key === "last_month") return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (key === "last_year") return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
  if (key === "12m") return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)), to: ymd(now) };
  return { from: `${now.getFullYear()}-01-01`, to: ymd(now) }; // ytd
}
function monthOptions(): string[] {
  const now = new Date(); const out: string[] = [];
  for (let i = 0; i < 24; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  return out;
}

const STAGE_TH: Record<string, { th: string; cls: string }> = {
  WON: { th: "มัดจำแล้ว", cls: "bg-emerald-100 text-emerald-800" },
  QUOTED: { th: "ส่งใบแล้ว รอตัดสินใจ", cls: "bg-amber-100 text-amber-900" },
  ASSESSED: { th: "ประเมินแล้ว ยังไม่ส่งใบ", cls: "bg-sky-100 text-sky-800" },
  LOST: { th: "ยกเลิก", cls: "bg-gray-200 text-gray-700" },
};
const SRC_TH: Record<Row["src"], string> = { bill: "จากใบวางบิล", quote: "จากใบเสนอ (ยังไม่มีบิล)", none: "ไม่มียอด" };

type TabKey = "stats" | "kpi";
type ModalState = { title: string; rows: Row[]; kind: "money" | "quoted" | "cohort" | "lost" };

export default function StatsPage() {
  const [sel, setSel] = useState("this_month");
  const [tab, setTab] = useState<TabKey>("stats");
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const months = useMemo(() => monthOptions(), []);
  const seq = useRef(0);

  const load = useCallback(async (key: string) => {
    const my = ++seq.current; // กันคำตอบเก่ามาทับเมื่อกดเปลี่ยนช่วงเร็ว ๆ
    setLoading(true); setErr("");
    try {
      const { from, to } = rangeFor(key);
      const res = await fetch(`/api/stats?from=${from}&to=${to}`, { cache: "no-store" });
      const json = await res.json();
      if (my !== seq.current) return;
      if (!res.ok || !json.success) throw new Error(json.error ?? "โหลดสถิติไม่สำเร็จ");
      setData(json.data as Stats);
    } catch (e) { if (my === seq.current) setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
    finally { if (my === seq.current) setLoading(false); }
  }, []);
  useEffect(() => { load(sel); }, [sel, load]);

  // ปิด modal ด้วย Esc + ล็อกสกรอลพื้นหลัง
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [modal]);

  const open = (title: string, rows: Row[], kind: ModalState["kind"] = "money") => setModal({ title, rows, kind });
  const rangeTxt = data ? fmtRange(data.range.from, data.range.to) : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="chart" size={18} /></span>
          สถิติ &amp; KPI
          {data && <span className="text-sm font-medium text-ink-3">· {rangeTxt}</span>}
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

      {data && data.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>ข้อมูลบางส่วนโหลดไม่ครบ</b> ตัวเลขบนหน้านี้อาจต่ำกว่าจริง — {data.warnings.join(" · ")}
        </div>
      )}

      {err && !data ? (
        <Card className="p-6"><p className="text-red-700 text-sm">{err}</p></Card>
      ) : loading && !data ? (
        <Card className="p-10"><p className="text-center text-ink-3">กำลังโหลด…</p></Card>
      ) : data ? (
        <div className={`relative transition-opacity ${loading ? "opacity-50 pointer-events-none" : ""}`}>
          {loading && <div className="absolute inset-x-0 top-2 z-10 text-center text-sm font-semibold text-brand">กำลังโหลดช่วงใหม่…</div>}
          {err && <p className="text-red-700 text-sm mb-2">{err}</p>}
          {tab === "stats" ? <StatsTab data={data} open={open} /> : <KpiTab data={data} open={open} />}
        </div>
      ) : null}

      {modal && <ListModal m={modal} canFin={!!data?.can_finance} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ─────────────────────── TAB: สถิติ ─────────────────────── */
type Open = (title: string, rows: Row[], kind?: ModalState["kind"]) => void;

function StatsTab({ data, open }: { data: Stats; open: Open }) {
  const canFin = data.can_finance;
  const s = data.summary, c = s.cohort, L = data.lists;
  const moneyMax = useMemo(() => Math.max(1, ...data.byMonth.flatMap((m) => [m.quoted_amount ?? 0, m.revenue ?? 0])), [data]);
  const countMax = useMemo(() => Math.max(1, ...data.byMonth.flatMap((m) => [m.quoted, m.deposited])), [data]);
  const areaMax = useMemo(() => Math.max(1, ...data.byArea.map((a) => a.assessed)), [data]);
  const chMax = useMemo(() => Math.max(1, ...data.byChannel.map((x) => x.assessed)), [data]);
  const itemMax = useMemo(() => Math.max(1, ...data.topItems.map((i) => i.quoted_jobs)), [data]);
  const prevTxt = fmtRange(s.prev.from, s.prev.to);
  const partialNote = data.range.to >= data.range.today ? ` (ถึง ${fmtDate(data.range.today)})` : "";

  return (
    <div className="space-y-4">
      {/* กลุ่ม 1: ที่เกิดขึ้นจริงในช่วงนี้ */}
      <div>
        <div className="text-xs font-semibold text-ink-3 mb-1.5">เกิดขึ้นในช่วงนี้{partialNote} · เทียบกับช่วงก่อนหน้า ({prevTxt})</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="เข้าประเมินหน้างาน" value={s.assessed} delta={delta(s.assessed, s.prev.assessed)} onClick={() => open(`เข้าประเมินในช่วงนี้ (${s.assessed} งาน)`, L.assessed, "cohort")} />
          <Kpi label="ส่งใบเสนอราคา" value={s.quoted} delta={delta(s.quoted, s.prev.quoted)} color="#1F4E78"
            sub={canFin ? <>ยอดเสนอรวม {baht(s.quoted_amount ?? 0)} บาท{deltaTxt(s.quoted_amount, s.prev.quoted_amount)}</> : undefined}
            onClick={() => open(`ส่งใบเสนอราคาในช่วงนี้ (${s.quoted} งาน)`, L.quoted, "quoted")} />
          <Kpi label="ลูกค้ามัดจำ" value={s.deposited} delta={delta(s.deposited, s.prev.deposited)} color="#0f7a38"
            sub={canFin && s.deposited ? <>เฉลี่ย {baht(s.avg_ticket ?? 0)} บาท/งาน</> : undefined}
            onClick={() => open(`ลูกค้ามัดจำในช่วงนี้ (${s.deposited} งาน)`, L.deposits)} />
          {canFin ? (
            <Kpi label="ยอดขายที่ปิดได้ · ก่อน VAT" value={`${baht(s.revenue ?? 0)} บาท`} delta={delta(s.revenue ?? 0, s.prev.revenue ?? 0)} color="#1F4E78"
              sub={<>หลัง VAT {baht(s.revenue_vat ?? 0)} บาท</>} onClick={() => open(`ยอดขายที่ปิดได้ — ลูกค้ามัดจำในช่วงนี้ (${s.deposited} งาน)`, L.deposits)} />
          ) : <div />}
        </div>
        {canFin && (
          <p className="text-[11px] text-ink-3 mt-1.5 leading-relaxed">
            <b>ยอดขายที่ปิดได้</b> = มูลค่างานของลูกค้าที่ <b>มัดจำในช่วงนี้</b> (นับตามวันมัดจำ ไม่สนว่าประเมินเดือนไหน) · ยอดเต็มมูลค่างาน ไม่ใช่เงินที่เก็บได้ · ก่อน VAT = หลังหักส่วนลด ยังไม่หักภาษี ณ ที่จ่าย · ใช้ยอดใบวางบิล ถ้ายังไม่วางบิลใช้ยอดใบเสนอล่าสุด · ยอดเดือนที่ผ่านมาเปลี่ยนได้ถ้าแก้บิล/ใบเสนอ หรือยกเลิกงานทีหลัง
            {s.revenue_from_quote > 0 && <> · <span className="text-amber-700">{s.revenue_from_quote} งานยังไม่มีใบวางบิล (ใช้ยอดใบเสนอ)</span></>}
            {s.revenue_multi_quote > 0 && <> · <span className="text-amber-700">{s.revenue_multi_quote} งานมีใบเสนอที่ส่งแล้วหลายใบ (ใช้ใบล่าสุดใบเดียว)</span></>}
            {s.revenue_zero > 0 && <> · <span className="text-red-700">{s.revenue_zero} งานไม่มียอด (ไม่มีทั้งบิลและใบเสนอ · ไม่นับในค่าเฉลี่ย)</span></>}
            {s.cancelled_after_deposit > 0 && <> · <button className="underline decoration-dotted text-ink-2" onClick={() => open(`มัดจำในช่วงนี้แล้วยกเลิกภายหลัง (${s.cancelled_after_deposit} งาน)`, L.cancelled_after_deposit, "lost")}>ไม่รวม {s.cancelled_after_deposit} งานที่มัดจำแล้วยกเลิกทีหลัง (เงินมัดจำที่รับไว้ {baht(s.cancelled_after_deposit_amount ?? 0)} บาท รวม VAT)</button></>}
          </p>
        )}
      </div>

      {/* กลุ่ม 2: ติดตามจากที่ประเมินในช่วงนี้ */}
      <div>
        <div className="text-xs font-semibold text-ink-3 mb-1.5">ติดตามผล: งานที่เข้าประเมินในช่วงนี้ ตอนนี้ไปถึงไหน ({c.assessed} งาน)</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="ส่งใบเสนอแล้ว" value={`${c.quote_rate}%`} color="#1F4E78" sub={<>{c.quoted} จาก {c.assessed} งาน</>} />
          <Kpi label="มัดจำแล้ว (อัตราปิดการขาย)" value={`${c.close_rate}%`} color="#0f7a38"
            sub={<>{c.won} จาก {c.assessed} งาน · คิดเฉพาะที่ส่งใบแล้ว {c.close_rate_of_quoted}%{canFin ? <> · {baht(c.won_amount ?? 0)} บาท</> : null}</>}
            onClick={() => open(`ประเมินช่วงนี้แล้วมัดจำแล้ว (${c.won} งาน)`, L.cohort_won)} />
          <Kpi label="รอตัดสินใจ" value={c.pending} color="#b45309"
            sub={canFin ? <>มูลค่าใบเสนอ {baht(c.pending_amount ?? 0)} บาท</> : <>ยังไม่มัดจำ ยังไม่ยกเลิก</>}
            onClick={() => open(`ประเมินช่วงนี้ ยังรอตัดสินใจ (${c.pending} งาน)`, L.cohort_pending, "cohort")} />
          <Kpi label="ยกเลิก / ไม่ได้งาน" value={c.lost} color="#7d0f15" sub={<>{pctOf(c.lost, c.assessed)}% ของที่ประเมิน</>}
            onClick={() => open(`ประเมินช่วงนี้แล้วยกเลิก (${c.lost} งาน)`, L.cohort_lost, "lost")} />
        </div>
        <p className="text-[11px] text-ink-3 mt-1.5 leading-relaxed">
          ปกติลูกค้าใช้เวลาจากวันประเมินถึงวันมัดจำประมาณ <b>{c.lag_median_days} วัน</b> (ค่ากลางของงานที่ปิดได้ทั้งหมด)
          {c.immature && <span className="text-amber-700"> · ช่วงนี้ยังใหม่ อัตราปิดจะยังต่ำกว่าความจริง เพราะหลายงานยังรอตัดสินใจอยู่</span>}
          {s.quotation_docs > 0 && <> · ใบเสนอราคาที่ออก (นับเอกสาร) {s.quotation_docs} ใบ</>}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* รายเดือน */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h3 className="font-bold text-brand-dark">รายเดือน: เสนอราคา → มัดจำ</h3>
            <div className="flex items-center gap-3 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-sky-400" /> ส่งใบเสนอ</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-emerald-600" /> มัดจำ</span>
            </div>
          </div>
          <p className="text-[11px] text-ink-3 mb-3">% = งานที่มัดจำในเดือนนั้น ÷ งานที่ส่งใบเสนอในเดือนนั้น (คนละชุดงานกันได้ — บอกจังหวะ ไม่ใช่อัตราปิดของงานชุดเดียวกัน) · <b>%ปิด (ชุดประเมิน)</b> = งานที่ประเมินเดือนนั้นแล้วมัดจำได้แล้วถึงวันนี้ · ตารางนับทั้งเดือน ส่วนการ์ดด้านบนนับถึงวันสิ้นสุดช่วง — เดือนที่ยังไม่จบอาจต่างกันถ้ามีคิว/นัดลงวันล่วงหน้า</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">เดือน</th>
                <th className="font-semibold text-center">ประเมิน</th>
                <th className="font-semibold text-center text-sky-700">ส่งใบเสนอ</th>
                <th className="font-semibold text-center text-emerald-700">มัดจำ</th>
                <th className="font-semibold text-center">มัดจำ/เสนอ</th>
                <th className="font-semibold w-[28%]">{canFin ? "ยอด (ก่อน VAT)" : "จำนวนงาน"}</th>
                <th className="font-semibold text-center">%ปิด (ชุดประเมิน)</th>
              </tr></thead>
              <tbody>
                {data.byMonth.map((m) => (
                  <tr key={m.month} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-medium text-ink-2 whitespace-nowrap">{monthLabel(m.month)}{m.partial && <span className="ml-1 text-[10px] text-amber-700">ยังไม่จบเดือน</span>}</td>
                    <td className="text-center tabular-nums text-ink-3">{m.assessed}</td>
                    <td className="text-center tabular-nums text-sky-700 font-semibold">{m.quoted}{canFin && <div className="text-[10.5px] font-normal text-ink-3">{baht(m.quoted_amount ?? 0)} บาท</div>}</td>
                    <td className="text-center tabular-nums text-emerald-700 font-semibold">{m.deposited}{canFin && <div className="text-[10.5px] font-normal text-ink-3">{baht(m.revenue ?? 0)} บาท</div>}</td>
                    <td className="text-center tabular-nums font-semibold">{m.quoted ? `${m.deposit_per_quote}%` : "–"}</td>
                    <td className="py-2 pr-2">
                      <div className="space-y-1">
                        <div className="h-2 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${((canFin ? (m.quoted_amount ?? 0) : m.quoted) / (canFin ? moneyMax : countMax)) * 100}%` }} /></div>
                        <div className="h-2 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${((canFin ? (m.revenue ?? 0) : m.deposited) / (canFin ? moneyMax : countMax)) * 100}%` }} /></div>
                      </div>
                    </td>
                    <td className="text-center tabular-nums text-ink-2">{m.assessed ? <>{m.cohort_close_rate}% <span className="text-[10.5px] text-ink-3">({m.cohort_won}/{m.assessed})</span></> : "–"}</td>
                  </tr>
                ))}
                {data.byMonth.length === 0 && <tr><td colSpan={7} className="py-3 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* พื้นที่ */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-1">พื้นที่ลูกค้า</h3>
          <p className="text-[11px] text-ink-3 mb-2.5">เข้าประเมิน = งานที่ประเมินในช่วงนี้ · มัดจำ/ยอดขาย = ลูกค้าที่มัดจำในช่วงนี้</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">พื้นที่</th>
                <th className="font-semibold text-center">เข้าประเมิน</th>
                <th className="font-semibold text-center text-emerald-700">มัดจำ</th>
                {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย</th>}
              </tr></thead>
              <tbody>
                {data.byArea.map((a) => (
                  <tr key={a.area} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 font-medium text-ink-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 rounded" style={{ width: `${Math.max(4, (a.assessed / areaMax) * 56)}px`, background: "#1F4E78" }} />
                        {a.area}
                      </span>
                    </td>
                    <td className="text-center tabular-nums text-ink-2">{a.assessed}</td>
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{a.deposited}</td>
                    {canFin && <td className="text-right tabular-nums text-ink-2">{baht(a.revenue ?? 0)}</td>}
                  </tr>
                ))}
                {data.byArea.length === 0 && <tr><td colSpan={canFin ? 4 : 3} className="py-3 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </div>
          {(data.areaOther > 0 || data.areaUnknown > 0 || data.areaUnknownDep > 0) && (
            <p className="text-[11px] text-ink-3 mt-2">
              {data.areaOther > 0 && <>* เข้าประเมินอีก {data.areaOther} งานมีที่อยู่แต่ระบุพื้นที่ไม่ได้ </>}
              {data.areaUnknown > 0 && <>· {data.areaUnknown} งานไม่มีที่อยู่ </>}
              {data.areaUnknownDep > 0 && <>· มัดจำอีก {data.areaUnknownDep} งานระบุพื้นที่ไม่ได้ (รวมอยู่ในการ์ดยอดขายแล้ว)</>}
            </p>
          )}
        </Card>

        {/* ช่องทาง */}
        <Card className="p-5">
          <h3 className="font-bold text-brand-dark mb-1">ช่องทางลูกค้า</h3>
          <p className="text-[11px] text-ink-3 mb-2.5">จากช่องทางในคิว/ทะเบียนลูกค้า · แท่ง = เข้าประเมิน · ตัวเลขเขียว = มัดจำในช่วงนี้</p>
          <div className="space-y-2">
            {data.byChannel.map((x) => (
              <div key={x.channel} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-ink-3">{CHANNEL[x.channel as keyof typeof CHANNEL] ?? x.channel}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full" style={{ width: `${(x.assessed / chMax) * 100}%`, background: "#1F4E78" }} /></div>
                <span className="w-10 text-right tabular-nums text-ink-2">{x.assessed}</span>
                <span className="w-14 text-right tabular-nums font-semibold text-emerald-700">มัดจำ {x.deposited}</span>
              </div>
            ))}
          </div>

          <h3 className="font-bold text-brand-dark mt-5 mb-1">ประเภทงานนิยม</h3>
          <p className="text-[11px] text-ink-3 mb-2.5">นับ "จำนวนงาน" ที่มีสินค้านั้นในใบเสนอล่าสุด (ไม่นับซ้ำเมื่อ Rev) · เฉพาะใบที่คิดผ่านระบบ · เขียว = งานที่มัดจำในช่วงนี้</p>
          <div className="space-y-1.5">
            {data.topItems.map((it) => (
              <div key={it.name} className="flex items-center gap-2 text-xs">
                <span className="w-36 truncate text-ink-3" title={it.name}>{it.name}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${(it.quoted_jobs / itemMax) * 100}%` }} /></div>
                <span className="w-14 text-right tabular-nums text-ink-2">{it.quoted_jobs} งาน</span>
                <span className="w-14 text-right tabular-nums font-semibold text-emerald-700">{it.sold_jobs} ขาย</span>
              </div>
            ))}
            {data.topItems.length === 0 && <p className="text-ink-3 text-sm">ไม่มีข้อมูล</p>}
          </div>
        </Card>

        {/* สินค้าตามหมวด */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-1">
            <h3 className="font-bold text-brand-dark">สินค้าตามหมวด</h3>
            {data.uncategorizedItems > 0 && <span className="text-[11px] text-amber-600">ยังไม่จัดหมวด {data.uncategorizedItems.toLocaleString()} รายการ (ใบพิมพ์เอง/นำเข้า)</span>}
          </div>
          <p className="text-[11px] text-ink-3 mb-3">เสนอ = ใบเสนอล่าสุดของงานที่ส่งใบในช่วงนี้ · ขาย = ใบเสนอล่าสุดของงานที่มัดจำในช่วงนี้ · นับเป็นงาน (ไม่นับซ้ำเมื่อ Rev) · ยอดหักส่วนลดตามสัดส่วนแล้ว ก่อน VAT</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-2 font-semibold">หมวดสินค้า</th>
                <th className="font-semibold text-center text-sky-700">เสนอ (งาน)</th>
                <th className="font-semibold text-center text-sky-700">เสนอ (จำนวน)</th>
                {canFin && <th className="font-semibold text-right text-sky-700">ยอดเสนอ (บาท)</th>}
                <th className="font-semibold text-center text-emerald-700">ขาย (งาน)</th>
                <th className="font-semibold text-center text-emerald-700">ขาย (จำนวน)</th>
                {canFin && <th className="font-semibold text-right">ราคาเฉลี่ย/หน่วย</th>}
                {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย (บาท)</th>}
              </tr></thead>
              <tbody>
                {data.byCategory.map((x) => (
                  <tr key={x.category} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-ink-2">{x.category}</td>
                    <td className="text-center tabular-nums text-ink-3">{x.quoted_jobs.toLocaleString()}</td>
                    <td className="text-center tabular-nums text-ink-3">{x.quoted_qty.toLocaleString()}</td>
                    {canFin && <td className="text-right tabular-nums text-ink-3">{baht(x.quoted_revenue ?? 0)}</td>}
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{x.sold_jobs.toLocaleString()}</td>
                    <td className="text-center tabular-nums font-semibold text-emerald-700">{x.sold_qty.toLocaleString()}</td>
                    {canFin && <td className="text-right tabular-nums text-ink-3">{baht(x.avg_price ?? 0)}</td>}
                    {canFin && <td className="text-right tabular-nums font-semibold text-emerald-700">{baht(x.sold_revenue ?? 0)}</td>}
                  </tr>
                ))}
                {data.byCategory.length === 0 && <tr><td colSpan={canFin ? 8 : 5} className="py-3 text-center text-ink-3">ยังไม่มีข้อมูลหมวด</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* นอกระบบ + issues */}
        <Card className="p-4 lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-4 items-center">
            <div className="flex items-center gap-3">
              <div className="text-xs text-ink-3 shrink-0">ใบเสนอนอกระบบ<br /><span className="text-[10px]">(พิมพ์เอง/นำเข้า · นับเฉพาะใบที่ส่งแล้ว)</span></div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums text-amber-600">{s.ext_pct}%</span><span className="text-[11px] text-ink-3">{s.ext_quotes}/{s.quotation_docs} ใบ</span></div>
                <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                  <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${100 - s.ext_pct}%` }} />
                  <div className="absolute inset-y-0 right-0 bg-amber-400" style={{ width: `${s.ext_pct}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs sm:justify-end flex-wrap">
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
function KpiTab({ data, open }: { data: Stats; open: Open }) {
  const canFin = data.can_finance;
  const { drawing, quotation } = data;
  const bkMax = Math.max(1, quotation.buckets.d0, quotation.buckets.d1_2, quotation.buckets.d3_5, quotation.buckets.d6);

  return (
    <div className="space-y-4">
      {/* เซลล์รายคน */}
      <Card className="p-5">
        <h3 className="font-bold text-brand-dark mb-1 flex items-center gap-2"><Icon name="users" size={17} /> เซลล์รายคน</h3>
        <p className="text-[11px] text-ink-3 mb-3 leading-relaxed">
          <b>ประเมิน / ส่งใบ / มัดจำจากประเมิน / %ปิด</b> = งานที่เซลล์คนนั้นเข้าประเมินในช่วงนี้ แล้วตอนนี้ไปถึงไหน ·
          <b> เข้าหน้างานอื่น</b> = คิวที่ไปจริงแล้ว (วัด/เคลียร์แบบ ฯลฯ) ในช่วงนี้ ·
          <b> มัดจำในช่วง / ยอดขาย</b> = ลูกค้าที่มัดจำในช่วงนี้ (ฐานเดียวกับการ์ดยอดขาย) · <b>ยอดเสนอ</b> = งานที่ส่งใบเสนอในช่วงนี้ · เซลล์ยึดจากคิวประเมิน
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
              <th className="py-2 font-semibold">เซลล์</th>
              <th className="font-semibold text-center">ประเมิน</th>
              <th className="font-semibold text-center">เข้าหน้างานอื่น</th>
              <th className="font-semibold text-center">ส่งใบแล้ว</th>
              <th className="font-semibold text-center">มัดจำจากประเมิน</th>
              <th className="font-semibold text-center">% ปิด</th>
              <th className="font-semibold text-center text-emerald-700">มัดจำในช่วง</th>
              {canFin && <th className="font-semibold text-right text-sky-700">ยอดเสนอ (บาท)</th>}
              {canFin && <th className="font-semibold text-right text-emerald-700">ยอดขาย (บาท)</th>}
            </tr></thead>
            <tbody>
              {data.bySales.map((x) => (
                <tr key={x.name} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium text-ink-2">{x.name}</td>
                  <td className="text-center tabular-nums text-ink-2">
                    {x.assessed ? <button onClick={() => open(`เข้าประเมินในช่วงนี้ — ${x.name}`, data.lists.assessed.filter((r) => r.sales === x.name), "cohort")} className="press underline decoration-dotted underline-offset-2 hover:text-brand">{x.assessed}</button> : 0}
                  </td>
                  <td className="text-center tabular-nums text-ink-3">{x.other_visits}</td>
                  <td className="text-center tabular-nums text-ink-2">{x.quoted_cohort}</td>
                  <td className="text-center tabular-nums text-ink-2">{x.won_cohort}</td>
                  <td className="text-center tabular-nums font-semibold">{x.assessed ? `${x.close_rate}%` : "–"}</td>
                  <td className="text-center tabular-nums font-semibold text-emerald-700">
                    {x.deposited ? <button onClick={() => open(`ลูกค้ามัดจำในช่วงนี้ — ${x.name}`, data.lists.deposits.filter((r) => r.sales === x.name))} className="press underline decoration-dotted underline-offset-2 hover:text-brand">{x.deposited}</button> : 0}
                  </td>
                  {canFin && <td className="text-right tabular-nums text-ink-3">{baht(x.quoted_amount ?? 0)}</td>}
                  {canFin && <td className="text-right tabular-nums font-semibold text-emerald-700">{baht(x.sold_amount ?? 0)}</td>}
                </tr>
              ))}
              {data.bySales.length === 0 && <tr><td colSpan={canFin ? 9 : 7} className="py-4 text-center text-ink-3">ไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* เขียนแบบ */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark flex items-center gap-2"><Icon name="pencil" size={16} /> เขียนแบบ</h3>
            <Link href="/designer" className="press text-xs text-brand font-semibold inline-flex items-center gap-1 hover:underline">เปิดหน้าเขียนแบบ <Icon name="external" size={13} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini label="เขียนเสร็จในช่วงนี้" value={drawing.done} />
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
                {drawing.byDesigner.map((d) => (
                  <tr key={d.ref ?? d.name} className="border-b border-gray-100 last:border-0">
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
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini label="ส่งใบเสนอในช่วงนี้" value={quotation.done} />
            <Mini label="ประเมิน → ส่งใบ (เฉลี่ย)" value={`${quotation.avg_days} วัน`} color="#1F4E78" />
            <Mini label="ส่งใบ → มัดจำ (ค่ากลาง)" value={`${quotation.cycle_median_days} วัน`} color="#0f7a38" />
          </div>
          <h4 className="text-xs font-semibold text-ink-2 mb-2">ใช้เวลาทำใบเสนอ (นับจากวันประเมิน)</h4>
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
          <p className="text-[11px] text-ink-3 mt-3">
            ค่ากลางเวลาทำใบเสนอ {quotation.median_days} วัน{quotation.no_time > 0 ? ` · อีก ${quotation.no_time} งานไม่มีวันประเมิน หรือวันส่งใบมาก่อนวันประเมิน (ไม่นับ)` : ""} ·
            ส่งใบ → มัดจำ เฉลี่ย {quotation.cycle_avg_days} วัน (จากงานที่มัดจำในช่วงนี้)
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ─── modal รายชื่อ ─── */
function ListModal({ m, canFin, onClose }: { m: ModalState; canFin: boolean; onClose: () => void }) {
  const showMoney = canFin && m.kind !== "lost";
  const moneyLabel = m.kind === "quoted" || m.kind === "cohort" ? "ยอดใบเสนอ (บาท)" : "ก่อน VAT (บาท)";
  const sumNet = m.rows.reduce((a, r) => a + (r.net ?? 0), 0), sumVat = m.rows.reduce((a, r) => a + (r.net_vat ?? 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={m.title} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[85vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
          <h3 className="font-bold text-ink">{m.title}</h3>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink"><Icon name="close" size={20} /></button>
        </div>
        <div className="overflow-y-auto p-3">
          {m.rows.length === 0 ? <p className="text-center text-ink-3 py-6 text-sm">ไม่มีรายการ</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                <th className="py-1.5 font-semibold">ลูกค้า</th>
                <th className="font-semibold">พื้นที่</th>
                <th className="font-semibold">เซลล์</th>
                <th className="font-semibold text-center">{m.kind === "money" ? "วันมัดจำ" : m.kind === "quoted" ? "วันส่งใบ" : m.kind === "lost" ? "วันที่" : "วันประเมิน/ส่งใบ"}</th>
                {m.kind === "cohort" && <th className="font-semibold text-center">สถานะ</th>}
                {m.kind === "cohort" && <th className="font-semibold text-center">รอมา</th>}
                {m.kind === "lost" && <th className="font-semibold">เหตุผล</th>}
                {showMoney && <th className="font-semibold text-right">{moneyLabel}</th>}
                {showMoney && m.kind === "money" && <th className="font-semibold text-right">หลัง VAT (บาท)</th>}
              </tr></thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 text-ink-2">
                      <span className="font-medium">{r.customer_name || "(ไม่มีชื่อ)"}</span>
                      {r.job_code ? <span className="text-[11px] text-ink-3"> · {r.job_code}</span> : ""}
                      {showMoney && m.kind === "money" && r.src !== "bill" && <span className={`ml-1.5 text-[10px] rounded px-1 ${r.src === "quote" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>{SRC_TH[r.src]}</span>}
                    </td>
                    <td className="text-ink-3 text-xs">{r.area}</td>
                    <td className="text-ink-3 text-xs">{r.sales}</td>
                    <td className="text-center tabular-nums text-ink-3 text-xs">{fmtDate(r.date)}</td>
                    {m.kind === "cohort" && <td className="text-center text-[11px]"><span className={`rounded-full px-2 py-0.5 font-semibold ${STAGE_TH[r.stage]?.cls ?? ""}`}>{STAGE_TH[r.stage]?.th ?? r.stage}</span></td>}
                    {m.kind === "cohort" && <td className="text-center tabular-nums text-xs text-ink-3">{r.days != null ? `${r.days} วัน` : "–"}</td>}
                    {m.kind === "lost" && <td className="text-xs text-ink-3">{r.note ?? "-"}</td>}
                    {showMoney && <td className="text-right tabular-nums text-ink-2">{baht(r.net ?? 0)}</td>}
                    {showMoney && m.kind === "money" && <td className="text-right tabular-nums text-ink-2">{baht(r.net_vat ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-black/10 text-xs text-ink-3 flex justify-between">
          <span>รวม {m.rows.length} งาน</span>
          {showMoney && <span className="tabular-nums">{moneyLabel.replace(" (บาท)", "")} {baht(sumNet)} บาท{m.kind === "money" ? <> · หลัง VAT {baht(sumVat)} บาท</> : null}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─── ชิ้นส่วน ─── */
const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
function delta(cur: number, prev: number): { txt: string; up: boolean | null } | null {
  if (!prev && !cur) return null;
  if (!prev) return { txt: "ใหม่", up: true };
  const p = Math.round(((cur - prev) / prev) * 100);
  return { txt: `${p > 0 ? "+" : ""}${p}%`, up: p > 0 ? true : p < 0 ? false : null };
}
function deltaTxt(cur: Money, prev: Money): string {
  const d = delta(cur ?? 0, prev ?? 0); return d ? ` (${d.txt})` : "";
}
function Kpi({ label, value, color, sub, delta: d, onClick }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode; delta?: ReturnType<typeof delta>; onClick?: () => void }) {
  const inner = (
    <Card className={`p-4 h-full ${onClick ? "hover:ring-2 hover:ring-brand/30" : ""}`}>
      <div className="text-xs font-medium text-ink-3 flex items-center gap-1">{label}{onClick && <Icon name="search" size={11} />}</div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <div className="text-xl sm:text-2xl font-extrabold tabular-nums" style={{ color: color ?? "#1f2127" }}>{value}</div>
        {d && <span className={`text-[11px] font-semibold tabular-nums ${d.up === true ? "text-emerald-700" : d.up === false ? "text-red-700" : "text-ink-3"}`} title="เทียบช่วงก่อนหน้า">{d.txt}</span>}
      </div>
      {sub != null && <div className="text-[11px] text-ink-3 mt-0.5 tabular-nums">{sub}</div>}
    </Card>
  );
  return onClick ? <button onClick={onClick} className="press text-left w-full h-full">{inner}</button> : inner;
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
