"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";

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
}: {
  billingNoteId: number;
  total: number;
  initialInstallments: InstallmentRow[];
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
    setRows(rows.filter((_, i) => i !== idx));
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
                <input
                  type="date"
                  value={row.due_date ?? ""}
                  onChange={(e) => updateRow(idx, "due_date", e.target.value || null)}
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

        <button
          type="button"
          onClick={addRow}
          className="press inline-flex items-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2"
        >
          <Icon name="plus" size={16} /> เพิ่มงวด
        </button>

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
