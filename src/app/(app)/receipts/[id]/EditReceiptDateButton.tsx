"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";

// แก้วันที่ออกใบเสร็จ/ใบกำกับภาษี — เดือนเดิมเท่านั้น (ข้ามเดือน = server reject ให้ void+ออกใหม่)
export default function EditReceiptDateButton({
  receiptId, currentDate, currentCode,
}: { receiptId: number; currentDate: string; currentCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const oldYm = currentDate.slice(0, 7);
  const newYm = date.slice(0, 7);
  const crossMonth = !!date && newYm !== oldYm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) { setError("กรุณาเลือกวันที่"); return; }
    if (!reason.trim()) { setError("ต้องระบุเหตุผลการแก้ไข"); return; }
    if (crossMonth) {
      setError("ใบกำกับภาษีเปลี่ยนเดือน/เลขไม่ได้ — ต้องยกเลิกใบนี้แล้วออกใหม่ (ปุ่มยกเลิก + ออกใหม่)");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/receipts/${receiptId}/date`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_date: date, reason: reason.trim() }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "แก้วันที่ไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => { setDate(currentDate); setReason(""); setError(""); setOpen(true); }}
        aria-label="แก้วันที่ออก"
        className="press inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-3 hover:bg-gray-100 hover:text-brand-dark align-middle focus:outline-none focus-visible:ring-2"
      >
        <Icon name="pencil" size={13} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="แก้วันที่ออกใบเสร็จ">
      <form onSubmit={submit} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={18} /> แก้วันที่ออกใบเสร็จ
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          ใบกำกับภาษี — แก้วันที่ได้เฉพาะ<b>เดือนเดิม</b> (เลขที่ {currentCode}) เท่านั้น · ข้ามเดือนต้องยกเลิกแล้วออกใหม่
        </p>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">วันที่ออก <span className="text-red-600">*</span></span>
          <DateField value={date} onChange={setDate}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        </label>

        {crossMonth && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            ⚠ วันที่นี้อยู่คนละเดือนกับเลขเอกสาร — บันทึกไม่ได้ ต้อง <b>ยกเลิกใบนี้แล้วออกใหม่</b> แทน
          </p>
        )}

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">เหตุผลการแก้ไข <span className="text-red-600">*</span></span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="เช่น พิมพ์วันที่ผิด กรอกวันที่รับเงินจริง"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand resize-none"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || !date || !reason.trim() || crossMonth}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
