"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";

// แก้วันที่ออกใบเสนอราคา (ต่อใบ) — ISO YYYY-MM-DD · DateField บล็อกปี พ.ศ.
export default function IssueDateEditButton({
  quotationId,
  currentIssueDate,
}: {
  quotationId: number;
  currentIssueDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentIssueDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setDate(currentIssueDate);
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("กรุณาเลือกวันที่ให้ถูกต้อง"); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/quotations/${quotationId}/header`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue_date: date }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "แก้ไขไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={start}
        aria-label="แก้วันที่ออกใบเสนอ"
        className="press inline-flex items-center justify-center w-6 h-6 rounded-md text-ink-3 hover:bg-gray-100 hover:text-brand-dark align-middle focus:outline-none focus-visible:ring-2"
      >
        <Icon name="pencil" size={13} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/60 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="แก้วันที่ออกใบเสนอ"
    >
      <form onSubmit={submit} className="w-full max-w-xs bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={18} /> วันที่ออกใบเสนอ
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">วันที่ (วว/ดด/ปปปป · ค.ศ.)</span>
          <DateField value={date} onChange={setDate} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-ink outline-none focus-visible:ring-2 mt-1" aria-label="วันที่ออกใบเสนอ" />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
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
