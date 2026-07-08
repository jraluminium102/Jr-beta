"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// แก้ข้อความคอลัมน์ "รายละเอียด" (label งวด) inline บนหน้า PDF — ใช้ทั้งใบเดี่ยว/ใบรวม
// ปุ่ม/อินพุตเป็น .no-print (ตอนพิมพ์เห็นแต่ข้อความ) · แก้ได้แม้จ่ายแล้ว (label เป็นข้อความ ไม่กระทบยอด)
export default function PrintLabelEditor({
  installmentId,
  label,
}: {
  installmentId: number;
  label: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(label);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/billing-installments/${installmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: val }),
      });
      if (res.ok) { setEditing(false); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <span className="no-print inline-flex items-center gap-1.5">
        <input
          type="text"
          value={val}
          autoFocus
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { setVal(label); setEditing(false); } }}
          className="min-w-[10rem] border border-gray-300 rounded px-1.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="แก้รายละเอียดงวด"
        />
        <button type="button" disabled={busy} onClick={save}
          className="text-xs px-2 py-1 rounded bg-brand text-white font-semibold disabled:opacity-50">บันทึก</button>
        <button type="button" disabled={busy} onClick={() => { setVal(label); setEditing(false); }}
          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600">ยกเลิก</button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium">{label}</span>
      <button type="button" onClick={() => setEditing(true)}
        className="no-print text-xs text-brand-dark/60 hover:text-brand-dark"
        aria-label="แก้รายละเอียดงวดนี้" title="แก้ข้อความรายละเอียด">✎</button>
    </span>
  );
}
