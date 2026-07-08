"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";
import type { InstallmentFooter } from "@/lib/types";

// แก้ footer ใบวางบิลพิมพ์แยกงวด (ต่องวด) — prefill = ค่าเฉลี่ยตามสัดส่วน · แก้ทับได้ · จำไว้
// ยอดงวดจริง (amount) ไม่เปลี่ยน — footer เป็นข้อมูลประกอบบนใบพิมพ์เท่านั้น
export default function InstallmentFooterEditor({
  installmentId,
  seq,
  amount,
  def,
  current,
  rates,
}: {
  installmentId: number;
  seq: number;
  amount: number;
  def: InstallmentFooter;                       // ค่าเฉลี่ยตามสัดส่วน (autofill)
  current: InstallmentFooter | null;            // override เดิม (ถ้าเคยแก้)
  rates: { discount_pct: number; vat_rate: number; wht_rate: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isCustom = !!current;
  // ฟอร์มเริ่มจาก override ถ้ามี ไม่งั้นจากค่าเฉลี่ย (autofill)
  const start = current ?? def;
  const [sub, setSub] = useState(String(start.subtotal));
  const [dis, setDis] = useState(String(start.discount));
  const [vat, setVat] = useState(String(start.vat));
  const [wht, setWht] = useState(String(start.wht));

  const n = (v: string) => Math.max(0, Number(v) || 0);
  const net = n(sub) - n(dis) + n(vat) - n(wht); // ยอดที่ footer แตกได้ (ควรใกล้ยอดงวดจริง)
  const mismatch = Math.abs(net - amount) > 0.5;

  async function save(payload: InstallmentFooter | null) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/billing-installments/${installmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ footer_override: payload }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) { setOpen(false); router.refresh(); }
      else setError(j?.error ?? "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save({ subtotal: n(sub), discount: n(dis), vat: n(vat), wht: n(wht) });
  }

  function reset() {
    // กลับไปใช้ค่าเฉลี่ยอัตโนมัติ (ล้าง override) + เซ็ตช่องกลับเป็น def ให้เห็น
    setSub(String(def.subtotal)); setDis(String(def.discount));
    setVat(String(def.vat)); setWht(String(def.wht));
    save(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1 text-xs text-brand-dark/70 hover:text-brand-dark"
        aria-label={`แก้ footer งวดที่ ${seq}`}
        title="แก้ footer ท้ายใบตอนพิมพ์งวดนี้ (ค่าตั้งต้น = เฉลี่ยตามสัดส่วน)"
      >
        <Icon name="pencil" size={12} /> footer งวดนี้{isCustom ? " ✎" : ""}
      </button>
    );
  }

  const fieldCls = "w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-right outline-none tabular-nums focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="แก้ footer งวดนี้">
      <form onSubmit={submit} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="pencil" size={18} /> footer งวดที่ {seq}
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          ค่าตั้งต้น = เฉลี่ยตามสัดส่วนงวด (autofill) — แก้ทับได้ · เป็น<b>ข้อมูลบนใบพิมพ์งวดนี้</b>เท่านั้น ไม่กระทบยอดงวด/ยอดบิล
        </div>

        <div className="space-y-2">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-3">รวมเป็นเงิน</span>
            <span className="flex items-center gap-1 tabular-nums">฿
              <input type="number" inputMode="decimal" step="0.01" min={0} value={sub} onChange={(e) => setSub(e.target.value)} className={fieldCls} aria-label="รวมเป็นเงิน" />
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-3">ส่วนลด{rates.discount_pct > 0 ? ` ${rates.discount_pct}%` : ""}</span>
            <span className="flex items-center gap-1 tabular-nums">-฿
              <input type="number" inputMode="decimal" step="0.01" min={0} value={dis} onChange={(e) => setDis(e.target.value)} className={fieldCls} aria-label="ส่วนลด" />
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-3">ภาษีมูลค่าเพิ่ม{rates.vat_rate > 0 ? ` ${rates.vat_rate}%` : ""}</span>
            <span className="flex items-center gap-1 tabular-nums">฿
              <input type="number" inputMode="decimal" step="0.01" min={0} value={vat} onChange={(e) => setVat(e.target.value)} className={fieldCls} aria-label="ภาษีมูลค่าเพิ่ม" />
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-3">หักภาษี ณ ที่จ่าย{rates.wht_rate > 0 ? ` ${rates.wht_rate}%` : ""}</span>
            <span className="flex items-center gap-1 tabular-nums">-฿
              <input type="number" inputMode="decimal" step="0.01" min={0} value={wht} onChange={(e) => setWht(e.target.value)} className={fieldCls} aria-label="หักภาษี ณ ที่จ่าย" />
            </span>
          </label>
          <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
            <span className="text-ink-3">footer รวมได้</span>
            <b className={`tabular-nums ${mismatch ? "text-amber-700" : "text-ink"}`}>฿{baht(net)}</b>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-3">ยอดงวดจริง (เรียกเก็บ)</span>
            <b className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(amount)}</b>
          </div>
          {mismatch && (
            <p className="text-xs text-amber-700">⚠ footer รวมไม่เท่ายอดงวดจริง — โชว์ได้แต่ตัวเลขจะไม่บาลานซ์บนใบ</p>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={reset} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2"
            title="ล้างค่าที่แก้ กลับไปใช้ค่าเฉลี่ยอัตโนมัติ">
            ใช้ค่าเฉลี่ยอัตโนมัติ
          </button>
          <button type="submit" disabled={busy}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
