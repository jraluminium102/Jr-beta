"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ช่องทางชำระเงิน (ซ้ายล่างใบวางบิล) — แก้ข้อความ inline บน PDF · เก็บลง billing_notes.payment_note (0104)
// ปุ่มแก้เป็น .no-print (พิมพ์เห็นแต่ข้อความ) · null/ว่าง = โชว์ default (DEFAULT_PAYMENT_NOTE) ที่ส่งมาเป็น prop
export default function PrintPaymentEditor({
  billId,
  value,
  fallback,
}: {
  billId: number;
  value: string | null;        // payment_note ที่เก็บไว้ (null = ยังไม่เคยแก้)
  fallback: string;            // ค่า default (DEFAULT_PAYMENT_NOTE)
}) {
  const router = useRouter();
  const text = (value ?? "").trim() ? (value as string) : fallback;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(text);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/billing-notes/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_note: val }),
      });
      if (res.ok) { setEditing(false); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="no-print">
        <textarea
          value={val}
          autoFocus
          disabled={busy}
          rows={4}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } if (e.key === "Escape") { setVal(text); setEditing(false); } }}
          className="w-72 border border-gray-300 rounded px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand resize-y"
          aria-label="แก้ช่องทางชำระเงิน"
        />
        <div className="flex gap-1.5 mt-1">
          <button type="button" disabled={busy} onClick={save}
            className="text-xs px-2 py-1 rounded bg-brand text-white font-semibold disabled:opacity-50">บันทึก</button>
          <button type="button" disabled={busy} onClick={() => { setVal(text); setEditing(false); }}
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600">ยกเลิก</button>
          <span className="text-[10px] text-gray-400 self-center">⌘/Ctrl+Enter = บันทึก</span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs text-gray-600">
      <span className="whitespace-pre-line">{text}</span>
      <button type="button" onClick={() => setEditing(true)}
        className="no-print ml-1.5 align-top text-brand-dark/60 hover:text-brand-dark"
        aria-label="แก้ช่องทางชำระเงิน" title="แก้ช่องทางชำระเงิน">✎</button>
    </div>
  );
}
