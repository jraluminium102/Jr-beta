"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ตั้ง footer ต่องวด (display-only) — กรอก % ค่าแรง ของงวดนั้น แล้วจำไว้ (พิมพ์งวดนี้จะโชว์ตามนี้)
// เว้นว่าง = ไม่แยก (โชว์แค่ยอดก่อน VAT/VAT) · 0 = ค่าของล้วน · 100 = ค่าแรงล้วน · 40 = แยก 40/60
export default function InstallmentFooterInput({
  installmentId,
  current,
}: {
  installmentId: number;
  current: number | null;
}) {
  const router = useRouter();
  const [val, setVal] = useState<string>(current == null ? "" : String(current));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next: string) {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/billing-installments/${installmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ footer_labor_pct: next === "" ? null : Number(next) }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-3" title="ตั้งท้ายใบตอนพิมพ์งวดนี้ (เว้นว่าง = ไม่แยกค่าของ/ค่าแรง)">
      <span>ค่าแรง</span>
      <input
        type="number"
        min={0}
        max={100}
        inputMode="decimal"
        value={val}
        disabled={busy}
        onChange={(e) => setVal(e.target.value === "" ? "" : String(Math.min(100, Math.max(0, Number(e.target.value) || 0))))}
        onBlur={() => { if ((current == null ? "" : String(current)) !== val) save(val); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        placeholder="—"
        className="w-12 glass-soft rounded px-1 py-0.5 text-right outline-none tabular-nums disabled:opacity-50"
        aria-label="% ค่าแรงของงวดนี้ (ท้ายใบ)"
      />
      <span>%{saved ? " ✓" : ""}</span>
    </span>
  );
}
