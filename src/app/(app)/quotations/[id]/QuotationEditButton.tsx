"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";
import type { QuotationItem } from "@/lib/types";

// category/product_id/group_label/calc_recipe = passthrough (มองไม่เห็นใน dialog) — กันสูตร/หัวข้อชุดหายตอนแก้ข้อความ (0093/0076)
type EditRow = { name: string; detail: string; qty: number; unit_price: number; sort_order: number; category?: string; product_id?: string; group_label?: string; calc_recipe?: unknown };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function QuotationEditButton({
  quotationId,
  vatRate,
  discountPct,
  discountAmt: discountAmtProp = 0,
  discountLabel = "",
  whtRate,
  note,
  items,
  revisionNo = 0,
  revisionLabel = "",
}: {
  quotationId: number;
  vatRate: number;
  discountPct: number;
  discountAmt?: number;
  discountLabel?: string;
  whtRate: number;
  note: string;
  items: QuotationItem[];
  revisionNo?: number;
  revisionLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EditRow[]>(
    items.map((it) => ({
      name: it.name, detail: it.detail, qty: it.qty, unit_price: it.unit_price, sort_order: it.sort_order,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category: (it as any).category ?? "", product_id: (it as any).product_id ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group_label: (it as any).group_label ?? "", calc_recipe: (it as any).calc_recipe ?? null,
    }))
  );
  // ระบบ Rev (0093): เลือกได้ว่าการแก้ครั้งนี้ นับเป็น Rev ไหม + เก็บฉบับเดิมไหม · ป้ายพิมพ์เองได้
  const [revAction, setRevAction] = useState<"none" | "rev" | "rev_keep">("none");
  const [revLabel, setRevLabel] = useState(`Rev${String((revisionNo || 0) + 1).padStart(2, "0")}`);
  const [vat, setVat] = useState(vatRate);
  // ส่วนลดเก็บเป็น "จำนวนเงิน" (ตัวตั้งจริง) · % เป็น derived · + หัวข้อ
  const [discAmt, setDiscAmt] = useState(discountAmtProp || 0);
  const [discLabel, setDiscLabel] = useState(discountLabel);
  const [wht, setWht] = useState(whtRate);
  const [noteVal, setNoteVal] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // preview ยอดแบบ real-time — ส่วนลดใช้ discAmt ตรง ๆ (clamp 0..subtotal)
  const subtotal = round2(rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0));
  const discountAmt = round2(Math.min(Math.max(0, discAmt), subtotal));
  const discPct = subtotal > 0 ? Math.round((discountAmt / subtotal) * 10000) / 100 : 0;
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
        vat_rate: vat, discount_amt: discountAmt, discount_pct: discPct, discount_label: discLabel.trim(),
        wht_rate: wht, note: noteVal,
        // Rev (0093): none = แค่บันทึกทับ · rev/rev_keep = ขึ้น Rev ใหม่ (rev_keep เก็บฉบับเดิมเป็นประวัติ)
        ...(revAction !== "none" ? { revision_action: revAction, revision_label: revLabel.trim() } : {}),
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
        className="w-full max-w-3xl bg-white rounded-2xl p-6 shadow-2xl space-y-5 mb-8"
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
            <div key={idx} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 text-center shrink-0">{idx + 1}</span>
                <input type="text" value={row.name} onChange={(e) => updateRow(idx, "name", e.target.value)}
                  placeholder="ชื่อรายการ *" required
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2" />
                <button type="button" onClick={() => removeRow(idx)} aria-label={`ลบรายการ ${idx + 1}`}
                  className="press w-9 h-9 inline-flex items-center justify-center rounded-lg text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 shrink-0 focus:outline-none focus-visible:ring-2">
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <textarea value={row.detail} onChange={(e) => updateRow(idx, "detail", e.target.value)}
                rows={Math.max(6, (row.detail.match(/\n/g)?.length ?? 0) + 1)}
                placeholder={"รายละเอียด (กด Enter เว้นบรรทัดได้ · แต่ละบรรทัด = บุลเล็ต)\n- ด้าน A: บานเลื่อนเปิดคู่กลาง + มุ้ง\n- ด้าน B: กระจกติดตาย\nรายละเอียดงาน\n- สีอลูมิเนียม: อบขาว\n- กระจก: เขียว 6มม."}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 resize-y leading-relaxed"
                style={{ minHeight: "9rem" }} />
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-gray-500 flex items-center gap-1.5">จำนวน
                  <input type="number" inputMode="decimal" value={row.qty} min={0.01} step="any"
                    onChange={(e) => updateRow(idx, "qty", Number(e.target.value))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2" /></label>
                <label className="text-xs text-gray-500 flex items-center gap-1.5">ราคา/หน่วย
                  <input type="number" inputMode="decimal" value={row.unit_price} min={0} step="any"
                    onChange={(e) => updateRow(idx, "unit_price", Number(e.target.value))}
                    className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2" /></label>
                <span className="ml-auto text-sm font-semibold text-brand-dark tabular-nums">รวม ฿{baht((Number(row.qty) || 0) * (Number(row.unit_price) || 0))}</span>
              </div>
            </div>
          ))}
          <button type="button" onClick={addRow}
            className="press inline-flex items-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            <Icon name="plus" size={16} /> เพิ่มรายการ
          </button>
        </div>

        {/* ส่วนลด — ใส่เป็น % หรือ จำนวนเงิน (ผูกกัน) + หัวข้อ */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-2">
          <div className="text-xs font-medium text-gray-500">ส่วนลด (ใส่ % หรือ จำนวนเงิน อย่างใดอย่างหนึ่ง)</div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <input type="number" min={0} step="any" value={discPct ? Number(discPct.toFixed(2)) : ""} placeholder="0"
                onChange={(e) => setDiscAmt(subtotal > 0 ? round2((subtotal * (Number(e.target.value) || 0)) / 100) : 0)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm text-right tabular-nums outline-none focus-visible:ring-2" />
              <span className="text-gray-500 text-sm">%</span>
            </div>
            <span className="text-gray-400">=</span>
            <div className="flex items-center gap-1">
              <input type="number" min={0} step="any" value={discAmt || ""} placeholder="0"
                onChange={(e) => setDiscAmt(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 border border-gray-200 rounded-lg px-2 py-2 text-sm text-right tabular-nums outline-none focus-visible:ring-2" />
              <span className="text-gray-500 text-sm">บาท</span>
            </div>
          </div>
          <input type="text" value={discLabel} onChange={(e) => setDiscLabel(e.target.value)}
            placeholder="หัวข้อส่วนลด (เช่น ส่วนลดโปรโมชัน / ลูกค้าเก่า) — โชว์บนใบ"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2" />
        </div>

        {/* อัตราภาษี */}
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">VAT (%)</span>
            <select value={vat} onChange={(e) => setVat(Number(e.target.value))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2">
              <option value={7}>7%</option>
              <option value={0}>0%</option>
            </select>
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
          {discountAmt > 0 && <div className="flex justify-between"><span className="text-gray-500">ส่วนลด{discLabel.trim() ? ` (${discLabel.trim()})` : ` ${Number(discPct.toFixed(2))}%`}</span><span className="tabular-nums text-brand">-{baht(discountAmt)}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">VAT {vat}%</span><span className="tabular-nums">{baht(vatAmt)}</span></div>
          <div className="flex justify-between font-bold text-brand-dark border-t pt-1"><span>ยอดรวมสุทธิ</span><span className="tabular-nums">฿{baht(total)}</span></div>
          {whtAmt > 0 && <>
            <div className="flex justify-between"><span className="text-gray-500">หัก ณ ที่จ่าย {wht}%</span><span className="tabular-nums text-brand">-{baht(whtAmt)}</span></div>
            <div className="flex justify-between font-bold text-brand-dark"><span>ยอดรับสุทธิ</span><span className="tabular-nums">฿{baht(net)}</span></div>
          </>}
        </div>

        {/* Rev (0093) — เลือกว่าการแก้ครั้งนี้นับเป็น Rev ไหม · ป้ายพิมพ์เองได้ · พิมพ์ต่อท้ายเลขที่บนใบ */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-2 text-sm">
          <div className="text-xs font-semibold text-gray-600">
            การแก้ครั้งนี้{revisionLabel ? ` (ปัจจุบัน: ${revisionLabel})` : ""}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="revact" checked={revAction === "none"} onChange={() => setRevAction("none")} />
              <span>บันทึกทับเฉยๆ (ไม่นับ Rev)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="revact" checked={revAction === "rev"} onChange={() => setRevAction("rev")} />
              <span>ขึ้น Rev ใหม่ <span className="text-xs text-gray-400">(ป้ายขึ้นบนใบ · ไม่เก็บฉบับเดิม)</span></span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="revact" checked={revAction === "rev_keep"} onChange={() => setRevAction("rev_keep")} />
              <span>ขึ้น Rev ใหม่ + เก็บฉบับเดิมเป็นประวัติ</span>
            </label>
          </div>
          {revAction !== "none" && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">ป้าย Rev (แก้ได้)</span>
              <input type="text" value={revLabel} onChange={(e) => setRevLabel(e.target.value)} maxLength={40}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2" />
            </label>
          )}
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
