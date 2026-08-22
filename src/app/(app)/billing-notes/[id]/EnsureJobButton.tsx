"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// ปุ่ม "ผูกงาน + ดันเข้าผลิต" — โผล่เมื่อใบวางบิลยังไม่มีงาน (job_id null)
//   เคสใบเสนอนอกระบบพิมพ์เอง ลูกค้าใหม่ยังไม่มีงาน → วางบิล/ชำระแล้วงานไม่เข้าผลิต
export default function EnsureJobButton({ billingNoteId }: { billingNoteId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!window.confirm("สร้างงานให้ใบวางบิลนี้ แล้วดันเข้าระบบผลิต (ถ้าจ่ายมัดจำแล้ว)?\nปลอดภัย รันซ้ำได้")) return;
    setBusy(true);
    const res = await fetch(`/api/billing-notes/${billingNoteId}/ensure-job`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) {
      const d = j?.data ?? {};
      alert(
        (d.created ? "สร้างงานให้แล้ว" : "ใช้งานเดิม") +
        (d.promoted ? " · ดันเข้าผลิตแล้ว" : " · ยังไม่จ่ายมัดจำ จึงยังไม่เข้าผลิต") +
        (d.backfilled ? ` · ลงบัญชีย้อนหลัง ${d.backfilled} งวด` : "")
      );
      router.refresh();
      return;
    }
    alert(j?.error ?? "ทำรายการไม่สำเร็จ");
  }

  return (
    <button onClick={run} disabled={busy}
      className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 shadow disabled:opacity-60">
      <Icon name="briefcase" size={16} /> {busy ? "กำลังทำ…" : "ผูกงาน + ดันเข้าผลิต"}
    </button>
  );
}
