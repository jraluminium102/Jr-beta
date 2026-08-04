"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { baht, computeTotals } from "@/lib/money";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";

// ─────────────────────────────────────────────
// Edit billing total dialog
// ─────────────────────────────────────────────
export function EditBillingTotalButton({
  billingNoteId,
  currentTotal,
}: {
  billingNoteId: number;
  currentTotal: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentTotal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const newTotal = Number(value);
    if (!newTotal || newTotal <= 0) { setError("ยอดต้องมากกว่า 0"); return; }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing-notes/${billingNoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: newTotal }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json.error ?? "แก้ยอดไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark min-h-[44px] focus:outline-none focus-visible:ring-2"
        aria-label="แก้ยอดบิล"
      >
        <Icon name="pencil" size={16} /> แก้ยอดบิล
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="แก้ยอดบิล"
    >
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="pencil" size={18} /> แก้ยอดบิล
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          ยอดปัจจุบัน:{" "}
          <b className="tabular-nums">฿{baht(currentTotal)}</b>
          <br />
          งวดชำระจะถูก re-split อัตโนมัติ — แก้งวดต่อได้ภายหลัง
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">
            ยอดบิลใหม่ (บาท) <span className="text-red-600">*</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="ยอดบิลใหม่"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={busy || !value || Number(value) <= 0}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2"
          >
            {busy && (
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            )}
            บันทึกยอดใหม่
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Edit breakdown (VAT / discount / WHT) — แก้ footer ในใบที่สร้างแล้ว (ยังไม่จ่าย)
// คิดใหม่จาก subtotal ของบิลเอง → net → re-split งวด (API โหมด B)
// ─────────────────────────────────────────────
export function EditBillingBreakdownButton({
  billingNoteId, subtotal, discount_pct, vat_rate, wht_rate,
}: {
  billingNoteId: number;
  subtotal: number;
  discount_pct: number;
  vat_rate: number;
  wht_rate: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [disc, setDisc] = useState(discount_pct);
  const [vat, setVat] = useState(vat_rate);
  const [wht, setWht] = useState(wht_rate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const base = Number(subtotal) || 0;
  const t = useMemo(
    () => computeTotals({ items: [{ qty: 1, unit_price: base }], vat_rate: vat, discount_pct: disc, wht_rate: wht }),
    [base, vat, disc, wht]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing-notes/${billingNoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discount_pct: disc, vat_rate: vat, wht_rate: wht }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "แก้ยอดแยกไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark min-h-[44px] focus:outline-none focus-visible:ring-2"
        aria-label="แก้ VAT / ส่วนลด"
      >
        <Icon name="pencil" size={16} /> แก้ VAT / ส่วนลด
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="แก้ VAT / ส่วนลด">
      <form onSubmit={submit} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="pencil" size={18} /> แก้ VAT / ส่วนลด
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          คิดใหม่จากยอดก่อนภาษี <b className="tabular-nums">฿{baht(base)}</b> · งวดชำระจะ re-split อัตโนมัติตามยอดใหม่
        </div>

        {/* footer เดียวกับตอนสร้าง */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink-3">รวมเป็นเงิน</span><span className="tabular-nums">฿{baht(t.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-3 flex items-center gap-1">ส่วนลด
              <input type="number" min={0} step="any" value={disc || ""} onChange={(e) => setDisc(Math.max(0, Number(e.target.value) || 0))}
                className="w-12 border border-gray-200 rounded px-1 py-1 text-right outline-none tabular-nums" aria-label="ส่วนลด %" />%
            </span>
            <span className="flex items-center gap-1 tabular-nums text-red-700">-฿
              <input type="number" min={0} step="any" value={t.discount_amt || ""}
                onChange={(e) => setDisc(base > 0 ? Math.max(0, Math.round(((Number(e.target.value) || 0) / base) * 10000) / 100) : 0)}
                className="w-20 border border-gray-200 rounded px-1 py-1 text-right outline-none tabular-nums" aria-label="ส่วนลด บาท" />
            </span>
          </div>
          <div className="flex justify-between"><span className="text-ink-3">ราคาหลังหักส่วนลด</span><span className="tabular-nums">฿{baht(t.after_discount)}</span></div>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-ink-3 flex items-center gap-1.5"><input type="checkbox" checked={vat === 7} onChange={(e) => setVat(e.target.checked ? 7 : 0)} /> ภาษีมูลค่าเพิ่ม 7%</span>
            <span className="tabular-nums">฿{baht(t.vat_amt)}</span>
          </label>
          <div className="border-t border-gray-300/70 my-1.5" />
          <div className="flex justify-between font-bold"><span className="text-ink">จำนวนเงินรวมทั้งสิ้น</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.total)}</span></div>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-ink-3 flex items-center gap-1.5"><input type="checkbox" checked={wht > 0} onChange={(e) => setWht(e.target.checked ? 3 : 0)} /> หักภาษี ณ ที่จ่าย
              <select value={wht || 3} disabled={wht === 0} onChange={(e) => setWht(Number(e.target.value))} className="border border-gray-200 rounded px-1 py-1 outline-none text-xs disabled:opacity-50">
                <option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option>
              </select>
            </span>
            <span className="tabular-nums text-red-700">-฿{baht(t.wht_amt)}</span>
          </label>
          <div className="flex justify-between font-bold text-base border-t border-gray-300/70 pt-1.5"><span className="text-ink">ยอดชำระ</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.net)}</span></div>
        </div>


        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Edit issue_date (วันที่ออกบิล) — BL ไม่ใช่เอกสารภาษี แก้ได้ยืดหยุ่นกว่าใบเสร็จ
// เปลี่ยนเดือน → เลขที่จะเปลี่ยนตาม (renumber, server แจ้งเลขใหม่กลับมา) — เตือนก่อนบันทึก
// ─────────────────────────────────────────────
export function EditBillingDateButton({
  billingNoteId, currentDate, currentCode,
}: { billingNoteId: number; currentDate: string; currentCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // เตือนล่วงหน้าถ้าเดือน/ปีต่างจากเดิม (เทียบ ค.ศ. เดือน — เลขจริงเทียบที่ server อีกชั้น)
  const oldYm = currentDate.slice(0, 7);
  const newYm = date.slice(0, 7);
  const crossMonth = !!date && newYm !== oldYm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) { setError("กรุณาเลือกวันที่"); return; }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing-notes/${billingNoteId}/date`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_date: date }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "แก้วันที่ไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => { setDate(currentDate); setError(""); setOpen(true); }}
        aria-label="แก้วันที่ออก"
        className="press inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-3 hover:bg-gray-100 hover:text-brand-dark align-middle focus:outline-none focus-visible:ring-2"
      >
        <Icon name="pencil" size={13} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="แก้วันที่ออกบิล">
      <form onSubmit={submit} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={18} /> แก้วันที่ออกบิล
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">วันที่ออกบิล <span className="text-red-600">*</span></span>
          <DateField value={date} onChange={setDate}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        </label>

        {crossMonth && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            ⚠ วันที่ใหม่อยู่คนละเดือนกับเลขเอกสารปัจจุบัน (<b className="font-mono">{currentCode}</b>) —
            ระบบจะ<b>ออกเลขใหม่ให้ตามเดือนนี้</b> เลขเดิมจะไม่ถูกใช้อีก
          </p>
        )}

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || !date}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Void billing note dialog
// ─────────────────────────────────────────────
export function VoidBillingNoteButton({ billingNoteId }: { billingNoteId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setError("ต้องระบุเหตุผล"); return; }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing-notes/${billingNoteId}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json.error ?? "ยกเลิกใบวางบิลไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold bg-red-50 text-red-700 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        aria-label="ยกเลิกใบวางบิล"
      >
        <Icon name="trash" size={16} /> ยกเลิกใบวางบิล
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="ยกเลิกใบวางบิล"
    >
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
            <Icon name="trash" size={18} /> ยกเลิกใบวางบิล
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          ใบวางบิลจะถูกยกเลิก — งวดทั้งหมดกลับเป็น "รอชำระ" และรายการรับเงินที่ผูกอยู่จะถูก void ด้วย
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">
            เหตุผล <span className="text-red-600">*</span>
          </span>
          <textarea
            required rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น แก้ไขมูลค่างาน / ลูกค้าขอออกใหม่"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-400 resize-none"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || !reason.trim()}
            className="press flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            ยืนยันยกเลิก
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Issue receipt for one installment (inline) — ออกใบเสร็จตามงวด ไม่ต้องย้ายหน้า
// POST /api/receipts (รับชำระ + ปิดงวด + ออกใบเสร็จในคราวเดียว · VAT ล็อกตามงานฝั่ง server)
// ─────────────────────────────────────────────
const RECEIPT_PAY_METHODS = [
  { value: "transfer", label: "โอนเงิน" },
  { value: "cash", label: "เงินสด" },
  { value: "cheque", label: "เช็ค" },
  { value: "other", label: "อื่นๆ" },
];

export function IssueReceiptButton({
  billingNoteId, installmentId, amount,
}: { billingNoteId: number; installmentId: number; amount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amt, setAmt] = useState(String(amount));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("transfer");
  const [itemDesc, setItemDesc] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = Number(amt) || 0;
    if (a <= 0) { setError("ยอดต้องมากกว่า 0"); return; }
    setBusy(true);
    setError("");
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billing_note_id: billingNoteId,
        installment_id: installmentId,
        amount: a,
        payment_method: method,
        issue_date: date,
        item_desc: itemDesc,
        note,
      }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      // ออกใบเสร็จเสร็จ → เด้งไปหน้าใบเสร็จที่เพิ่งออกเลย
      const rid = json?.data?.id;
      if (rid) router.push(`/receipts/${rid}`);
      else router.refresh();
    }
    else setError(json?.error ?? "ออกใบเสร็จไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus-visible:ring-2"
        aria-label="ออกใบเสร็จงวดนี้"
      >
        <Icon name="receipt" size={14} /> ออกใบเสร็จ
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="ออกใบเสร็จงวดนี้">
      <form onSubmit={submit} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="receipt" size={18} /> ออกใบเสร็จงวดนี้
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          ออกใบเสร็จ = รับชำระ + ปิดงวดนี้ + ออกใบกำกับภาษีในคราวเดียว · VAT คิดตามงานอัตโนมัติ
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">ยอดรับชำระ (รวม VAT แล้ว) <span className="text-red-600">*</span></span>
          <input type="number" inputMode="decimal" step="0.01" min="0.01" required value={amt}
            onChange={(e) => setAmt(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">วันที่</span>
            <DateField value={date} onChange={(iso) => setDate(iso)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">วิธีชำระ</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2">
              {RECEIPT_PAY_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">รายการ (แก้ข้อความได้ · เว้นว่าง = ใช้ชื่องวดเดิม)</span>
          <input value={itemDesc} onChange={(e) => setItemDesc(e.target.value)}
            placeholder="เช่น ค่างวดที่ 2 · ค่าแรงติดตั้ง (รวม VAT)"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">หมายเหตุ (พิมพ์บนใบเสร็จ)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="ข้อความเพิ่มเติม (ถ้ามี)"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-brand" />
        </label>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || Number(amt) <= 0}
            className="press flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            ออกใบเสร็จ
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Edit displayed status (override) — แก้ป้ายสถานะบนเอกสาร (ไม่กระทบยอดเงิน)
// ─────────────────────────────────────────────
const STATUS_OVERRIDE_OPTIONS = [
  { value: "", label: "อัตโนมัติ (ตามการชำระ)" },
  { value: "unpaid", label: "ยังไม่ชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระครบ" },
];

export function EditBillingStatusButton({
  billingNoteId, current,
}: { billingNoteId: number; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing-notes/${billingNoteId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_status: val === "" ? null : val }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "บันทึกไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark min-h-[44px] focus:outline-none focus-visible:ring-2"
        aria-label="แก้สถานะที่แสดง">
        <Icon name="pencil" size={16} /> แก้สถานะ
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="แก้สถานะที่แสดง">
      <form onSubmit={submit} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="pencil" size={18} /> แก้สถานะที่แสดงบนเอกสาร
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          เป็นแค่ <b>ป้ายสถานะที่โชว์บนเอกสาร</b> — ไม่กระทบยอดเงิน/งวด/การคำนวณ · เลือก &quot;อัตโนมัติ&quot; เพื่อกลับไปใช้สถานะจริงจากการชำระ
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">สถานะที่จะแสดง</span>
          <select value={val} onChange={(e) => setVal(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {STATUS_OVERRIDE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Installment editor
// ─────────────────────────────────────────────
export type InstallmentRow = {
  id?: number;
  seq: number;
  label: string;
  amount: number;
  due_date: string | null;
  status: string;
  paid_amount: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function InstallmentEditor({
  billingNoteId,
  total,
  initialInstallments,
}: {
  billingNoteId: number;
  total: number;
  initialInstallments: InstallmentRow[];
  hasAnyPayment?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // แยกงวด: จ่ายเต็ม(ล็อก ไม่แตะ) / จ่ายบางส่วน(block) / ยังไม่จ่าย(แก้ได้)
  const isFullyPaid = (i: InstallmentRow) =>
    i.status === "paid" || (Number(i.paid_amount) || 0) >= i.amount;
  const isPartial = (i: InstallmentRow) => {
    const p = Number(i.paid_amount) || 0;
    return p > 0 && p < i.amount;
  };
  const paidRows = initialInstallments.filter(isFullyPaid).slice().sort((a, b) => a.seq - b.seq);
  const hasPartial = initialInstallments.some(isPartial);
  const hasPaid = paidRows.length > 0;
  const paidSum = round2(paidRows.reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const maxPaidSeq = paidRows.reduce((m, i) => Math.max(m, i.seq), 0);
  // ยอดที่งวดที่ยังไม่จ่ายต้องรวมให้ได้ = ยอดบิล − งวดที่จ่ายแล้ว
  const targetSum = round2(total - paidSum);

  // rid stable key — แก้ได้เฉพาะงวดที่ยังไม่จ่าย
  const ridRef = useRef(0);
  type EditRow = { rid: number; label: string; amount: number; due_date: string | null };
  const [rows, setRows] = useState<EditRow[]>(() =>
    initialInstallments
      .filter((i) => !isFullyPaid(i) && !isPartial(i))
      .sort((a, b) => a.seq - b.seq)
      .map((i) => ({ rid: ridRef.current++, label: i.label, amount: i.amount, due_date: i.due_date }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sum = round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const diff = round2(Math.abs(sum - targetSum));
  const sumOk = diff <= 0.01;

  function addRow() {
    // เติมยอดที่เหลือ (targetSum − ผลรวมปัจจุบัน) ให้งวดใหม่ → ผลรวมไม่เพี้ยน บันทึกได้ทันที
    const remaining = round2(targetSum - sum);
    setRows([
      ...rows,
      { rid: ridRef.current++, label: `งวด ${maxPaidSeq + rows.length + 1}`, amount: remaining > 0 ? remaining : 0, due_date: null },
    ]);
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  // เกลี่ยยอดเท่ากันทุกงวด (เฉพาะที่ยังไม่จ่าย) — งวดสุดท้ายดูดเศษ
  function splitEven() {
    const n = rows.length;
    if (n === 0) return;
    const per = round2(targetSum / n);
    setRows(rows.map((r, i) => ({
      ...r,
      amount: i === n - 1 ? round2(targetSum - per * (n - 1)) : per,
    })));
    setError("");
  }

  // ใส่ส่วนต่างที่เหลือลงงวดสุดท้าย — กัน ≤ 0 (API บังคับ amount > 0)
  function fillLast() {
    const n = rows.length;
    if (n === 0) return;
    const others = round2(rows.slice(0, n - 1).reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const last = round2(targetSum - others);
    if (last <= 0) {
      setError(`งวดอื่นรวม ${baht(others)} เกิน/เท่ายอดที่เหลือแล้ว — ลดยอดงวดอื่นก่อน`);
      return;
    }
    setRows(rows.map((r, i) => (i === n - 1 ? { ...r, amount: last } : r)));
    setError("");
  }

  function updateRow(idx: number, field: string, value: string | number | null) {
    setRows(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sumOk) {
      setError(hasPaid
        ? `ผลรวมงวดที่เหลือ ${baht(sum)} ต้องเท่ากับ ${baht(targetSum)} (ยอดบิล − ที่จ่ายแล้ว)`
        : `ผลรวม ${baht(sum)} ต้องตรงกับยอดบิล ${baht(total)}`);
      return;
    }
    setBusy(true);
    setError("");
    // มีงวดจ่ายแล้ว → endpoint แก้เฉพาะงวดยังไม่จ่าย (เก็บงวด paid ไว้); ไม่มี → replace ทั้งชุด
    const endpoint = hasPaid
      ? `/api/billing-notes/${billingNoteId}/installments/unpaid`
      : `/api/billing-notes/${billingNoteId}/installments`;
    const payload = hasPaid
      ? { installments: rows.map((r) => ({ label: r.label, amount: Number(r.amount) || 0, due_date: r.due_date ?? null })) }
      : { installments: rows.map((r, idx) => ({ seq: idx + 1, label: r.label, amount: Number(r.amount) || 0, due_date: r.due_date ?? null })) };
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json.error ?? "บันทึกไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark min-h-[44px] focus:outline-none focus-visible:ring-2"
        aria-label="แก้ไขงวดชำระ"
      >
        <Icon name="clipboard" size={16} /> แก้ไขงวด
      </button>
    );
  }

  // งวดจ่ายบางส่วน → block (re-split งวดค้างจ่ายต้องคนตัดสิน) — ชี้ไป void
  if (hasPartial) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="แก้ไขงวดชำระ">
        <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
              <Icon name="clipboard" size={18} /> แก้ไขงวดชำระ
            </h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
              className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            มีงวดที่จ่ายบางส่วน (ยังไม่เต็มงวด) — <b>ปรับงวดไม่ได้</b> ต้องเก็บงวดนั้นให้ครบ หรือ &quot;ยกเลิกใบวางบิล&quot; แล้วออกใหม่
          </div>
          <button type="button" onClick={() => setOpen(false)}
            className="press w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            เข้าใจแล้ว
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/60 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="แก้ไขงวดชำระ"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="clipboard" size={18} /> แก้ไขงวดชำระ
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* ตัวเตือนผลรวม — ปรับข้อความตามว่ามีงวดจ่ายแล้วไหม */}
        <div className={`text-sm px-3 py-2 rounded-xl border ${sumOk ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {hasPaid ? (
            <>
              จ่ายแล้ว <b className="tabular-nums">{baht(paidSum)}</b>
              {" · "}งวดที่เหลือต้องรวม <b className="tabular-nums">{baht(targetSum)}</b>
              {" "}(ตอนนี้ <b className="tabular-nums">{baht(sum)}</b>)
            </>
          ) : (
            <>
              ผลรวมงวด: <b className="tabular-nums">{baht(sum)}</b>
              {" "}/ ยอดบิล: <b className="tabular-nums">{baht(total)}</b>
            </>
          )}
          {!sumOk && <span className="ml-2">ต่างกัน {baht(diff)}</span>}
        </div>

        {/* งวดที่จ่ายแล้ว (ล็อก แก้ไม่ได้) */}
        {paidRows.map((p) => (
          <div key={`paid-${p.id}`} className="grid grid-cols-12 gap-2 items-center bg-emerald-50/60 border border-emerald-100 rounded-lg px-1 py-1.5">
            <div className="col-span-1 text-xs text-gray-400 text-center">{p.seq}</div>
            <div className="col-span-4 text-sm text-ink-2 truncate px-1">{p.label}</div>
            <div className="col-span-3 text-sm text-right tabular-nums font-medium px-1">฿{baht(p.amount)}</div>
            <div className="col-span-4 text-xs text-emerald-700 font-medium text-center inline-flex items-center justify-center gap-1">
              <Icon name="check" size={13} /> ชำระแล้ว
            </div>
          </div>
        ))}

        {/* งวดที่ยังไม่จ่าย (แก้ได้) — ปุ่มลบติดช่องยอด เห็นชัดเสมอ, วันที่อยู่บรรทัดล่าง */}
        <div className="space-y-2.5">
          {rows.map((row, idx) => (
            <div key={row.rid} className="rounded-xl border border-gray-200 bg-gray-50/50 p-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs text-gray-400">{maxPaidSeq + idx + 1}</span>
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateRow(idx, "label", e.target.value)}
                  placeholder="รายละเอียดงวด"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateRow(idx, "amount", e.target.value === "" ? 0 : Number(e.target.value))}
                  placeholder="ยอด"
                  className="w-24 sm:w-28 shrink-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2"
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  aria-label={`ลบงวดที่ ${maxPaidSeq + idx + 1}`}
                  title="ลบงวดนี้"
                  className="shrink-0 press w-9 h-9 inline-flex items-center justify-center rounded-lg text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5 pl-7">
                <span className="text-[11px] text-gray-400 shrink-0">กำหนดชำระ</span>
                <DateField
                  value={row.due_date ?? ""}
                  onChange={(iso) => updateRow(idx, "due_date", iso || null)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus-visible:ring-2"
                />
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-xs text-ink-3 text-center py-2">— ไม่มีงวดที่ยังไม่จ่าย (จ่ายครบยอดแล้ว) —</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRow}
            className="press inline-flex items-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2"
          >
            <Icon name="plus" size={16} /> เพิ่มงวด
          </button>
          <button
            type="button"
            onClick={splitEven}
            disabled={rows.length === 0}
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-brand-dark glass-soft hover:bg-brand/5 min-h-[44px] disabled:opacity-40 focus:outline-none focus-visible:ring-2"
            title="แบ่งยอดที่เหลือเท่ากันทุกงวด (งวดสุดท้ายดูดเศษ)"
          >
            <Icon name="clipboard" size={15} /> เกลี่ยเท่ากัน
          </button>
          <button
            type="button"
            onClick={fillLast}
            disabled={rows.length === 0}
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-brand-dark glass-soft hover:bg-brand/5 min-h-[44px] disabled:opacity-40 focus:outline-none focus-visible:ring-2"
            title="เติมส่วนต่างที่เหลือลงงวดสุดท้ายให้ครบยอด"
          >
            <Icon name="plus" size={15} /> ใส่ส่วนต่างงวดสุดท้าย
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || !sumOk}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึกงวด
          </button>
        </div>
      </form>
    </div>
  );
}
