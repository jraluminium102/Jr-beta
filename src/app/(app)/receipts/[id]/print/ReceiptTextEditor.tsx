"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// แก้ "ข้อความ" บนใบเสร็จ/ใบกำกับ inline บนหน้า PDF — รายการ (item_desc) + หมายเหตุ (note)
// ไม่แตะยอด/VAT (เอกสารภาษี) · ปุ่ม/อินพุต .no-print · block ถ้าใบ void (server เช็คซ้ำ)
// บัญชี: แก้ "รายการ" = องค์ประกอบบังคับ ม.86/4 → เตือน void+ออกใหม่ + บังคับเหตุผล · แก้หมายเหตุเฉยๆ ไม่ต้อง
export default function ReceiptTextEditor({
  receiptId,
  itemDesc,
  note,
  placeholder,
}: {
  receiptId: number;
  itemDesc: string;      // ค่าปัจจุบัน (อาจว่าง = ใช้ placeholder)
  note: string;
  placeholder: string;   // ข้อความตั้งต้นถ้า item_desc ว่าง
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [desc, setDesc] = useState(itemDesc);
  const [nt, setNt] = useState(note);
  const [reason, setReason] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const descChanged = desc.trim() !== itemDesc.trim();

  function cancel() {
    setDesc(itemDesc); setNt(note); setReason(""); setErrMsg(""); setEditing(false);
  }

  async function save() {
    if (descChanged && !reason.trim()) {
      setErrMsg("การแก้ 'รายการ' บนใบกำกับภาษีต้องระบุเหตุผล");
      return;
    }
    setBusy(true);
    setErrMsg("");
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_desc: desc, note: nt, ...(descChanged ? { reason } : {}) }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) { setEditing(false); setReason(""); router.refresh(); }
      else setErrMsg(j?.error ?? "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  if (editing) {
    return (
      <span className="no-print block space-y-1.5">
        <input
          type="text" value={desc} autoFocus disabled={busy}
          onChange={(e) => setDesc(e.target.value)} onKeyDown={onKey}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded px-1.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="รายการ"
        />
        <input
          type="text" value={nt} disabled={busy}
          onChange={(e) => setNt(e.target.value)} onKeyDown={onKey}
          placeholder="หมายเหตุ (ถ้ามี)"
          className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="หมายเหตุ"
        />
        {descChanged && (
          <span className="block rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            ⚠ แก้ &quot;รายการ&quot; = แก้สาระใบกำกับภาษี — ถ้าส่งลูกค้า/นำส่ง VAT แล้ว ควร <b>ยกเลิกแล้วออกใหม่</b> · ถ้าจะแก้ ต้องระบุเหตุผล (เก็บ log)
            <input
              type="text" value={reason} disabled={busy}
              onChange={(e) => setReason(e.target.value)} onKeyDown={onKey}
              placeholder="เหตุผลการแก้ เช่น พิมพ์ชื่อรายการผิดก่อนส่งลูกค้า"
              className="mt-1 w-full border border-amber-300 rounded px-1.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-label="เหตุผลการแก้รายการ"
            />
          </span>
        )}
        {errMsg && <span className="block text-xs text-red-700">{errMsg}</span>}
        <span className="inline-flex gap-2">
          <button type="button" disabled={busy} onClick={save}
            className="text-xs px-2.5 py-1 rounded bg-brand text-white font-semibold disabled:opacity-50">บันทึก</button>
          <button type="button" disabled={busy} onClick={cancel}
            className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600">ยกเลิก</button>
        </span>
      </span>
    );
  }

  return (
    <span className="block">
      <span className="inline-flex items-start gap-1.5">
        <span>{desc.trim() ? desc : placeholder}</span>
        <button type="button" onClick={() => setEditing(true)}
          className="no-print text-xs text-brand-dark/60 hover:text-brand-dark shrink-0"
          aria-label="แก้ข้อความรายการ" title="แก้ข้อความ">✎</button>
      </span>
      {nt.trim() && <span className="block text-xs text-gray-500">{nt}</span>}
    </span>
  );
}
