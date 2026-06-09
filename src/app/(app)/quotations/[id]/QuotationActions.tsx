"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuotationStatus } from "@/lib/types";

const NEXT: Record<QuotationStatus, { to: QuotationStatus; label: string }[]> = {
  draft: [{ to: "sent", label: "ทำเครื่องหมายส่งลูกค้า" }, { to: "cancelled", label: "ยกเลิก" }],
  sent: [{ to: "approved", label: "ลูกค้าอนุมัติ" }, { to: "cancelled", label: "ยกเลิก" }],
  approved: [{ to: "sent", label: "ถอยเป็น ส่งลูกค้า" }, { to: "draft", label: "ถอยเป็น ร่าง" }],
  cancelled: [{ to: "draft", label: "กลับเป็นร่าง" }],
};

export default function QuotationActions({
  id,
  status,
  hasActiveBilling,
}: {
  id: number;
  status: QuotationStatus;
  /** มีใบวางบิล active อยู่ = บล็อก rollback */
  hasActiveBilling?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const actions = NEXT[status];
  if (actions.length === 0) return null;

  async function change(to: QuotationStatus) {
    if (to === "cancelled" && !confirm("ยืนยันยกเลิกใบเสนอราคานี้?")) return;

    // ถ้า approved → sent/draft และมีบิล active → แจ้งแทนที่จะ call API
    const isRollback = status === "approved" && (to === "sent" || to === "draft");
    if (isRollback && hasActiveBilling) {
      alert("มีใบวางบิลที่ยังใช้งานอยู่ — ต้องยกเลิกใบวางบิลก่อนถอยสถานะ");
      return;
    }

    setBusy(true);
    const res = await fetch(`/api/quotations/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: to }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  return (
    <div className="flex gap-2">
      {actions.map((a) => (
        <button key={a.to} onClick={() => change(a.to)} disabled={busy}
          className={`press rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 min-h-[44px] focus:outline-none focus-visible:ring-2 ${
            a.to === "cancelled"
              ? "bg-red-50 text-red-700 focus-visible:ring-red-400"
              : a.to === "draft" || a.to === "sent"
                ? "glass-soft text-brand-dark"
                : "text-white bg-brand shadow-brand"
          }`}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
