"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function VoidReceiptButton({ receiptId }: { receiptId: number }) {
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
    const res = await fetch(`/api/receipts/${receiptId}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json.error ?? "ยกเลิกใบเสร็จไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold bg-red-50 text-red-700 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        aria-label="ยกเลิกใบเสร็จ"
      >
        <Icon name="trash" size={16} />
        ยกเลิกใบเสร็จ
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="ยกเลิกใบเสร็จ"
    >
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
            <Icon name="trash" size={18} /> ยกเลิกใบเสร็จ (Void)
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          ใบเสร็จจะถูก void (ไม่ลบจริง) — งวดที่ผูกอยู่จะกลับเป็น "รอชำระ" และยอดค้างรับจะถูกคำนวณใหม่
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">
            เหตุผล <span className="text-red-600">*</span>
          </span>
          <textarea
            required
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น บันทึกซ้ำ / ลูกค้าโอนผิดบัญชี"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-400 resize-none"
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
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className="press flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            ยืนยัน void
          </button>
        </div>
      </form>
    </div>
  );
}
