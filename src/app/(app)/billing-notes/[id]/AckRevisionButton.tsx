"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/**
 * ปุ่ม "รับทราบ · ยอดเดิมถูกแล้ว" บนแถบเตือน Rev เก่า (0127)
 *   กดแล้วป้ายหาย จนกว่าใบเสนอจะ Rev ใหม่อีกรอบ — ไม่แตะยอด/งวด/สถานะ
 */
export default function AckRevisionButton({ id }: { id: number | string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function ack() {
    setBusy(true); setMsg("");
    try {
      await api(`/api/billing-notes/${id}/ack-revision`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={ack} disabled={busy}
        className="press rounded-lg bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 disabled:opacity-50">
        {busy ? "กำลังบันทึก…" : "รับทราบ · ยอดเดิมถูกแล้ว"}
      </button>
      {msg && <span className="text-xs text-red-700">{msg}</span>}
    </span>
  );
}
