"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ช่องกรอก "% ค่าแรง" บนหน้าพิมพ์งวดแยก — กรอกแล้ว footer แตกค่าของ/ค่าแรงตาม %
// ขับผ่าน URL param ?labor=<%> (เว้นว่าง = ไม่แยก โชว์แค่ยอดก่อน VAT/VAT) · ใช้ตอนพิมพ์ ไม่กระทบข้อมูลบิล
export default function FooterLaborInput({
  billingNoteId,
  seq,
  current,
}: {
  billingNoteId: number;
  seq: number;
  current: string;
}) {
  const router = useRouter();
  const [val, setVal] = useState(current);

  function apply(v: string) {
    const clean = v === "" ? "" : String(Math.min(100, Math.max(0, Number(v) || 0)));
    const params = new URLSearchParams();
    params.set("installment", String(seq));
    if (clean !== "") params.set("labor", clean);
    router.replace(`/billing-notes/${billingNoteId}/print?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-ink-3">ค่าแรง</span>
      <input
        type="number"
        min={0}
        max={100}
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => apply(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply(val);
          }
        }}
        placeholder="—"
        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label="% ค่าแรง"
      />
      <span className="text-xs text-ink-3">% <span className="text-ink-4">(เว้นว่าง = ไม่แยก)</span></span>
    </div>
  );
}
