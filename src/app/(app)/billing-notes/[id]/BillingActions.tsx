"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
import DateField from "@/components/ui/DateField";

export default function BillingActions({
  billingNoteId, installmentId, amount,
}: { billingNoteId: number; installmentId: number; amount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paidAmount, setPaidAmount] = useState(String(amount));
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));

  async function submit(force = false) {
    const amt = Number(paidAmount) || 0;
    if (amt <= 0) { alert("ยอดรับชำระต้องมากกว่า 0"); return; }
    setBusy(true);
    const res = await fetch(`/api/billing-notes/${billingNoteId}/pay`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installment_id: installmentId, paid_amount: amt, paid_date: paidDate, force }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); return; }
    // มัดจำ token เดิมน้อยกว่ายอดงวด → ถามยืนยันว่ารับเงินจริง แล้วส่ง force ปิดได้
    if (j?.needs_confirm) {
      if (window.confirm(`${j.error ?? ""}\n\nยืนยันว่าลูกค้าจ่ายยอดนี้จริง? (ระบบจะปรับมัดจำเดิมเป็นยอดนี้ให้)`)) {
        submit(true);
      }
      return;
    }
    alert(j?.error ?? "บันทึกรับชำระไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="press rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-brand shadow-brand">
        บันทึกชำระ
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
      <input type="number" inputMode="decimal" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)}
        placeholder={baht(amount)} aria-label="ยอดรับชำระ"
        className="glass-soft rounded-lg px-2 py-1.5 text-xs w-24 text-right tabular-nums outline-none" />
      <DateField value={paidDate} onChange={(iso) => setPaidDate(iso)} aria-label="วันที่รับชำระ"
        className="glass-soft rounded-lg px-2 py-1.5 text-xs outline-none" />
      <button onClick={() => submit()} disabled={busy}
        className="press rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
        {busy ? "…" : "ยืนยัน"}
      </button>
      <button onClick={() => setOpen(false)} disabled={busy}
        className="press rounded-lg px-2 py-1.5 text-xs text-ink-2 glass-soft">ยกเลิก</button>
    </div>
  );
}
