"use client";

/**
 * สมุดสโตร์ (Stock Ledger) — รวมประวัติเคลื่อนไหวสโตร์ที่เดียว (แทน /stock/moves เดิม + แท็บรายวันใน /cutlist)
 *   ตัวกรองเดียว (ช่วงวัน/ประเภท/วัสดุ/หมวด/ผู้เบิก/งาน) → 4 มุมมอง (รายการ/ตามงาน/ต่อวัสดุ/สรุปเงิน)
 *   เปิดมา = วันนี้ + มุม "ตามงาน" · พิมพ์ A4 ตามมุม+ช่วงที่เปิดอยู่
 *   ⚠ default ตัด void ออก → ยอดทุกมุมตรงกัน (แก้บั๊กเดิมที่หน้ารายเดือนนับ void รวม)
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";

type Row = {
  id: number; at: string; type: "in" | "out" | "adjust";
  sku: string | null; name: string; category: string; unit: string;
  qty: number; kg: number; unitCost: number; price: number;
  who: string; note: string; ref: string; jobId: string | null; jobCode: string | null; customer: string | null; cutlistName: string;
  voided: boolean; voidReason: string; edited: boolean;
};
type Data = { from: string; to: string; rows: Row[]; cats: string[] };

const TYPE_LABEL: Record<string, string> = { in: "รับเข้า", out: "เบิกออก", adjust: "ปรับยอด" };
const TYPE_COLOR: Record<string, string> = { in: "#047857", out: "#b91c1c", adjust: "#a16207" };
const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const todayISO = () => new Date().toISOString().slice(0, 10);
const shift = (iso: string, d: number) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => { const [y1, m1, d1] = a.split("-").map(Number); const [y2, m2, d2] = b.split("-").map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
const monthStart = (iso: string) => iso.slice(0, 8) + "01";
const monthEnd = (iso: string) => { const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const nqty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const nkg = (n: number) => (n ? n.toLocaleString("th-TH", { maximumFractionDigits: 1 }) : "—");
const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${THAI_MONTH[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`; };
const fmtRange = (from: string, to: string) => (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`);

type View = "list" | "job" | "material" | "money";

export default function StockLedger({ canViewCost }: { canViewCost: boolean }) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [types, setTypes] = useState<Set<"in" | "out" | "adjust">>(new Set());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [who, setWho] = useState("");
  const [job, setJob] = useState("");
  const [voided, setVoided] = useState(false);
  const [view, setView] = useState<View>("job");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    if (types.size) p.set("type", [...types].join(","));
    if (q.trim()) p.set("q", q.trim());
    if (cat) p.set("cat", cat);
    if (who.trim()) p.set("who", who.trim());
    if (job.trim()) p.set("job", job.trim());
    if (voided) p.set("voided", "1");
    const h = setTimeout(() => {
      fetch(`/api/stock/ledger?${p.toString()}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => setData(j?.data ?? null))
        .catch((e) => { if (e.name !== "AbortError") setData(null); })
        .finally(() => setLoading(false));
    }, 250);
    return () => { ctrl.abort(); clearTimeout(h); };
  }, [from, to, types, q, cat, who, job, voided]);

  const rows = data?.rows ?? [];
  const active = rows.filter((r) => !r.voided);

  // การ์ดสรุป (ตัด void ออกจากยอดเสมอ)
  const cards = useMemo(() => {
    let inVal = 0, inCnt = 0, outVal = 0, outQty = 0, kg = 0, adjCnt = 0;
    for (const r of active) {
      if (r.type === "in") { inVal += r.price; inCnt++; }
      else if (r.type === "out") { outVal += r.price; outQty += r.qty; kg += r.kg; }
      else adjCnt++;
    }
    return { inVal, inCnt, outVal, outQty, kg, adjCnt };
  }, [active]);

  const toggleType = (t: "in" | "out" | "adjust") => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const preset = (f: string, t: string) => { setFrom(f); setTo(t); };
  const span = Math.max(1, daysBetween(from, to) + 1);
  const isToday = from === to && from === todayISO();

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } body { background: #fff; } }`}</style>
      {/* ── แถบเครื่องมือ + ตัวกรอง (ไม่พิมพ์) ── */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/stock" className="press inline-flex items-center gap-1.5 text-sm text-ink-2"><Icon name="arrowLeft" size={16} /> กลับสต๊อก</Link>
          <span className="font-bold text-brand-dark">📒 สมุดสโตร์</span>
          <span className="text-sm text-ink-3">{fmtRange(from, to)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => { setFrom(shift(from, -span)); setTo(shift(to, -span)); }} className="press rounded-lg border px-2 py-1.5 text-sm">‹</button>
            <button onClick={() => { setFrom(shift(from, span)); setTo(shift(to, span)); }} disabled={to >= todayISO()} className="press rounded-lg border px-2 py-1.5 text-sm disabled:opacity-40">›</button>
            <button onClick={() => window.print()} className="press inline-flex items-center gap-1.5 rounded-lg bg-brand text-white px-3 py-1.5 text-sm font-semibold"><Icon name="printer" size={15} /> พิมพ์</button>
          </div>
        </div>

        {/* ช่วงวัน */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {([["วันนี้", () => preset(todayISO(), todayISO())],
             ["เมื่อวาน", () => preset(shift(todayISO(), -1), shift(todayISO(), -1))],
             ["7 วัน", () => preset(shift(todayISO(), -6), todayISO())],
             ["เดือนนี้", () => preset(monthStart(todayISO()), todayISO())],
             ["เดือนก่อน", () => { const p = shift(monthStart(todayISO()), -1); preset(monthStart(p), monthEnd(p)); }],
            ] as [string, () => void][]).map(([lbl, fn]) => (
            <button key={lbl} onClick={fn} className="press rounded-lg glass-soft px-2.5 py-1.5 text-ink-2 hover:bg-white/70">{lbl}</button>
          ))}
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || from)} className="rounded-lg glass-soft px-2 py-1.5 tabular-nums" />
          <span className="text-ink-3">–</span>
          <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value || to)} className="rounded-lg glass-soft px-2 py-1.5 tabular-nums" />
        </div>

        {/* ประเภท + ค้นหา + หมวด + ผู้เบิก + งาน */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {(["in", "out", "adjust"] as const).map((t) => (
            <button key={t} onClick={() => toggleType(t)}
              className={`press rounded-lg px-2.5 py-1.5 font-semibold border ${types.has(t) ? "text-white" : "glass-soft text-ink-2"}`}
              style={types.has(t) ? { background: TYPE_COLOR[t], borderColor: TYPE_COLOR[t] } : {}}>
              {TYPE_LABEL[t]}
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 วัสดุ / SKU" className="rounded-lg glass-soft px-2.5 py-1.5 w-36" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg glass-soft px-2 py-1.5">
            <option value="">ทุกหมวด</option>
            {(data?.cats ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="ผู้เบิก" className="rounded-lg glass-soft px-2.5 py-1.5 w-24" />
          <input value={job} onChange={(e) => setJob(e.target.value)} placeholder="งาน/ลูกค้า" className="rounded-lg glass-soft px-2.5 py-1.5 w-28" />
          <label className="inline-flex items-center gap-1 text-ink-3 ml-1"><input type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} /> รวมที่ยกเลิก</label>
        </div>

        {/* มุมมอง */}
        <div className="flex items-center gap-1 border-t pt-2">
          {([["job", "📋 ตามงาน"], ["list", "🧾 รายการ"], ["material", "📦 ต่อวัสดุ"], ["money", "💰 สรุปเงิน"]] as [View, string][]).map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${view === v ? "bg-brand text-white" : "text-ink-3 hover:bg-black/5"}`}>{lbl}</button>
          ))}
          {loading && <span className="text-xs text-ink-3 ml-2">กำลังโหลด…</span>}
        </div>
      </div>

      {/* ── การ์ดสรุป (พิมพ์ด้วย) ── */}
      <div className="mx-auto max-w-[1180px] px-3 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: "รับเข้า/ซื้อเข้า", value: canViewCost ? `฿${baht(cards.inVal)}` : `${cards.inCnt} รายการ`, sub: `${cards.inCnt} รายการ`, tone: "text-emerald-700" },
          { label: "เบิกใช้ (มูลค่าต้นทุน)", value: canViewCost ? `฿${baht(cards.outVal)}` : `${nqty(cards.outQty)}`, sub: `${nqty(cards.outQty)} เส้น/ชิ้น`, tone: "text-red-700" },
          { label: "อลูมิเนียม (เบิกใช้)", value: `${nkg(cards.kg)} กก.`, sub: "เฉพาะที่คิดตามน้ำหนัก", tone: "text-ink-1" },
          { label: "ปรับยอด/นับสต๊อก", value: `${cards.adjCnt}`, sub: "ครั้งในช่วงนี้", tone: "text-amber-700" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-black/5 p-3.5 shadow-sm">
            <div className="text-xs text-ink-3">{k.label}</div>
            <div className={`text-xl font-bold tabular-nums mt-0.5 ${k.tone}`}>{k.value}</div>
            <div className="text-[11px] text-ink-3/70 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-[1180px] px-3 py-4">
        {rows.length === 0
          ? <div className="text-center text-ink-3 py-16">— {loading ? "กำลังโหลด…" : "ไม่มีความเคลื่อนไหวในช่วง/ตัวกรองนี้"} —</div>
          : view === "list" ? <ListView rows={rows} canViewCost={canViewCost} from={from} to={to} />
            : view === "job" ? <JobView rows={active} canViewCost={canViewCost} />
              : view === "material" ? <MaterialView rows={active} canViewCost={canViewCost} />
                : <MoneyView rows={active} canViewCost={canViewCost} totals={cards} />}
      </div>
    </div>
  );
}

// ── มุม A: รายการ (Timeline) — พิมพ์เป็น A4 แนวนอน หัวบริษัท ──
function ListView({ rows, canViewCost, from, to }: { rows: Row[]; canViewCost: boolean; from: string; to: string }) {
  const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at));
  const sumIn = rows.filter((r) => !r.voided && r.type === "in").reduce((s, r) => s + r.price, 0);
  const sumOut = rows.filter((r) => !r.voided && r.type === "out").reduce((s, r) => s + r.price, 0);
  return (
    <div className="mx-auto bg-white shadow-lg print:shadow-none rounded-xl print:rounded-none overflow-hidden" style={{ padding: "10mm" }}>
      <div className="flex justify-between items-start mb-3">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jr-logo.png" alt="JR" style={{ height: 30 }} />
          <div className="mt-1 text-[11px] text-gray-700 font-semibold">{COMPANY.nameFull}</div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 18, fontWeight: 700, color: "#b3151d" }}>สมุดการเคลื่อนไหววัสดุ</div>
          <div className="text-[12px] text-gray-600">{fmtRange(from, to)} · {rows.length} รายการ</div>
          {canViewCost && <div className="text-[11px] text-gray-500">รับเข้า ฿{baht(sumIn)} · เบิกใช้ ฿{baht(sumOut)}</div>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 96 }}>วันเวลา</th>
              <th className="p-1.5 text-center border border-gray-200" style={{ width: 54 }}>ประเภท</th>
              <th className="p-1.5 text-left border border-gray-200">รายการ</th>
              <th className="p-1.5 text-right border border-gray-200" style={{ width: 78 }}>จำนวน</th>
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 80 }}>ผู้เบิก/รับ</th>
              <th className="p-1.5 text-left border border-gray-200">งาน (ลูกค้า)</th>
              {canViewCost && <th className="p-1.5 text-right border border-gray-200" style={{ width: 76 }}>มูลค่า</th>}
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 110 }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} style={r.voided ? { color: "#9ca3af", textDecoration: "line-through" } : {}}>
                <td className="p-1.5 border border-gray-200 whitespace-nowrap">{new Date(r.at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="p-1.5 text-center border border-gray-200" style={{ color: TYPE_COLOR[r.type] }}>{TYPE_LABEL[r.type]}</td>
                <td className="p-1.5 border border-gray-200">{r.name}{r.sku ? <span className="text-gray-400"> · {r.sku}</span> : ""}</td>
                <td className="p-1.5 text-right border border-gray-200 tabular-nums">{r.type === "out" ? "−" : r.type === "in" ? "+" : "="}{nqty(r.qty)} {r.unit}</td>
                <td className="p-1.5 border border-gray-200">{r.who || "—"}</td>
                <td className="p-1.5 border border-gray-200">{r.customer ? `${r.jobCode ? r.jobCode + " · " : ""}${r.customer}` : (r.cutlistName || r.ref || "—")}</td>
                {canViewCost && <td className="p-1.5 text-right border border-gray-200 tabular-nums">{r.price ? baht(r.price) : "—"}</td>}
                <td className="p-1.5 border border-gray-200 text-gray-500">{r.voided ? `ยกเลิก: ${r.voidReason}` : r.note}{r.edited && !r.voided ? " (แก้แล้ว)" : ""}</td>
              </tr>
            ))}
          </tbody>
          {canViewCost && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: "#fafafa" }}>
                <td className="p-1.5 border border-gray-200 text-right" colSpan={6}>รวมรับเข้า / เบิกใช้ (ไม่รวมที่ยกเลิก)</td>
                <td className="p-1.5 text-right border border-gray-200 tabular-nums">฿{baht(sumIn)} / ฿{baht(sumOut)}</td>
                <td className="border border-gray-200" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="mt-3 text-[10px] text-gray-400">* ราคาต้นทุนตามจ่ายจริง (บริษัทไม่จด VAT) · มูลค่าเบิก = ต้นทุนถัวเฉลี่ย ณ วันเบิก · ไม่รวมรายการที่ยกเลิก</div>
    </div>
  );
}

// ── มุม B: จัดกลุ่มตามงาน (เบิกออก) + รับเข้าเป็นลิสต์ ──
function JobView({ rows, canViewCost }: { rows: Row[]; canViewCost: boolean }) {
  const groups = useMemo(() => {
    const g = new Map<string, { title: string; ref: string; isJob: boolean; who: Set<string>; price: number; mats: Map<string, { sku: string | null; name: string; unit: string; qty: number; kg: number }> }>();
    for (const r of rows.filter((x) => x.type === "out")) {
      const key = r.jobId ? `j:${r.jobId}` : r.ref ? `r:${r.ref}` : "other";
      const e = g.get(key) ?? { title: r.jobId ? (r.customer ?? "—") : r.cutlistName || r.ref || "งานเบิกอื่น ๆ", ref: r.jobId ? (r.jobCode ?? "") : r.ref, isJob: !!r.jobId, who: new Set(), price: 0, mats: new Map() };
      const mk = r.sku || r.name;
      const m = e.mats.get(mk) ?? { sku: r.sku, name: r.name, unit: r.unit, qty: 0, kg: 0 };
      m.qty += r.qty; m.kg += r.kg; e.mats.set(mk, m);
      e.price += r.price; if (r.who) e.who.add(r.who);
      g.set(key, e);
    }
    return [...g.values()].sort((a, b) => (a.isJob === b.isJob ? a.title.localeCompare(b.title) : a.isJob ? -1 : 1));
  }, [rows]);
  const receives = rows.filter((r) => r.type === "in").sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="text-sm font-bold text-red-700">⬇️ เบิกออก / ตัดใช้งาน <span className="text-xs font-normal text-ink-3">({groups.length} งาน)</span></div>
        {groups.length === 0 ? <Empty text="ไม่มีการเบิกออกในช่วงนี้" /> : groups.map((g, i) => (
          <div key={i} className="rounded-2xl bg-white border border-black/5 p-4 shadow-sm">
            <div className="flex items-baseline gap-2 flex-wrap mb-2">
              <span className="font-bold text-ink-1 text-[15px]">{g.title}</span>
              {g.ref && <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">{g.ref}</span>}
              {!g.isJob && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">งานเบิก (ไม่ผูกลูกค้า)</span>}
              {g.who.size > 0 && <span className="text-[12px] text-ink-3">ผู้เบิก: <b className="text-ink-2">{[...g.who].join(", ")}</b></span>}
              {canViewCost && <span className="ml-auto text-[13px] font-semibold text-ink-2 tabular-nums">฿{baht(g.price)}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5"><th className="py-1.5 pr-2 font-medium">รหัส</th><th className="py-1.5 pr-2 font-medium">วัสดุ</th><th className="py-1.5 pr-2 font-medium text-right">จำนวน</th><th className="py-1.5 pr-2 font-medium text-right">กก.</th></tr></thead>
                <tbody>
                  {[...g.mats.values()].sort((a, b) => (a.sku || a.name).localeCompare(b.sku || b.name)).map((m, j) => (
                    <tr key={j} className="border-b border-black/[0.04] last:border-0">
                      <td className="py-1.5 pr-2 font-mono text-ink-2">{m.sku || "—"}</td>
                      <td className="py-1.5 pr-2 text-ink-1">{m.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-1">{nqty(m.qty)} {m.unit}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-3">{nkg(m.kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-bold text-emerald-700">⬆️ รับเข้า / ซื้อเข้า <span className="text-xs font-normal text-ink-3">({receives.length} รายการ)</span></div>
        {receives.length === 0 ? <Empty text="ไม่มีการรับเข้าในช่วงนี้" /> : (
          <div className="rounded-2xl bg-white border border-black/5 overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]"><th className="px-3 py-2 font-medium">วันเวลา</th><th className="px-3 py-2 font-medium">รหัส</th><th className="px-3 py-2 font-medium w-full">วัสดุ</th><th className="px-3 py-2 font-medium text-right">จำนวน</th>{canViewCost && <th className="px-3 py-2 font-medium text-right">ต้นทุน/หน่วย</th>}{canViewCost && <th className="px-3 py-2 font-medium text-right">รวม</th>}<th className="px-3 py-2 font-medium">ผู้รับ</th><th className="px-3 py-2 font-medium">หมายเหตุ</th></tr></thead>
              <tbody>
                {receives.map((r) => (
                  <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="px-3 py-2 text-ink-3 tabular-nums whitespace-nowrap">{new Date(r.at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2 font-mono text-ink-2">{r.sku || "—"}</td>
                    <td className="px-3 py-2 text-ink-1">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold whitespace-nowrap">+{nqty(r.qty)} {r.unit}</td>
                    {canViewCost && <td className="px-3 py-2 text-right tabular-nums text-ink-3">{r.unitCost ? baht(r.unitCost) : "—"}</td>}
                    {canViewCost && <td className="px-3 py-2 text-right tabular-nums text-ink-1">{r.price ? `฿${baht(r.price)}` : "—"}</td>}
                    <td className="px-3 py-2 text-ink-2">{r.who || "—"}</td>
                    <td className="px-3 py-2 text-ink-3 text-xs">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── มุม C: สรุปต่อวัสดุ ──
function MaterialView({ rows, canViewCost }: { rows: Row[]; canViewCost: boolean }) {
  const mats = useMemo(() => {
    const g = new Map<string, { sku: string | null; name: string; category: string; unit: string; inQty: number; outQty: number; kg: number; outVal: number }>();
    for (const r of rows) {
      if (r.type === "adjust") continue;
      const k = r.sku || r.name;
      const e = g.get(k) ?? { sku: r.sku, name: r.name, category: r.category, unit: r.unit, inQty: 0, outQty: 0, kg: 0, outVal: 0 };
      if (r.type === "in") e.inQty += r.qty;
      else { e.outQty += r.qty; e.kg += r.kg; e.outVal += r.price; }
      g.set(k, e);
    }
    return [...g.values()].sort((a, b) => b.outQty - a.outQty || (a.sku || a.name).localeCompare(b.sku || b.name));
  }, [rows]);
  return (
    <div className="rounded-2xl bg-white border border-black/5 overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]"><th className="px-3 py-2 font-medium">รหัส</th><th className="px-3 py-2 font-medium w-full">วัสดุ</th><th className="px-3 py-2 font-medium">หมวด</th><th className="px-3 py-2 font-medium text-right">รับเข้า</th><th className="px-3 py-2 font-medium text-right">เบิกออก</th><th className="px-3 py-2 font-medium text-right">สุทธิ</th><th className="px-3 py-2 font-medium text-right">กก.</th>{canViewCost && <th className="px-3 py-2 font-medium text-right">มูลค่าเบิก</th>}</tr></thead>
        <tbody>
          {mats.map((m, i) => (
            <tr key={i} className="border-b border-black/[0.04] last:border-0">
              <td className="px-3 py-2 font-mono text-ink-2">{m.sku || "—"}</td>
              <td className="px-3 py-2 text-ink-1">{m.name}</td>
              <td className="px-3 py-2 text-ink-3 text-xs">{m.category}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{m.inQty ? `+${nqty(m.inQty)}` : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-700 font-semibold">{m.outQty ? `−${nqty(m.outQty)}` : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">{nqty(m.inQty - m.outQty)} {m.unit}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-3">{nkg(m.kg)}</td>
              {canViewCost && <td className="px-3 py-2 text-right tabular-nums text-ink-1">{m.outVal ? `฿${baht(m.outVal)}` : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── มุม D: สรุปเงิน + ตามผู้เบิก ──
function MoneyView({ rows, canViewCost, totals }: { rows: Row[]; canViewCost: boolean; totals: { inVal: number; outVal: number } }) {
  const byWho = useMemo(() => {
    const g = new Map<string, { who: string; cnt: number; qty: number; val: number }>();
    for (const r of rows.filter((x) => x.type === "out")) {
      const w = r.who || "(ไม่ระบุ)";
      const e = g.get(w) ?? { who: w, cnt: 0, qty: 0, val: 0 };
      e.cnt++; e.qty += r.qty; e.val += r.price; g.set(w, e);
    }
    return [...g.values()].sort((a, b) => b.val - a.val || b.qty - a.qty);
  }, [rows]);
  return (
    <div className="space-y-4">
      {canViewCost && (
        <div className="grid grid-cols-3 gap-3">
          {[["รับเข้ารวม", totals.inVal, "text-emerald-700"], ["เบิกใช้รวม", totals.outVal, "text-red-700"], ["สุทธิ (รับ−เบิก)", totals.inVal - totals.outVal, "text-ink-1"]].map(([l, v, t]) => (
            <div key={l as string} className="rounded-2xl bg-white border border-black/5 p-4 shadow-sm">
              <div className="text-xs text-ink-3">{l as string}</div>
              <div className={`text-xl font-bold tabular-nums mt-0.5 ${t as string}`}>฿{baht(v as number)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-white border border-black/5 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 border-b border-black/5 font-semibold text-ink-2 text-sm">เบิกใช้ตามผู้เบิก</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]"><th className="px-3 py-2 font-medium w-full">ผู้เบิก</th><th className="px-3 py-2 font-medium text-right">จำนวนครั้ง</th><th className="px-3 py-2 font-medium text-right">รวมเส้น/ชิ้น</th>{canViewCost && <th className="px-3 py-2 font-medium text-right">มูลค่า</th>}</tr></thead>
            <tbody>
              {byWho.map((w, i) => (
                <tr key={i} className="border-b border-black/[0.04] last:border-0">
                  <td className="px-3 py-2 text-ink-1">{w.who}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">{w.cnt}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">{nqty(w.qty)}</td>
                  {canViewCost && <td className="px-3 py-2 text-right tabular-nums text-ink-1">฿{baht(w.val)}</td>}
                </tr>
              ))}
              {byWho.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-3">ไม่มีการเบิกออกในช่วงนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-white border border-black/5 p-8 text-center text-ink-3 text-sm shadow-sm">{text}</div>;
}
