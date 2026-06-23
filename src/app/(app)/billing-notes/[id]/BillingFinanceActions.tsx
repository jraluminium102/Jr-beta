"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
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
  hasAnyPayment,
}: {
  billingNoteId: number;
  total: number;
  initialInstallments: InstallmentRow[];
  hasAnyPayment: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Omit<InstallmentRow, "id" | "status" | "paid_amount">[]>(
    initialInstallments.map((i) => ({
      seq: i.seq,
      label: i.label,
      amount: i.amount,
      due_date: i.due_date,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sum = round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const diff = round2(Math.abs(sum - total));
  const sumOk = diff <= 0.01;

  function addRow() {
    const nextSeq = rows.length > 0 ? Math.max(...rows.map((r) => r.seq)) + 1 : 1;
    setRows([...rows, { seq: nextSeq, label: `งวด ${nextSeq}`, amount: 0, due_date: null }]);
  }

  function removeRow(idx: number) {
    // re-number seq ให้ต่อเนื่อง 1..n หลังลบ (กัน label "งวด N" เพี้ยน + seq ต่อเนื่อง)
    setRows(rows.filter((_, i) => i !== idx).map((r, i) => ({ ...r, seq: i + 1 })));
  }

  // เกลี่ยยอดเท่ากันทุกงวด — งวดสุดท้ายดูดเศษ (pattern เดียวกับ suggestInstallments)
  function splitEven() {
    const n = rows.length;
    if (n === 0) return;
    const per = round2(total / n);
    setRows(rows.map((r, i) => ({
      ...r,
      amount: i === n - 1 ? round2(total - per * (n - 1)) : per,
    })));
    setError("");
  }

  // ใส่ส่วนต่างที่เหลือลงงวดสุดท้าย — กัน ≤ 0 (API บังคับ amount > 0)
  function fillLast() {
    const n = rows.length;
    if (n === 0) return;
    const others = round2(rows.slice(0, n - 1).reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const last = round2(total - others);
    if (last <= 0) {
      setError(`งวดอื่นรวม ${baht(others)} เกิน/เท่ายอดบิลแล้ว — ลดยอดงวดอื่นก่อน`);
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
    if (!sumOk) { setError(`ผลรวม ${baht(sum)} ต้องตรงกับยอดบิล ${baht(total)}`); return; }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing-notes/${billingNoteId}/installments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installments: rows.map((r) => ({ ...r, amount: Number(r.amount) || 0 })) }),
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

  // บิลที่มีงวดชำระแล้ว → แก้งวดไม่ได้ (immutability เอกสารการเงิน) — โชว์ข้อความ + ชี้ไป void
  if (hasAnyPayment) {
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
            ใบวางบิลนี้มีงวดที่ชำระแล้ว — <b>ปรับงวดไม่ได้</b> หากต้องแก้ ให้กด &quot;ยกเลิกใบวางบิล&quot; แล้วออกใหม่จากใบเสนอราคา
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

        {/* ตัวเตือนผลรวม */}
        <div className={`text-sm px-3 py-2 rounded-xl border ${sumOk ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          ผลรวมงวด: <b className="tabular-nums">{baht(sum)}</b>
          {" "}/ ยอดบิล: <b className="tabular-nums">{baht(total)}</b>
          {!sumOk && <span className="ml-2">ต่างกัน {baht(diff)}</span>}
        </div>

        <div className="space-y-2">
          {rows.map((row, idx) => {
            const isPaid = initialInstallments.find((i) => i.seq === row.seq)?.status === "paid";
            return (
              <div key={row.seq} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-1 text-xs text-gray-400 text-center">{row.seq}</div>
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => updateRow(idx, "label", e.target.value)}
                  placeholder="รายละเอียดงวด"
                  className="col-span-4 border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateRow(idx, "amount", e.target.value === "" ? 0 : Number(e.target.value))}
                  disabled={isPaid}
                  placeholder="ยอด"
                  className="col-span-3 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus-visible:ring-2 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <DateField
                  value={row.due_date ?? ""}
                  onChange={(iso) => updateRow(idx, "due_date", iso || null)}
                  className="col-span-3 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus-visible:ring-2"
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={isPaid}
                  aria-label={`ลบงวดที่ ${row.seq}`}
                  className="col-span-1 press w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 focus:outline-none focus-visible:ring-2"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })}
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
            title="แบ่งยอดบิลเท่ากันทุกงวด (งวดสุดท้ายดูดเศษ)"
          >
            <Icon name="clipboard" size={15} /> เกลี่ยเท่ากัน
          </button>
          <button
            type="button"
            onClick={fillLast}
            disabled={rows.length === 0}
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-brand-dark glass-soft hover:bg-brand/5 min-h-[44px] disabled:opacity-40 focus:outline-none focus-visible:ring-2"
            title="เติมส่วนต่างที่เหลือลงงวดสุดท้ายให้ครบยอดบิล"
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
