"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export type BoqQuotationOption = {
  id: number;
  code: string;
  customer_snapshot: { name?: string } | null;
};

// ปุ่ม "สร้าง BOQ จากใบเสนอ" — dropdown เลือกใบเสนอที่อนุมัติแล้ว → POST /api/boq
export default function NewBoqButton({ quotations }: { quotations: BoqQuotationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quotationId, setQuotationId] = useState<number | "">(quotations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!quotationId) { setErr("ต้องเลือกใบเสนอราคา"); return; }
    setBusy(true);
    const res = await fetch("/api/boq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotation_id: quotationId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "สร้างไม่สำเร็จ"); return; }
    router.push(`/boq/${json.data.id}`);
  }

  if (quotations.length === 0) {
    return <span className="text-xs text-ink-3">ยังไม่มีใบเสนอราคาที่อนุมัติ</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand"
      >
        <Icon name="plus" size={16} /> สร้าง BOQ จากใบเสนอ
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-20 w-80 glass-card rounded-2xl p-4 shadow-xl">
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">เลือกใบเสนอราคา *</span>
            <select
              value={quotationId}
              onChange={(e) => setQuotationId(e.target.value ? Number(e.target.value) : "")}
              className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none focusable"
            >
              <option value="">— เลือกใบเสนอราคา —</option>
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.code} · {q.customer_snapshot?.name ?? "—"}
                </option>
              ))}
            </select>
          </label>

          {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}

          <div className="mt-3 flex gap-2">
            <button
              onClick={submit}
              disabled={busy || !quotationId}
              className="press flex-1 rounded-xl py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60"
            >
              {busy ? "กำลังสร้าง…" : "สร้าง BOQ"}
            </button>
            <button onClick={() => setOpen(false)} className="press glass-soft rounded-xl px-4 py-2.5 text-sm text-ink-2">
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
