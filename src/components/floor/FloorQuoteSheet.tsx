"use client";

import { useEffect, useRef, useState } from "react";
import { baht } from "@/lib/money";
import { groupItems, DEFAULT_FOOTER_NOTES } from "@/lib/floor-calc/engine.mjs";

/**
 * ใบเสนอราคางานพื้น — กระดาษ A4 จริง ที่ "แก้ตรงบนใบได้เลย"
 *
 * ⭐ คอมโพเนนต์เดียวใช้ทั้ง 2 ที่: หน้าแก้ไข (editable) และหน้าพิมพ์ (อ่านอย่างเดียว)
 *    → สิ่งที่เห็นตอนแก้ = สิ่งที่พิมพ์ออกมา เป๊ะเสมอ ไม่มีทางเพี้ยนกัน
 *    (บทเรียนเดียวกับตารางผลิต/ลิงก์ช่าง ที่ต้องใช้ตัวสร้างแถวร่วมกัน)
 *
 * ช่องตัวเลขโชว์แบบมีลูกน้ำเหมือนบนใบ พอคลิกถึงเปลี่ยนเป็นเลขดิบให้พิมพ์
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * ช่องตัวเลข — ยังไม่แตะ = เป็น "ข้อความ" เหมือนบนใบพิมพ์เป๊ะ (ไม่ใช่กล่อง input ที่ตัดเลขทิ้ง)
 * คลิกเมื่อไหร่ถึงกลายเป็นช่องกรอกเลขดิบ · ออกจากช่องก็กลับเป็นข้อความ
 */
function NumCell({ value, onChange, dash = false }: {
  value: number | null | undefined;
  onChange: (v: string) => void;
  /** true = ค่าว่างพิมพ์ "-" (ช่องค่าวัสดุ/ค่าแรงบนใบช่างเป็นแบบนี้) */
  dash?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const empty = value == null || (value as unknown as string) === "";
  if (!editing) {
    return (
      <span
        role="button" tabIndex={0}
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
        className="block text-right tabular-nums cursor-text rounded hover:bg-amber-50/60"
      >
        {empty ? (dash ? "-" : " ") : baht(num(value))}
      </span>
    );
  }
  return (
    <input
      autoFocus
      defaultValue={empty ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
      onFocus={(e) => requestAnimationFrame(() => e.target.select())}
      inputMode="decimal"
      className="w-full bg-amber-50 outline-none rounded px-0.5 tabular-nums text-right"
    />
  );
}

/** ช่องข้อความหลายบรรทัด ที่ยืดสูงตามเนื้อหาเอง (ไม่งั้นชื่องานยาว ๆ โดนตัด) */
function GrowText({ value, onChange, placeholder, className, style }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`${className ?? ""} block w-full resize-none overflow-hidden`}
      style={style}
    />
  );
}

export function FloorQuoteSheet({
  customer, issueDate, revLabel, contractor, note, items, editable = false,
  onItems, onCustomer, onNote,
}: {
  customer: { name?: string; address?: string; phone?: string };
  issueDate: string;
  revLabel?: string;
  contractor?: { name?: string; phone?: string };
  note?: string;
  items: Item[];
  editable?: boolean;
  onItems?: (items: Item[]) => void;
  onCustomer?: (patch: { name?: string; address?: string }) => void;
  onNote?: (v: string) => void;
}) {
  /**
   * ⚠ ต้องพก __idx (ตำแหน่งจริงใน items) ติดไปกับทุกแถว
   *
   * groupItems รับ "สำเนา" ของแถว (…, {...it}) → ใช้ items.indexOf(it) หาตำแหน่งไม่เจอ ได้ -1 เสมอ
   * ทำให้ปุ่มลบ/แก้ทุกช่องกลายเป็น no-op เงียบ ๆ (บั๊กจริงที่เจอ 6 ส.ค.69 — แก้ไม่เข้าเลยสักช่อง)
   */
  const groups = groupItems(items.map((it, i) => ({ ...it, __idx: i, sort_order: i })));
  const multi = groups.length > 1;
  const total = items.reduce((a, it) => a + num(it.line_total), 0);

  const th = "border border-gray-400 px-1.5 py-1 text-center font-semibold";
  const td = "border border-gray-400 px-1.5 py-1 align-top";
  const txtIn = "w-full bg-transparent outline-none rounded px-0.5 hover:bg-amber-50/50 focus:bg-amber-50";

  // ── แก้ไขรายการ (อ้างจากตำแหน่งจริงใน items ที่พกมากับแถว) ──
  const idxOf = (it: Item) => (typeof it?.__idx === "number" ? it.__idx : -1);
  const patch = (i: number, p: Partial<Item>) => {
    if (!onItems) return;
    onItems(items.map((it, k) => {
      if (k !== i) return it;
      const n = { ...it, ...p };
      if ("material_price" in p || "labor_price" in p) {
        const m = n.material_price === "" || n.material_price == null ? null : num(n.material_price);
        const l = n.labor_price === "" || n.labor_price == null ? null : num(n.labor_price);
        if (m != null || l != null) n.unit_price = Math.round(((m ?? 0) + (l ?? 0)) * 100) / 100;
      }
      n.line_total = Math.round(num(n.qty) * num(n.unit_price) * 100) / 100;
      return n;
    }));
  };
  const del = (i: number) => onItems?.(items.filter((_, k) => k !== i));
  const move = (i: number, d: -1 | 1) => {
    if (!onItems) return;
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const c = items.slice();
    [c[i], c[j]] = [c[j], c[i]];
    onItems(c);
  };
  /** เพิ่มบรรทัดว่างต่อท้ายหมวดนั้น */
  const addRow = (groupLabel: string, afterIdx: number) => {
    if (!onItems) return;
    const blank = {
      group_label: groupLabel, name: "", qty: 1, unit: "งาน",
      material_price: null, labor_price: null, unit_price: 0, line_total: 0,
      remark: "", source: "manual",
    };
    const c = items.slice();
    c.splice(afterIdx + 1, 0, blank);
    onItems(c);
  };
  /**
   * เปลี่ยนชื่อหมวด = เปลี่ยนเฉพาะบรรทัดของหมวดนั้น (อ้างด้วย "ตำแหน่งแถว" ไม่ใช่ชื่อ)
   * เดิมจับคู่ด้วยชื่อ → พอมี 2 หมวดชื่อซ้ำ (เช่นเพิ่มหมวดใหม่แล้วลบชื่อทิ้ง ชนกับหมวดที่ไม่มีชื่อ)
   * พิมพ์แก้หมวดหนึ่ง อีกหมวดเปลี่ยนตามไปด้วย = หมวดยุบรวมกันถาวร
   */
  const renameGroup = (idxs: number[], to: string) =>
    onItems?.(items.map((it, k) => (idxs.includes(k) ? { ...it, group_label: to } : it)));

  const Ctl = ({ i }: { i: number }) => (
    <td className="p-0 border-0 no-print whitespace-nowrap align-top" style={{ width: 1 }}>
      <div className="flex gap-0.5 pl-1 pt-1 opacity-30 hover:opacity-100 transition-opacity">
        <button type="button" onClick={() => move(i, -1)} title="เลื่อนขึ้น" className="press px-1 text-gray-500 leading-none">↑</button>
        <button type="button" onClick={() => move(i, 1)} title="เลื่อนลง" className="press px-1 text-gray-500 leading-none">↓</button>
        <button type="button" onClick={() => del(i)} title="ลบบรรทัด" className="press px-1 text-red-600 leading-none">✕</button>
      </div>
    </td>
  );

  return (
    <div
      className="floor-sheet mx-auto bg-white shadow-lg print:shadow-none"
      style={{ width: "210mm", minHeight: "297mm", padding: "14mm", boxSizing: "border-box" }}
    >
      {/* หัวเอกสาร */}
      <div className="text-center font-bold" style={{ fontSize: 17 }}>
        เอกสารแสดงปริมาณและราคางานสถาปัตย์{revLabel ?? ""}
      </div>
      <div className="mt-3" style={{ fontSize: 12, lineHeight: 1.6 }}>
        <div className="flex gap-1">
          <span className="font-semibold whitespace-nowrap">รายการงาน</span>
          {editable ? (
            <span className="flex-1 flex gap-1">
              <input value={customer.name ?? ""} onChange={(e) => onCustomer?.({ name: e.target.value })}
                placeholder="ชื่อลูกค้า" className={`${txtIn} font-medium`} style={{ maxWidth: "32%" }} />
              <input value={customer.address ?? ""} onChange={(e) => onCustomer?.({ address: e.target.value })}
                placeholder="ที่อยู่" className={txtIn} />
            </span>
          ) : (
            <span>{customer.name} {customer.address}</span>
          )}
        </div>
        <div className="flex justify-between">
          <span>วันที่ {issueDate}</span>
          <span>{contractor?.phone ?? ""}</span>
        </div>
      </div>

      {/* ตาราง */}
      <table className="w-full mt-3 border-collapse" style={{ fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#faedf0", color: "#a8425a" }}>
            <th className={th} style={{ width: "5%" }} rowSpan={2}>ลำดับ</th>
            <th className={th} rowSpan={2}>รายการ</th>
            <th className={th} style={{ width: "7%" }} rowSpan={2}>ปริมาณ</th>
            <th className={th} style={{ width: "7%" }} rowSpan={2}>หน่วย</th>
            <th className={th} colSpan={3}>ราคา/หน่วย/บาท</th>
            <th className={th} style={{ width: "12%" }} rowSpan={2}>ราคารวมสุทธิ<br />(บาท)</th>
            <th className={th} style={{ width: "9%" }} rowSpan={2}>หมายเหตุ</th>
            {editable && <th className="p-0 border-0 no-print" style={{ width: 1 }} rowSpan={2} />}
          </tr>
          <tr style={{ background: "#faedf0", color: "#a8425a" }}>
            <th className={th} style={{ width: "9%" }}>ค่าวัสดุ</th>
            <th className={th} style={{ width: "9%" }}>ค่าแรง</th>
            <th className={th} style={{ width: "10%" }}>ราคางาน</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={editable ? 10 : 9} className={`${td} text-center text-gray-400`} style={{ padding: 18 }}>
                ยังไม่มีรายการ — กด “สร้างรายการตั้งต้น” ด้านบน หรือ “+ เพิ่มบรรทัด” ข้างล่าง
              </td>
            </tr>
          )}
          {groups.map((g: { label: string; items: Item[]; subtotal: number }, gi: number) => {
            const idxs = g.items.map((it: Item) => idxOf(it)).filter((n: number) => n >= 0);
            const lastIdx = idxs.length ? idxs[idxs.length - 1] : items.length - 1;
            return (
              <FloorGroupRows
                key={gi} g={g} gi={gi} multi={multi} editable={editable}
                td={td} txtIn={txtIn} idxOf={idxOf} patch={patch} Ctl={Ctl}
                onRename={(to: string) => renameGroup(idxs, to)}
                onAddRow={() => addRow(g.label, lastIdx)}
              />
            );
          })}
        </tbody>
      </table>

      {editable && (
        <div className="no-print mt-2 flex gap-2 flex-wrap">
          <button type="button" onClick={() => addRow(groups.at(-1)?.label ?? "", items.length - 1)}
            className="press rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium">+ เพิ่มบรรทัด</button>
          <button type="button"
            onClick={() => onItems?.([...items, {
              group_label: `หมวดที่ ${groups.length + 1}`, name: "", qty: 1, unit: "งาน",
              material_price: null, labor_price: null, unit_price: 0, line_total: 0, remark: "", source: "manual",
            }])}
            className="press rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium">+ เพิ่มหมวดใหม่</button>
        </div>
      )}

      {/* หมายเหตุท้ายใบ */}
      <div className="mt-3" style={{ fontSize: 10, lineHeight: 1.7, color: "#374151", breakInside: "avoid" }}>
        {DEFAULT_FOOTER_NOTES.map((n: string, i: number) => (
          <div key={i}>{i === 0 ? "หมายเหตุ: " : ""}{n}</div>
        ))}
        {editable ? (
          <input value={note ?? ""} onChange={(e) => onNote?.(e.target.value)}
            placeholder="(เพิ่มหมายเหตุของใบนี้ — เว้นว่างได้)"
            className={`${txtIn} mt-1`} style={{ fontSize: 10 }} />
        ) : (String(note ?? "").trim() && <div className="mt-1">{note}</div>)}
      </div>

      {/* ยอดรวม */}
      <div className="flex justify-end mt-3" style={{ breakInside: "avoid" }}>
        <table style={{ fontSize: 12 }}>
          <tbody>
            {multi && groups.map((g: { label: string; subtotal: number }, i: number) => (
              <tr key={i}>
                <td className="pr-8 py-0.5 text-right" style={{ color: "#6b7280" }}>
                  ยอดรวม {g.label || "(ไม่มีหมวด)"}
                </td>
                <td className="text-right tabular-nums">{baht(g.subtotal)} บาท</td>
              </tr>
            ))}
            <tr className="font-bold" style={{ color: "#a8425a", fontSize: 14 }}>
              <td className="pr-8 py-1 text-right border-t">ยอดโดยรวมสุทธิ</td>
              <td className="text-right tabular-nums border-t">{baht(total)} บาท</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ลายเซ็น */}
      <div className="mt-14 flex gap-10 justify-between"
        style={{ fontSize: 12, breakInside: "avoid", pageBreakInside: "avoid" }}>
        {[
          { name: contractor?.name ?? "ผู้รับจ้าง", role: "ผู้รับจ้าง" },
          { name: customer.name || "ลูกค้า", role: "ผู้ว่าจ้าง" },
        ].map((h, i) => (
          <div key={i} className="flex-1 text-center">
            <div className="mb-12">{h.name}</div>
            <div style={{ borderTop: "1px solid #9ca3af", paddingTop: 4 }}>{h.role}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>วันที่ ........./........./.........</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 1 หมวด = หัวข้อหมวด (ถ้ามี) + รายการ (เลขเริ่ม 1 ใหม่ทุกหมวด) + ยอดรวมหมวด */
function FloorGroupRows({
  g, gi, multi, editable, td, txtIn, idxOf, patch, Ctl, onRename, onAddRow,
}: {
  g: { label: string; items: Item[]; subtotal: number };
  gi: number;
  multi: boolean;
  editable: boolean;
  td: string;
  txtIn: string;
  idxOf: (it: Item) => number;
  patch: (i: number, p: Partial<Item>) => void;
  Ctl: (p: { i: number }) => JSX.Element;
  onRename: (to: string) => void;
  onAddRow: () => void;
}) {
  const span = editable ? 10 : 9;
  return (
    <>
      {(g.label || editable) && (
        <tr style={{ breakAfter: "avoid", pageBreakAfter: "avoid" }}>
          <td colSpan={span} className="border border-gray-400 px-1.5 py-1 font-bold"
            style={{ background: "#fdf3f5", color: "#a8425a" }}>
            {editable ? (
              <input value={g.label} onChange={(e) => onRename(e.target.value)}
                placeholder={`(ชื่อหมวด — เว้นว่างได้)`}
                className={`${txtIn} font-bold`} style={{ color: "#a8425a" }} />
            ) : g.label}
          </td>
        </tr>
      )}
      {g.items.map((it, i) => {
        const idx = idxOf(it);
        return (
          <tr key={idx}>
            <td className={`${td} text-center tabular-nums`}>{i + 1}</td>
            <td className={td}>
              {editable ? (
                <GrowText value={it.name ?? ""} onChange={(v) => patch(idx, { name: v })}
                  placeholder="ชื่องาน" className={txtIn} style={{ lineHeight: 1.45 }} />
              ) : <span style={{ whiteSpace: "pre-wrap" }}>{it.name}</span>}
            </td>
            <td className={td}>
              {editable
                ? <NumCell value={it.qty} onChange={(v) => patch(idx, { qty: v })} />
                : <span className="tabular-nums block text-right">{baht(num(it.qty))}</span>}
            </td>
            <td className={`${td} text-center`}>
              {editable
                ? <input value={it.unit ?? ""} onChange={(e) => patch(idx, { unit: e.target.value })}
                    className={`${txtIn} text-center`} style={{ textAlign: "center" }} />
                : it.unit}
            </td>
            <td className={td}>
              {editable
                ? <NumCell value={it.material_price} onChange={(v) => patch(idx, { material_price: v })} dash />
                : <span className="tabular-nums block text-right">{it.material_price == null ? "-" : baht(num(it.material_price))}</span>}
            </td>
            <td className={td}>
              {editable
                ? <NumCell value={it.labor_price} onChange={(v) => patch(idx, { labor_price: v })} dash />
                : <span className="tabular-nums block text-right">{it.labor_price == null ? "-" : baht(num(it.labor_price))}</span>}
            </td>
            <td className={td}>
              {editable
                ? <NumCell value={it.unit_price} onChange={(v) => patch(idx, { unit_price: v })} />
                : <span className="tabular-nums block text-right">{baht(num(it.unit_price))}</span>}
            </td>
            <td className={`${td} text-right tabular-nums`} style={{ fontWeight: 500 }}>{baht(num(it.line_total))}</td>
            <td className={`${td} text-center`} style={{ fontSize: 10 }}>
              {editable
                ? <input value={it.remark ?? ""} onChange={(e) => patch(idx, { remark: e.target.value })}
                    list="floor-remarks"
                    className={`${txtIn} text-center hover:bg-amber-50/60`} style={{ textAlign: "center", fontSize: 10 }} />
                : (it.remark || "")}
            </td>
            {editable && <Ctl i={idx} />}
          </tr>
        );
      })}
      {editable && (
        <tr className="no-print">
          <td colSpan={span} className="px-1.5 py-0.5 border-0">
            <button type="button" onClick={onAddRow}
              className="press text-[10px] text-gray-400 hover:text-brand">+ เพิ่มบรรทัดในหมวดนี้</button>
          </td>
        </tr>
      )}
      {multi && (
        <tr>
          <td colSpan={7} className="border border-gray-400 px-1.5 py-1 text-right font-semibold">
            ยอดโดยรวม {g.label || "(ไม่มีหมวด)"}
          </td>
          <td className="border border-gray-400 px-1.5 py-1 text-right tabular-nums font-semibold">{baht(g.subtotal)}</td>
          <td className="border border-gray-400" />
          {editable && <td className="border-0 no-print" />}
        </tr>
      )}
      {gi < 0 && <span />}
    </>
  );
}
