"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { PRODUCTION_STATUS_LABEL, type ProductionStatus } from "@/lib/types";

const ALL: ProductionStatus[] = [
  "queued", "measuring", "manufacturing", "qc", "ready", "installed", "done", "cancelled",
];

// ลำดับขั้นปกติของงานผลิต (ไม่รวมยกเลิก)
const FLOW: ProductionStatus[] = [
  "queued", "measuring", "manufacturing", "qc", "ready", "installed", "done",
];

export default function ProductionActions({ id, status }: { id: number; status: ProductionStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<ProductionStatus>(status);

  const idx = FLOW.indexOf(status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  async function change(to: ProductionStatus) {
    if (to === "cancelled" && !confirm("ยืนยันยกเลิกใบสั่งผลิตนี้?")) return;
    setBusy(true);
    const res = await fetch(`/api/production-orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("เปลี่ยนสถานะไม่สำเร็จ");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value as ProductionStatus)}
        disabled={busy}
        className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm font-semibold text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
      >
        {ALL.map((s) => (
          <option key={s} value={s}>{PRODUCTION_STATUS_LABEL[s]}</option>
        ))}
      </select>
      <button
        onClick={() => change(sel)}
        disabled={busy || sel === status}
        className="press rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60"
      >
        เปลี่ยนสถานะ
      </button>
      {next && (
        <button
          onClick={() => change(next)}
          disabled={busy}
          className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark disabled:opacity-60"
        >
          <Icon name="check" size={16} /> {PRODUCTION_STATUS_LABEL[next]}
        </button>
      )}
    </div>
  );
}
