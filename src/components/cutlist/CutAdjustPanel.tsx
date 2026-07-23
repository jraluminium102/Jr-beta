"use client";

/**
 * ปรับรายการตัดสต็อก (ต่างจาก BOQ) — ใบตัด (0107)
 *   ➖ ลดจาก BOQ (ใช้เศษเหลือ) · ➕ เพิ่มอลู (กล่อง/ฉาก/เส้นคาด — ดรอปดาวน์รูปภาพ) · ➕ เพิ่มอุปกรณ์
 *   อิง stock_item_id (sid) → cut-stock หัก = BOQ ± delta + รีมาร์กส่วนต่างในความเคลื่อนไหว
 */
import { useMemo, useState } from "react";
import type { StockLite } from "@/lib/cutlist/stock-match";

export type Adj = {
  id: string; sid: number; kind: "alu" | "hw";
  name: string; unit?: string; sku?: string; img?: string;
  qty: number;          // + = เพิ่ม · − = ลด (ใช้เศษ)
  note?: string; fromBoq?: boolean;
};

export type BoqAluLine = { code: string; color: string; bars: number; stockId?: number | null; stockName?: string };
export type BoqHwLine = { sku: string; name: string; unit: string; qty: number; stockId?: number | null };

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `a${Date.now()}${Math.floor(Math.random() * 1e6)}`);
const isAlu = (s: StockLite) => (s.category ?? "").includes("อลู") || /^[bf]\d/i.test(s.sku ?? "");
const isHw = (s: StockLite) => (s.category ?? "").includes("อุปกรณ์") || /^jr/i.test(s.sku ?? "");
const MAIN_RE = /กล่อง|ฉาก|คาด|เส้นคาด/;

export default function CutAdjustPanel({
  boqAlu, boqHw, stock, value, onChange, readOnly,
}: {
  boqAlu: BoqAluLine[]; boqHw: BoqHwLine[]; stock: StockLite[];
  value: Adj[]; onChange: (a: Adj[]) => void; readOnly: boolean;
}) {
  const [picker, setPicker] = useState<null | "alu" | "hw">(null);

  const add = (a: Adj) => onChange([...value, a]);
  const patch = (id: string, p: Partial<Adj>) => onChange(value.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => onChange(value.filter((x) => x.id !== id));

  // รายการ BOQ ที่มีในสต็อก (ลดได้) — alu + hw
  const reducible = useMemo(() => {
    const rows: { sid: number; kind: "alu" | "hw"; label: string; unit: string; computed: number; sku?: string }[] = [];
    for (const b of boqAlu) if (b.stockId) rows.push({ sid: b.stockId, kind: "alu", label: `${b.code}${b.color ? ` สี${b.color}` : ""}${b.stockName ? ` · ${b.stockName}` : ""}`, unit: "เส้น", computed: b.bars });
    for (const h of boqHw) if (h.stockId) rows.push({ sid: h.stockId, kind: "hw", label: h.name, unit: h.unit, computed: h.qty, sku: h.sku });
    return rows;
  }, [boqAlu, boqHw]);

  const onPickReduce = (sid: number) => {
    const r = reducible.find((x) => x.sid === sid);
    if (!r) return;
    add({ id: uid(), sid: r.sid, kind: r.kind, name: r.label, unit: r.unit, sku: r.sku, qty: -Math.abs(r.computed), note: "ใช้เศษ", fromBoq: true });
  };
  const onPickAdd = (s: StockLite, kind: "alu" | "hw") => {
    setPicker(null);
    if (!s.id) return;
    add({ id: uid(), sid: s.id, kind, name: s.name, unit: s.unit || (kind === "alu" ? "เส้น" : "ชิ้น"), sku: s.sku, img: s.image, qty: 1, note: "" });
  };

  const nAdd = value.filter((a) => a.qty > 0).length;
  const nCut = value.filter((a) => a.qty < 0).length;

  return (
    <div className="rounded-2xl border-2 border-amber-200 overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center justify-between flex-wrap gap-2">
        <span className="font-bold text-amber-900">🔧 ปรับก่อนตัดสต็อก (ต่างจาก BOQ)</span>
        <span className="text-xs text-amber-700">{value.length ? `เพิ่ม ${nAdd} · ลด ${nCut}` : "ปกติตัดตาม BOQ ด้านบน"}</span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-[12px] text-ink-3 -mt-1">
          ใช้เมื่อ <b>ใช้เศษเหลือ</b> (ลดออก) หรือ <b>งานดัดแปลง</b> (เพิ่มกล่อง/ฉาก/เส้นคาด/อุปกรณ์) · ตอนกดตัดออกสโตร์จะหักตามที่ปรับ แล้วรีมาร์กส่วนต่างไว้
        </p>

        {/* รายการที่ปรับไว้ */}
        {value.length > 0 && (
          <div className="space-y-2">
            {value.map((a) => {
              const cut = a.qty < 0;
              return (
                <div key={a.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${cut ? "border-red-200 bg-red-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
                  <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${cut ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{cut ? "ลด" : "เพิ่ม"}</span>
                  {a.img
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.img} alt="" className="w-8 h-6 object-cover rounded border border-black/10 shrink-0" />
                    : <span className="w-8 h-6 rounded border border-dashed border-gray-300 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{a.name}</span>
                    {a.sku && <span className="block text-[11px] font-mono text-ink-3">{a.sku}</span>}
                  </span>
                  {!readOnly ? (
                    <>
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <span className="text-sm text-ink-3">{cut ? "−" : "+"}</span>
                        <input type="text" inputMode="numeric" value={a.qty === 0 ? "" : String(Math.abs(a.qty))}
                          onChange={(e) => {
                            const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                            const mag = isNaN(n) ? 0 : n;
                            patch(a.id, { qty: (cut ? -1 : 1) * mag });
                          }}
                          className="w-14 text-center glass-soft rounded-lg px-2 py-1 outline-none tabular-nums text-sm" />
                        <span className="text-xs text-ink-3">{a.unit}</span>
                      </span>
                      <input value={a.note ?? ""} onChange={(e) => patch(a.id, { note: e.target.value })} placeholder="เหตุผล"
                        className="w-28 glass-soft rounded-lg px-2 py-1 outline-none text-xs shrink-0" />
                      <button onClick={() => remove(a.id)} className="press shrink-0 text-red-600 hover:bg-red-100 rounded-lg px-2 py-1 text-sm">✕</button>
                    </>
                  ) : (
                    <span className="shrink-0 text-sm tabular-nums font-semibold">{cut ? "−" : "+"}{Math.abs(a.qty)} {a.unit}{a.note ? ` · ${a.note}` : ""}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap gap-2 pt-1">
            {/* ลดจาก BOQ */}
            <select value="" onChange={(e) => { if (e.target.value) onPickReduce(Number(e.target.value)); e.target.value = ""; }}
              disabled={reducible.length === 0}
              className="glass-soft rounded-xl px-3 py-2 text-sm text-red-700 outline-none disabled:opacity-50 max-w-[240px]">
              <option value="">➖ ลดจาก BOQ (ใช้เศษ)…</option>
              {reducible.map((r) => <option key={r.sid} value={r.sid}>{r.label} — {r.computed} {r.unit}</option>)}
            </select>
            <button onClick={() => setPicker("alu")} className="press rounded-xl px-3 py-2 text-sm font-semibold bg-emerald-600 text-white shadow">➕ เพิ่มอลู (กล่อง/ฉาก/คาด)</button>
            <button onClick={() => setPicker("hw")} className="press rounded-xl px-3 py-2 text-sm font-semibold glass-soft text-emerald-800 border border-emerald-300">➕ เพิ่มอุปกรณ์</button>
          </div>
        )}
      </div>

      {picker && <StockPicker kind={picker} stock={stock} onPick={onPickAdd} onClose={() => setPicker(null)} />}
    </div>
  );
}

// ── ดรอปดาวน์เลือกวัสดุพร้อมรูป — ตัวหลัก (กล่อง/ฉาก/เส้นคาด) อยู่บน + ค้นหาทั้งหมด ──
function StockPicker({ kind, stock, onPick, onClose }: {
  kind: "alu" | "hw"; stock: StockLite[]; onPick: (s: StockLite, kind: "alu" | "hw") => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const pool = useMemo(() => stock.filter((s) => s.id && (kind === "alu" ? isAlu(s) : isHw(s))), [stock, kind]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    let rows = pool;
    if (query) rows = pool.filter((s) => (s.name ?? "").toLowerCase().includes(query) || (s.sku ?? "").toLowerCase().includes(query));
    // ตัวหลัก (กล่อง/ฉาก/คาด) ขึ้นก่อน เฉพาะ alu · แล้วเรียงชื่อ
    const rank = (s: StockLite) => (kind === "alu" && MAIN_RE.test(s.name ?? "") ? 0 : 1);
    return [...rows].sort((a, b) => rank(a) - rank(b) || (a.name ?? "").localeCompare(b.name ?? "", "th")).slice(0, 60);
  }, [pool, q, kind]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="font-bold text-ink-1">{kind === "alu" ? "➕ เลือกอลูเพิ่ม" : "➕ เลือกอุปกรณ์เพิ่ม"}</span>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink-1 text-xl leading-none">✕</button>
        </div>
        <div className="p-3 border-b">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส (เช่น กล่อง 4x4, ฉาก, F79...)"
            className="w-full glass-soft rounded-xl px-3 py-2.5 outline-none text-sm" />
          {!q && kind === "alu" && <p className="text-[11px] text-ink-3 mt-1.5">แสดงตัวหลัก (กล่อง/ฉาก/เส้นคาด) ก่อน · พิมพ์ค้นหาอลูตัวอื่นได้</p>}
        </div>
        <div className="overflow-y-auto p-2 space-y-1">
          {list.length === 0 && <p className="text-center text-ink-3 py-8 text-sm">ไม่พบวัสดุ — ลองพิมพ์คำอื่น</p>}
          {list.map((s) => (
            <button key={s.id} onClick={() => onPick(s, kind)}
              className="press w-full flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-emerald-50 text-left">
              {s.image
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.image} alt="" className="w-11 h-9 object-cover rounded border border-black/10 shrink-0" loading="lazy" />
                : <span className="w-11 h-9 rounded border border-dashed border-gray-300 shrink-0 inline-flex items-center justify-center text-[9px] text-ink-3">—</span>}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{s.name}</span>
                <span className="block text-[11px] text-ink-3">{s.sku ? <span className="font-mono">{s.sku}</span> : ""}{s.sku ? " · " : ""}คงเหลือ {s.qty.toLocaleString("th-TH")} {s.unit || ""}</span>
              </span>
              <span className="shrink-0 text-emerald-600 text-lg">＋</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
