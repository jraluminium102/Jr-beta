"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { baht } from "@/lib/money";
import { api } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { seq: number; label: string; amount: number | string; work_items: string; is_final: boolean };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * ใบเบิกงวดงานพื้น — แบ่งงวดเอง (ลอกโครงจากใบจริงของช่างเพยาว์)
 *   seq 0 = มัดจำ · 1..N = งวด · งวดสุดท้าย = "เก็บเงินส่วนที่เหลือ"
 *
 * ⚠ ใบจริง (คุณพิทยารัตน์ Rev03) ผลรวมงวด 287,612 ≠ ใบเสนอ 305,612 (ต่าง 18,000 = 2 ข้อ "งานเพิ่ม")
 *   → หน้านี้เตือนส่วนต่างตลอด + มีปุ่มเติมลงงวดสุดท้ายให้ตรงในคลิกเดียว (ไม่บังคับ)
 */
export default function InstallmentEditor({
  quotationId, quoteTotal, initial, itemNames,
}: {
  quotationId: number;
  quoteTotal: number;
  initial: Row[];
  itemNames: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [rows, setRows] = useState<Row[]>(
    initial.length > 0
      ? initial
      : [
          { seq: 0, label: "มัดจำ (เพื่อจองเข็มและนัดวันเข้าทำงาน)", amount: 0, work_items: "", is_final: false },
          { seq: 1, label: "งวดที่ 1 เบิกเพื่อซื้อวัสดุและอุปกรณ์เข้าทำงาน (เบิกวันเข้าทำงานวันแรก)", amount: 0, work_items: "", is_final: false },
          { seq: 2, label: "งวดที่ 2", amount: 0, work_items: itemNames.slice(0, 5).join("\n"), is_final: false },
          { seq: 3, label: "งวดที่ 3 (งวดสุดท้าย)", amount: 0, work_items: "", is_final: true },
        ],
  );

  const sum = useMemo(() => r2(rows.reduce((a, r) => a + num(r.amount), 0)), [rows]);
  const diff = r2(quoteTotal - sum);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((p) => {
      const nextSeq = Math.max(-1, ...p.map((r) => r.seq)) + 1;
      const finalIdx = p.findIndex((r) => r.is_final);
      const row: Row = { seq: nextSeq, label: `งวดที่ ${nextSeq}`, amount: 0, work_items: "", is_final: false };
      if (finalIdx < 0) return [...p, row];
      // แทรกก่อนงวดสุดท้ายเสมอ
      return [...p.slice(0, finalIdx), row, ...p.slice(finalIdx)];
    });
  const delRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));

  /** เติมส่วนต่างลงงวดสุดท้าย ให้ผลรวมเท่ายอดใบเสนอพอดี */
  const balanceFinal = () => {
    const fi = rows.findIndex((r) => r.is_final);
    const idx = fi >= 0 ? fi : rows.length - 1;
    if (idx < 0) return;
    const others = rows.reduce((a, r, i) => (i === idx ? a : a + num(r.amount)), 0);
    setRow(idx, { amount: r2(quoteTotal - others) });
  };

  const save = async () => {
    setErr(null);
    setSaved(false);
    if (rows.some((r) => !String(r.label).trim())) return setErr("มีงวดที่ยังไม่ได้ใส่ชื่อ");
    setSaving(true);
    try {
      // api client เติม prefix /api ให้เอง — ห้ามใส่ซ้ำ
      await api.put(`/floor-quotations/${quotationId}/installments`, {
        rows: rows.map((r) => ({ ...r, amount: num(r.amount) })),
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {err && <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">{err}</div>}
      {saved && <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">บันทึกแล้ว</div>}

      {/* สรุปยอด + เตือนไม่ตรง */}
      <div className="card p-4">
        <div className="grid sm:grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-gray-50 border border-gray-200 py-2.5">
            <div className="text-xs text-ink-3">ยอดใบเสนอ</div>
            <div className="font-bold tabular-nums text-lg">{baht(quoteTotal)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 py-2.5">
            <div className="text-xs text-ink-3">รวมทุกงวด</div>
            <div className="font-bold tabular-nums text-lg">{baht(sum)}</div>
          </div>
          <div className={`rounded-lg border py-2.5 ${Math.abs(diff) < 0.01 ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}`}>
            <div className="text-xs text-ink-3">ส่วนต่าง</div>
            <div className={`font-bold tabular-nums text-lg ${Math.abs(diff) < 0.01 ? "text-emerald-700" : "text-amber-800"}`}>
              {Math.abs(diff) < 0.01 ? "ตรงกัน ✓" : baht(diff)}
            </div>
          </div>
        </div>
        {Math.abs(diff) >= 0.01 && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5 text-xs text-amber-900 flex items-center justify-between gap-3 flex-wrap">
            <span>
              ผลรวมงวดไม่ตรงยอดใบเสนอ (ต่าง {baht(diff)}) — ถ้าตั้งใจแยกเก็บงานเพิ่มต่างหากก็ปล่อยไว้ได้
            </span>
            <button type="button" onClick={balanceFinal}
              className="press rounded-lg bg-amber-600 text-white px-3 py-1.5 font-medium whitespace-nowrap">
              เติมส่วนต่างลงงวดสุดท้าย
            </button>
          </div>
        )}
      </div>

      {/* งวด */}
      {rows.map((r, i) => (
        <div key={i} className="card p-4 space-y-2.5">
          <div className="flex gap-2 items-start flex-wrap">
            <input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })}
              className="flex-1 min-w-[240px] rounded-lg border border-gray-300 px-3 py-2 font-medium"
              placeholder="ชื่องวด เช่น งวดที่ 2" />
            <input type="number" step="0.01" value={r.amount}
              onChange={(e) => setRow(i, { amount: e.target.value })}
              className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-right tabular-nums font-semibold"
              placeholder="จำนวนเงิน" />
            <label className="flex items-center gap-1.5 text-xs text-ink-2 px-2 py-2 whitespace-nowrap">
              <input type="checkbox" checked={r.is_final}
                onChange={(e) => setRows((p) => p.map((x, idx) => ({ ...x, is_final: idx === i ? e.target.checked : false })))} />
              งวดสุดท้าย
            </label>
            <button type="button" onClick={() => delRow(i)} className="press px-2 py-2 text-red-600" aria-label="ลบงวด">✕</button>
          </div>
          <label className="block">
            <span className="text-xs text-ink-3">รายการงานในงวดนี้ (บรรทัดละข้อ — จะพิมพ์เป็นลิสต์ 1. 2. 3. บนใบ)</span>
            <textarea value={r.work_items} onChange={(e) => setRow(i, { work_items: e.target.value })}
              rows={r.work_items ? Math.min(9, r.work_items.split("\n").length + 1) : 2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder={"งานตอกเข็มไมโครไพล์\nงานขุดหลุมตัดหัวเข็ม"} />
          </label>
        </div>
      ))}

      <div className="flex gap-2 flex-wrap justify-between">
        <button type="button" onClick={addRow}
          className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium">+ เพิ่มงวด</button>
        <div className="flex gap-2">
          <Link href={`/floor-works/${quotationId}/installments/print`} target="_blank"
            className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium">พิมพ์ใบเบิกงวด</Link>
          <button type="button" onClick={save} disabled={saving}
            className="press rounded-xl bg-brand text-white font-semibold px-6 py-2.5 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึกงวด"}
          </button>
        </div>
      </div>
    </div>
  );
}
