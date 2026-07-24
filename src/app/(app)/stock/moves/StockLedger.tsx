"use client";

/**
 * สมุดสโตร์ (Stock Ledger) — เรียบง่าย เอาแค่ที่สโตร์ใช้จริง
 *   เลือกช่วงวัน (เปิดมา = วันนี้) → เห็น 2 อย่าง: "เบิกออก (ตามงาน) + รับเข้า"
 *   สลับมุม "นับรายวัน" = เทียบยอดระบบกับของจริง → ต่างกด "ปรับให้ตรง" (adjust move อัตโนมัติ + เหตุผล)
 *   ค้นหาช่องเดียว (วัสดุ/คนเบิก/งาน) · พิมพ์ A4 landscape · ตัดที่ยกเลิกออกเสมอ
 */
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import JobPicker, { type StockJob } from "@/components/stock/JobPicker";

type Row = {
  id: number; at: string; type: "in" | "out" | "adjust";
  sid: number | null; onHand: number;
  sku: string | null; name: string; category: string; unit: string;
  qty: number; kg: number; unitCost: number; price: number;
  who: string; note: string; ref: string; jobId: string | null; jobCode: string | null; customer: string | null; cutlistName: string;
  voided: boolean; voidReason: string; edited: boolean;
};
type Data = { from: string; to: string; rows: Row[]; cats: string[] };

const TYPE_LABEL: Record<string, string> = { in: "รับเข้า", out: "เบิกออก", adjust: "ปรับยอด" };
const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const todayISO = () => new Date().toISOString().slice(0, 10);
const shift = (iso: string, d: number) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => { const [y1, m1, d1] = a.split("-").map(Number); const [y2, m2, d2] = b.split("-").map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
const monthStart = (iso: string) => iso.slice(0, 8) + "01";
const monthEnd = (iso: string) => { const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const nqty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const nkg = (n: number) => (n ? n.toLocaleString("th-TH", { maximumFractionDigits: 1 }) : "—");
const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${THAI_MONTH[m - 1]} ${(y + 543) % 100}`; };
const fmtRange = (from: string, to: string) => (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`);
const timeBK = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

type View = "moves" | "count";

export default function StockLedger({ canViewCost, canRelink }: { canViewCost: boolean; canRelink?: boolean }) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("moves");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/stock/ledger?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => setData(j?.data ?? null))
      .catch((e) => { if (e.name !== "AbortError") setData(null); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [from, to, reload]);

  // ตัดที่ยกเลิกออกเสมอ + ค้นหาช่องเดียว (วัสดุ/SKU/คนเบิก/งาน/ลูกค้า)
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (r.voided) return false;
      if (!qq) return true;
      return `${r.name} ${r.sku ?? ""} ${r.who} ${r.customer ?? ""} ${r.jobCode ?? ""} ${r.ref} ${r.cutlistName}`.toLowerCase().includes(qq);
    });
  }, [data, q]);

  const preset = (f: string, t: string) => { setFrom(f); setTo(t); };
  const span = Math.max(1, daysBetween(from, to) + 1);
  const isMonthMode = from === monthStart(from) && (to === monthEnd(from) || to === todayISO());
  const prevRange: [string, string] = isMonthMode
    ? (() => { const a = shift(monthStart(from), -1); return [monthStart(a), monthEnd(a)]; })()
    : [shift(from, -span), shift(to, -span)];
  const nextRange: [string, string] = isMonthMode
    ? (() => { const a = shift(monthEnd(to), 1); return [monthStart(a), monthEnd(a) > todayISO() ? todayISO() : monthEnd(a)]; })()
    : [shift(from, span), shift(to, span)];
  const nextDisabled = nextRange[0] > todayISO();

  const presetBtns: [string, () => void][] = [
    ["วันนี้", () => preset(todayISO(), todayISO())],
    ["เมื่อวาน", () => preset(shift(todayISO(), -1), shift(todayISO(), -1))],
    ["7 วัน", () => preset(shift(todayISO(), -6), todayISO())],
    ["เดือนนี้", () => preset(monthStart(todayISO()), todayISO())],
  ];

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } body { background: #fff; } }`}</style>

      {/* ── แถบเครื่องมือ (ไม่พิมพ์) ── */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/stock" className="press inline-flex items-center gap-1.5 text-sm text-ink-2"><Icon name="arrowLeft" size={16} /> กลับสต๊อก</Link>
          <span className="font-bold text-brand-dark">📒 สมุดสโตร์</span>
          <span className="text-sm text-ink-3">{fmtRange(from, to)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => preset(prevRange[0], prevRange[1])} title="ก่อนหน้า" className="press rounded-lg border px-2.5 py-1.5 text-sm">‹</button>
            <button onClick={() => preset(nextRange[0], nextRange[1])} disabled={nextDisabled} title="ถัดไป" className="press rounded-lg border px-2.5 py-1.5 text-sm disabled:opacity-40">›</button>
            <button onClick={() => window.print()} className="press inline-flex items-center gap-1.5 rounded-lg bg-brand text-white px-3 py-1.5 text-sm font-semibold"><Icon name="printer" size={15} /> พิมพ์</button>
          </div>
        </div>

        {/* ช่วงวัน + ค้นหา */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {presetBtns.map(([lbl, fn]) => (
            <button key={lbl} onClick={fn} className="press rounded-lg glass-soft px-2.5 py-1.5 text-ink-2 hover:bg-white/70">{lbl}</button>
          ))}
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || from)} className="rounded-lg glass-soft px-2.5 py-1.5 outline-none tabular-nums" />
          <span className="text-ink-3">–</span>
          <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value || to)} className="rounded-lg glass-soft px-2.5 py-1.5 outline-none tabular-nums" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหา วัสดุ / คนเบิก / งาน" className="rounded-lg glass-soft px-2.5 py-1.5 outline-none w-52 ml-1" />
          {loading && <span className="text-ink-3 ml-1">กำลังโหลด…</span>}
        </div>

        {/* 2 มุมมอง */}
        <div className="flex items-center gap-1 border-t pt-2">
          {([["moves", "📋 ความเคลื่อนไหว"], ["count", "🔢 นับรายวัน"]] as [View, string][]).map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} className={`px-3.5 py-1.5 text-sm font-semibold rounded-lg ${view === v ? "bg-brand text-white" : "text-ink-3 hover:bg-black/5"}`}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── หัวรายงานตอนพิมพ์ ── */}
      <div className="hidden print:block px-2 pb-2 mb-2 border-b border-gray-300">
        <div className="flex justify-between items-start">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jr-logo.png" alt="JR" style={{ height: 28 }} />
            <div className="text-[11px] text-gray-700 font-semibold mt-0.5">{COMPANY.nameFull}</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 16, fontWeight: 700, color: "#b3151d" }}>สมุดสโตร์ · ความเคลื่อนไหววัสดุ</div>
            <div className="text-[12px] text-gray-600">{fmtRange(from, to)} · {rows.length} รายการ</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-3 py-4">
        {loading && !data
          ? <div className="text-center text-ink-3 py-16">— กำลังโหลด… —</div>
          : view === "count"
            ? <CountView rows={rows} reload={() => setReload((x) => x + 1)} />
            : rows.length === 0
              ? <div className="text-center text-ink-3 py-16">— ไม่มีความเคลื่อนไหวในช่วง/ตัวกรองนี้ —</div>
              : <MovesView rows={rows} canViewCost={canViewCost} canRelink={!!canRelink} onRelinked={() => setReload((x) => x + 1)} />}
      </div>
    </div>
  );
}

// ── มุม: ความเคลื่อนไหว — เบิกออก (จัดกลุ่มตามงาน) + รับเข้า (ลิสต์) ──
function MovesView({ rows, canViewCost, canRelink, onRelinked }: { rows: Row[]; canViewCost: boolean; canRelink: boolean; onRelinked: () => void }) {
  const groups = useMemo(() => {
    const g = new Map<string, { title: string; ref: string; refText: string; isJob: boolean; count: number; who: Set<string>; price: number; mats: Map<string, { sku: string | null; name: string; unit: string; qty: number; kg: number }> }>();
    for (const r of rows.filter((x) => x.type === "out")) {
      const key = r.jobId ? `j:${r.jobId}` : r.ref ? `r:${r.ref}` : "other";
      const e = g.get(key) ?? { title: r.jobId ? (r.customer ?? "—") : r.cutlistName || r.ref || "งานเบิกอื่น ๆ", ref: r.jobId ? (r.jobCode ?? "") : r.ref, refText: r.jobId ? "" : r.ref, isJob: !!r.jobId, count: 0, who: new Set(), price: 0, mats: new Map() };
      const mk = r.sku || r.name;
      const m = e.mats.get(mk) ?? { sku: r.sku, name: r.name, unit: r.unit, qty: 0, kg: 0 };
      m.qty += r.qty; m.kg += r.kg; e.mats.set(mk, m);
      e.price += r.price; e.count += 1; if (r.who) e.who.add(r.who);
      g.set(key, e);
    }
    return [...g.values()].sort((a, b) => (a.isJob === b.isJob ? a.title.localeCompare(b.title) : a.isJob ? -1 : 1));
  }, [rows]);
  const receives = rows.filter((r) => r.type === "in").sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      {/* เบิกออก */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-red-700">⬇️ เบิกออก / ตัดใช้งาน <span className="text-xs font-normal text-ink-3">({groups.length} งาน)</span></div>
        {groups.length === 0 ? <Empty text="ไม่มีการเบิกออกในช่วงนี้" /> : groups.map((g, i) => (
          <div key={i} className="rounded-2xl bg-white border border-black/5 p-4 shadow-sm print:shadow-none" style={{ breakInside: "avoid" }}>
            <div className="flex items-baseline gap-2 flex-wrap mb-2">
              <span className="font-bold text-ink-1 text-[15px]">{g.title}</span>
              {g.ref && <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">{g.ref}</span>}
              {!g.isJob && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">งานเบิก (ไม่ผูกลูกค้า)</span>}
              {g.who.size > 0 && <span className="text-[12px] text-ink-3">ผู้เบิก: <b className="text-ink-2">{[...g.who].join(", ")}</b></span>}
              {canViewCost && <span className="ml-auto text-[13px] font-semibold text-ink-2 tabular-nums">฿{baht(g.price)}</span>}
            </div>
            {!g.isJob && canRelink && g.refText.trim() && <RelinkRow refText={g.refText} count={g.count} onDone={onRelinked} />}
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

      {/* รับเข้า */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-emerald-700">⬆️ รับเข้า / ซื้อเข้า <span className="text-xs font-normal text-ink-3">({receives.length} รายการ)</span></div>
        {receives.length === 0 ? <Empty text="ไม่มีการรับเข้าในช่วงนี้" /> : (
          <div className="rounded-2xl bg-white border border-black/5 overflow-hidden shadow-sm print:shadow-none overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]"><th className="px-3 py-2 font-medium">วันเวลา</th><th className="px-3 py-2 font-medium">รหัส</th><th className="px-3 py-2 font-medium w-full">วัสดุ</th><th className="px-3 py-2 font-medium text-right">จำนวน</th>{canViewCost && <th className="px-3 py-2 font-medium text-right">รวม</th>}<th className="px-3 py-2 font-medium">ผู้รับ</th><th className="px-3 py-2 font-medium">หมายเหตุ</th></tr></thead>
              <tbody>
                {receives.map((r) => (
                  <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
                    <td className="px-3 py-2 text-ink-3 tabular-nums whitespace-nowrap">{timeBK(r.at)}</td>
                    <td className="px-3 py-2 font-mono text-ink-2">{r.sku || "—"}</td>
                    <td className="px-3 py-2 text-ink-1">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold whitespace-nowrap">+{nqty(r.qty)} {r.unit}</td>
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

// ── มุม: นับรายวัน — จัดกลุ่มตามลูกค้า (ป้ายคลิก → ดูรายการที่เบิก) · รวมเบิกเอง+เบิกใบตัดชื่อเดียวกัน + ป้ายไม่ระบุ/รับเข้า ──
const isCL = (ref: string) => /^CL-/i.test((ref || "").trim());

type CountItem = { sid: number; sku: string | null; name: string; unit: string; onHand: number; qty: number; sources: Set<string> };
type CountGroup = { key: string; label: string; none: boolean; lastAt: string; items: Map<number, CountItem> };

function CountView({ rows, reload }: { rows: Row[]; reload: () => void }) {
  // จัดกลุ่มเบิกออกตาม "ชื่อลูกค้า" (customer ถ้าผูกงาน · ไม่งั้นชื่อที่พิมพ์/ชื่อใบตัด) → รวมเบิกเอง+ใบตัดถ้าชื่อตรงกัน
  const { groups, received } = useMemo(() => {
    const g = new Map<string, CountGroup>();
    for (const r of rows) {
      if (r.type !== "out" || r.sid == null) continue;
      const src = isCL(r.ref) ? "ใบตัด" : "เบิกเอง";
      const nm = (r.customer || "").trim() || (isCL(r.ref) ? (r.cutlistName || "").trim() : (r.ref || "").trim());
      const key = nm || "__none__";
      const grp = g.get(key) ?? { key, label: nm || "ไม่ระบุลูกค้า", none: !nm, lastAt: "", items: new Map<number, CountItem>() };
      const it = grp.items.get(r.sid) ?? { sid: r.sid, sku: r.sku, name: r.name, unit: r.unit, onHand: r.onHand, qty: 0, sources: new Set<string>() };
      it.qty += r.qty; it.onHand = r.onHand; it.sources.add(src);
      grp.items.set(r.sid, it);
      if (r.at > grp.lastAt) grp.lastAt = r.at;
      g.set(key, grp);
    }
    const groups = [...g.values()].sort((a, b) => (a.none === b.none ? b.lastAt.localeCompare(a.lastAt) : a.none ? 1 : -1));
    const received = rows.filter((r) => r.type === "in").sort((a, b) => b.at.localeCompare(a.at));
    return { groups, received };
  }, [rows]);

  const [sel, setSel] = useState<string>("");
  useEffect(() => {
    const keys = [...groups.map((x) => x.key), received.length ? "__in__" : ""].filter(Boolean);
    if (!keys.includes(sel)) setSel(keys[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, received]);

  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const setCount = (sid: number, v: string) => setCounts((s) => ({ ...s, [sid]: v.replace(/[^0-9.]/g, "") }));
  const diffOf = (sid: number, onHand: number) => { const c = counts[sid]; if (c == null || c === "") return null; const n = parseFloat(c); return isNaN(n) ? null : Math.round((n - onHand) * 100) / 100; };

  async function fix(sid: number, name: string, onHand: number) {
    const c = parseFloat(counts[sid]); if (isNaN(c)) return;
    const reason = window.prompt(`ปรับ "${name}"\nยอดระบบ ${onHand} → นับจริง ${c}\nเหตุผล (ไม่บังคับ):`, "นับสต๊อกรายวัน");
    if (reason === null) return;
    setBusy(sid);
    try {
      const res = await fetch(`/api/stock/${sid}/move`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "adjust", qty: c, ref: "นับรายวัน", note: (reason || "นับสต๊อกรายวัน") }),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); alert(j?.error ?? "ปรับไม่สำเร็จ"); return; }
      setCounts((s) => { const n = { ...s }; delete n[sid]; return n; });
      reload();
    } finally { setBusy(null); }
  }

  const active = groups.find((x) => x.key === sel);
  const showIn = sel === "__in__";
  const activeItems = active ? [...active.items.values()].sort((a, b) => (a.sku || a.name).localeCompare(b.sku || b.name, "th")) : [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 no-print">
        🔢 นับรายวัน — <b>เลือกป้าย</b> (ลูกค้า / ไม่ระบุ / รับเข้า) เพื่อดูรายการที่เบิก · กรอก <b>นับจริง</b> เทียบ “ยอดระบบ” (คงเหลือปัจจุบัน) ต่างกด <b>“ปรับให้ตรง”</b>
        <div className="text-[12px] text-amber-800 mt-1">💡 ไม่ได้นับทุกวัน? เลือกช่วง <b>7 วัน / เดือนนี้</b> ด้านบน แล้วนับรวดเดียว</div>
      </div>

      {groups.length === 0 && received.length === 0 ? <Empty text="ช่วงนี้ยังไม่มีความเคลื่อนไหวให้นับ" /> : (
        <>
          {/* ── ป้าย (chips) ── */}
          <div className="flex flex-wrap gap-2">
            {groups.map((grp) => (
              <Chip key={grp.key} active={sel === grp.key} tone={grp.none ? "amber" : "sky"} label={grp.label} badge={grp.items.size} onClick={() => setSel(grp.key)} />
            ))}
            {received.length > 0 && (
              <Chip active={showIn} tone="emerald" label="📥 รับเข้า" badge={received.length} onClick={() => setSel("__in__")} />
            )}
          </div>

          {/* ── รายการของป้ายที่เลือก ── */}
          {showIn ? (
            <div className="rounded-2xl bg-white border border-black/5 overflow-hidden shadow-sm overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-black/5 font-semibold text-emerald-700 text-sm">📥 รับเข้า / ซื้อเข้า <span className="text-xs font-normal text-ink-3">({received.length} รายการ)</span></div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]"><th className="px-3 py-2 font-medium">วันเวลา</th><th className="px-3 py-2 font-medium">รหัส</th><th className="px-3 py-2 font-medium w-full">วัสดุ</th><th className="px-3 py-2 font-medium text-right">จำนวน</th><th className="px-3 py-2 font-medium">ผู้รับ</th></tr></thead>
                <tbody>
                  {received.map((r) => (
                    <tr key={r.id} className="border-b border-black/[0.04] last:border-0">
                      <td className="px-3 py-2 text-ink-3 tabular-nums whitespace-nowrap">{timeBK(r.at)}</td>
                      <td className="px-3 py-2 font-mono text-ink-2">{r.sku || "—"}</td>
                      <td className="px-3 py-2 text-ink-1">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold whitespace-nowrap">+{nqty(r.qty)} {r.unit}</td>
                      <td className="px-3 py-2 text-ink-2">{r.who || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : active ? (
            <div className="rounded-2xl bg-white border border-black/5 overflow-hidden shadow-sm overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-black/5 flex items-center gap-2 flex-wrap">
                <span className="font-bold text-ink-1">{active.label}</span>
                {active.none && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">ไม่ผูกลูกค้า</span>}
                <span className="text-xs text-ink-3">· เบิก {active.items.size} รายการ</span>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                  <th className="px-3 py-2 font-medium">รหัส</th><th className="px-3 py-2 font-medium w-full">วัสดุ</th>
                  <th className="px-3 py-2 font-medium text-right">เบิกไป</th>
                  <th className="px-3 py-2 font-medium text-right">ยอดระบบ<div className="text-[10px] font-normal text-ink-3/80">คงเหลือตอนนี้</div></th>
                  <th className="px-3 py-2 font-medium text-center">นับจริง</th><th className="px-3 py-2 font-medium text-right">ส่วนต่าง</th><th className="px-3 py-2 font-medium no-print"></th>
                </tr></thead>
                <tbody>
                  {activeItems.map((it) => {
                    const d = diffOf(it.sid, it.onHand);
                    return (
                      <tr key={it.sid} className="border-b border-black/[0.04] last:border-0">
                        <td className="px-3 py-2 font-mono text-ink-2 align-top">{it.sku || "—"}</td>
                        <td className="px-3 py-2 text-ink-1 align-top">
                          {it.name}
                          <span className="ml-1.5 inline-flex gap-1">
                            {[...it.sources].map((s) => (
                              <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded ${s === "ใบตัด" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700"}`}>{s}</span>
                            ))}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-700 align-top whitespace-nowrap">−{nqty(it.qty)} {it.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold align-top">{nqty(it.onHand)} {it.unit}</td>
                        <td className="px-3 py-2 text-center align-top">
                          <input type="text" inputMode="decimal" value={counts[it.sid] ?? ""} onChange={(e) => setCount(it.sid, e.target.value)}
                            placeholder="นับ" className="w-20 text-center glass-soft rounded-lg px-2 py-1 outline-none tabular-nums" />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold align-top">{d == null ? "" : d === 0 ? <span className="text-emerald-700">✓ ตรง</span> : <span className="text-red-600">{d > 0 ? "+" : ""}{nqty(d)}</span>}</td>
                        <td className="px-3 py-2 text-right no-print align-top">
                          {d != null && d !== 0 && (
                            <button onClick={() => fix(it.sid, it.name, it.onHand)} disabled={busy === it.sid}
                              className="press rounded-lg bg-amber-500 text-white px-2.5 py-1 text-xs font-semibold disabled:opacity-50">ปรับให้ตรง</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ป้ายคลิก (chip) สำหรับนับรายวัน
function Chip({ active, tone, label, badge, onClick }: { active: boolean; tone: "sky" | "amber" | "emerald"; label: string; badge: number; onClick: () => void }) {
  const tones: Record<string, string> = {
    sky: active ? "bg-sky-600 text-white border-sky-600" : "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100",
    amber: active ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
    emerald: active ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
  };
  return (
    <button onClick={onClick} className={`press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${tones[tone]}`}>
      <span className="max-w-[200px] truncate">{label}</span>
      <span className={`text-[11px] rounded-full px-1.5 ${active ? "bg-white/25" : "bg-black/10"}`}>{badge}</span>
    </button>
  );
}

// ── ผูกงานย้อนหลัง: กลุ่มที่ "พิมพ์ชื่อไว้เอง" (ยังไม่ผูกงาน) → เลือกงานจริง → ผูกทุก move ที่ ref เดียวกัน ──
function RelinkRow({ refText, count, onDone }: { refText: string; count: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<StockJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function link(j: StockJob) {
    setJob(j); setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/stock/relink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: refText, job_id: j.id }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setMsg(d?.error ?? "ผูกไม่สำเร็จ"); setBusy(false); setJob(null); return; }
      setMsg(`✓ ผูกกับ ${j.customer_name} แล้ว (${d?.data?.linked ?? 0} รายการ)`);
      setTimeout(onDone, 800);
    } catch { setMsg("ผูกไม่สำเร็จ"); setBusy(false); setJob(null); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="no-print press mb-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-dark bg-brand/5 border border-brand/20 rounded-lg px-2.5 py-1">
      🔗 ผูกงานย้อนหลัง
    </button>
  );
  return (
    <div className="no-print mb-3 rounded-xl border border-brand/20 bg-brand/5 p-3 space-y-2">
      <div className="text-[12px] text-ink-2">ผูก “<b>{refText}</b>” (<b>{count} รายการ</b>) เข้ากับงานจริง — เลือกงานแล้วผูกทันที · ค้นได้ทุกงานแม้จบแล้ว</div>
      <JobPicker value={job} onPick={(j) => { if (j) link(j); }} compact all autoOpen initialQuery={refText.replace(/^คุณ\s*/, "")} />
      {msg && <div className={`text-[12px] ${msg.startsWith("✓") ? "text-emerald-700" : "text-red-600"}`}>{msg}</div>}
      {busy && !msg && <div className="text-[12px] text-ink-3">กำลังผูก…</div>}
      {!busy && <button onClick={() => { setOpen(false); setMsg(""); }} className="text-[11px] text-ink-3 hover:text-ink-1">ยกเลิก</button>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-white border border-black/5 p-8 text-center text-ink-3 text-sm shadow-sm">{text}</div>;
}
