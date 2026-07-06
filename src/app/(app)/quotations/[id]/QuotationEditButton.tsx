"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";
import type { QuotationItem } from "@/lib/types";

type EditRow = { name: string; detail: string; qty: number; unit_price: number; sort_order: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function QuotationEditButton({
  quotationId,
  vatRate,
  discountPct,
  whtRate,
  note,
  items,
}: {
  quotationId: number;
  vatRate: number;
  discountPct: number;
  whtRate: number;
  note: string;
  items: QuotationItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EditRow[]>(
    items.map((it) => ({
      name: it.name, detail: it.detail, qty: it.qty, unit_price: it.unit_price, sort_order: it.sort_order,
    }))
  );
  const [vat, setVat] = useState(vatRate);
  const [discount, setDiscount] = useState(discountPct);
  const [wht, setWht] = useState(whtRate);
  const [noteVal, setNoteVal] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // preview ยอดแบบ real-time
  const subtotal = round2(rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0));
  const discountAmt = round2((subtotal * discount) / 100);
  const afterDiscount = round2(subtotal - discountAmt);
  const vatAmt = Math.round((afterDiscount * vat) / 100 + Number.EPSILON);
  const total = round2(afterDiscount + vatAmt);
  const whtAmt = Math.round((afterDiscount * wht) / 100 + Number.EPSILON);
  const net = round2(total - whtAmt);

  function addRow() {
    setRows([...rows, { name: "", detail: "", qty: 1, unit_price: 0, sort_order: rows.length }]);
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: keyof EditRow, value: string | number) {
    setRows(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rows.some((r) => !r.name.trim())) { setError("ทุกรายการต้องมีชื่อ"); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/quotations/${quotationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: rows.map((r, i) => ({ ...r, sort_order: i })),
        vat_rate: vat, discount_pct: discount, wht_rate: wht, note: noteVal,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json.error ?? "แก้ไขไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark min-h-[44px] focus:outline-none focus-visible:ring-2"
        aria-label="แก้ไขใบเสนอราคา"
      >
        <Icon name="clipboard" size={16} /> แก้ไข
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/60 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="แก้ไขใบเสนอราคา"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-2xl space-y-5 mb-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="clipboard" size={18} /> แก้ไขใบเสนอราคา
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* รายการสินค้า */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500">รายการ</div>
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-start">
              <input type="text" value={row.name} onChange={(e) => updateRow(idx, "name", e.target.value)}
                placeholder="ชื่อรายการ *" required
                className="col-span-4 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus-visible:ring-2" />
              <textarea value={row.detail} onChange={(e) => updateRow(idx, "detail", e.target.value)}
                rows={Math.max(2, (row.detail.match(/\n/g)?.length ?? 0) + 1)}
                placeholder={"รายละเอียด (บรรทัด=บุลเล็ต)\n- ชุดล็อค\nรายละเอียดงาน\n- สีอลูมิเนียม: อบขาว\n- กระจก: เขียว 6มม."}
                className="col-span-3 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus-visible:ring-2 resize-y leading-relaxed" />
              <input type="number" inputMode="decimal" value={row.qty} min={0.01} step="any"
                onChange={(e) => updateRow(idx, "qty", Number(e.target.value))}
                placeholder="จำนวน"
                className="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2" />
              <input type="number" inputMode="decimal" value={row.unit_price} min={0} step="any"
                onChange={(e) => updateRow(idx, "unit_price", Number(e.target.value))}
                placeholder="ราคา/หน่วย"
                className="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2" />
              <button type="button" onClick={() => removeRow(idx)} aria-label={`ลบรายการ ${idx + 1}`}
                className="press col-span-1 w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2">
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow}
            className="press inline-flex items-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            <Icon name="plus" size={16} /> เพิ่มรายการ
          </button>
        </div>

        {/* อัตราภาษี */}
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">VAT (%)</span>
            <select value={vat} onChange={(e) => setVat(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2">
              <option value={7}>7%</option>
              <option value={0}>0%</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">ส่วนลด (%)</span>
            <input type="number" min={0} max={100} step="any" value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums outline-none focus-visible:ring-2" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">หัก ณ ที่จ่าย (%)</span>
            <select value={wht} onChange={(e) => setWht(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2">
              <option value={0}>0%</option>
              <option value={3}>3%</option>
              <option value={5}>5%</option>
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">หมายเหตุ</span>
          <input type="text" value={noteVal} onChange={(e) => setNoteVal(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2" />
        </label>

        {/* สรุปยอด realtime */}
        <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">ยอดรวมก่อนภาษี</span><span className="tabular-nums">{baht(subtotal)}</span></div>
          {discountAmt > 0 && <div className="flex justify-between"><span className="text-gray-500">ส่วนลด {discount}%</span><span className="tabular-nums text-brand">-{baht(discountAmt)}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">VAT {vat}%</span><span className="tabular-nums">{baht(vatAmt)}</span></div>
          <div className="flex justify-between font-bold text-brand-dark border-t pt-1"><span>ยอดรวมสุทธิ</span><span className="tabular-nums">฿{baht(total)}</span></div>
          {whtAmt > 0 && <>
            <div className="flex justify-between"><span className="text-gray-500">หัก ณ ที่จ่าย {wht}%</span><span className="tabular-nums text-brand">-{baht(whtAmt)}</span></div>
            <div className="flex justify-between font-bold text-brand-dark"><span>ยอดรับสุทธิ</span><span className="tabular-nums">฿{baht(net)}</span></div>
          </>}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || rows.length === 0}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
