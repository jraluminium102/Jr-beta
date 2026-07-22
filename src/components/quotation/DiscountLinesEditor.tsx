"use client";
import { sumDiscountLines, baht, type DiscountLine } from "@/lib/money";

/**
 * DiscountLinesEditor — ส่วนลดหลายรายการในใบเสนอ (ใช้ร่วม: เครื่องคิด4.0 · ใบเสนอใหม่ · แก้ใบเสนอ)
 * แต่ละข้อ: หัวข้อ + กรอก % หรือ บาท (ผูกกัน · บาท=ตัวตั้งจริง) · กด "+ เพิ่มส่วนลด" ได้หลายข้อ
 * ยอดรวมส่วนลด (sumDiscountLines) ป้อน computeTotals เป็น discount_amt เดียว → money core ไม่กระทบ
 */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function DiscountLinesEditor({ subtotal, lines, onChange }: {
  subtotal: number;
  lines: DiscountLine[];
  onChange: (lines: DiscountLine[]) => void;
}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const set = (i: number, patch: Partial<DiscountLine>) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const add = () => onChange([...lines, { label: "", amt: 0 }]);
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));
  const total = sumDiscountLines(sub, lines);

  const inp = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus-visible:ring-2 bg-white/80 tabular-nums";

  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="text-xs font-medium text-gray-500">ส่วนลด (เพิ่มได้หลายรายการ · แต่ละข้อกรอก % หรือ บาท)</div>
      {lines.length === 0 && <div className="text-xs text-gray-400">— ยังไม่มีส่วนลด —</div>}
      {lines.map((l, i) => {
        const amt = Number(l.amt) || 0;
        const pct = sub > 0 && amt > 0 ? r2((amt / sub) * 100) : "";
        return (
          <div key={i} className="flex items-center gap-1.5 flex-wrap">
            <input type="text" value={l.label ?? ""} onChange={(e) => set(i, { label: e.target.value })}
              placeholder="หัวข้อ เช่น ค่าประเมินหน้างาน"
              className={`${inp} flex-1 min-w-[110px] text-left`} aria-label={`หัวข้อส่วนลด ${i + 1}`} />
            <input type="number" min={0} step="any" value={pct} placeholder="0"
              onChange={(e) => { const p = Math.max(0, Number(e.target.value) || 0); set(i, { amt: sub > 0 ? r2((sub * p) / 100) : 0 }); }}
              className={`${inp} w-16 text-right`} aria-label={`ส่วนลด % ข้อ ${i + 1}`} />
            <span className="text-gray-400 text-xs">%</span>
            <span className="text-gray-300">=</span>
            <input type="number" min={0} step="any" value={amt || ""} placeholder="0"
              onChange={(e) => set(i, { amt: Math.max(0, Number(e.target.value) || 0) })}
              className={`${inp} w-24 text-right`} aria-label={`ส่วนลด บาท ข้อ ${i + 1}`} />
            <span className="text-gray-400 text-xs">บาท</span>
            <button type="button" onClick={() => remove(i)} aria-label={`ลบส่วนลด ${i + 1}`}
              className="press w-7 h-7 inline-flex items-center justify-center rounded-md text-red-500 bg-red-50 border border-red-200 hover:bg-red-100">✕</button>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={add}
          className="press inline-flex items-center gap-1 text-xs font-medium text-brand-dark/80 hover:text-brand-dark border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5">
          + เพิ่มส่วนลด
        </button>
        {total > 0 && <span className="text-xs tabular-nums text-red-700 font-medium">รวมส่วนลด -฿{baht(total)}</span>}
      </div>
    </div>
  );
}
