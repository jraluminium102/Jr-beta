"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht } from "@/lib/money";
import type { InstallmentFooter } from "@/lib/types";

// footer "แก้ inline บนหน้า PDF" — ใช้ได้ทั้งใบเต็ม (apiUrl=billing-notes) และงวดแยก (apiUrl=billing-installments)
// ค่าตั้งต้น = def · แก้ทับได้ จำไว้ (footer_override) · display-only ไม่กระทบยอด/งวด
// ปุ่ม/อินพุตทั้งหมด .no-print (ไม่ติดเวลาพิมพ์) · render เป็น <tr> ในตาราง footer
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function PrintFooterEditor({
  apiUrl,
  suffix = "",
  def,
  current,
  rates,
}: {
  apiUrl: string;                                 // PATCH endpoint (รับ {footer_override})
  suffix?: string;                                // ต่อท้าย "รวมเป็นเงิน" เช่น " (งวดนี้)"
  def: InstallmentFooter;                         // ค่าตั้งต้น (ใบเต็ม=ค่าจริง · งวด=เฉลี่ยตามสัดส่วน)
  current: InstallmentFooter | null;              // override เดิม (ถ้าเคยแก้)
  rates: { discount_pct: number; vat_rate: number; wht_rate: number };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = current ?? def;
  const [sub, setSub] = useState(String(base.subtotal));
  const [dis, setDis] = useState(String(base.discount));
  const [vat, setVat] = useState(String(base.vat));
  const [wht, setWht] = useState(String(base.wht));

  const n = (v: string) => Math.max(0, Number(v) || 0);
  const cellL = "pr-10 py-0.5 text-gray-500 text-left";
  const cellR = "text-right tabular-nums";
  const inp = "w-28 border border-gray-300 rounded px-1.5 py-1 text-right outline-none tabular-nums focus-visible:ring-2 focus-visible:ring-brand";

  const discL = `ส่วนลด${rates.discount_pct > 0 ? ` ${rates.discount_pct}%` : ""}`;
  const vatL = `ภาษีมูลค่าเพิ่ม${rates.vat_rate > 0 ? ` ${rates.vat_rate}%` : ""}`;
  const whtL = `หักภาษี ณ ที่จ่าย${rates.wht_rate > 0 ? ` ${rates.wht_rate}%` : ""}`;

  async function save(payload: InstallmentFooter | null) {
    setBusy(true);
    try {
      const res = await fetch(apiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ footer_override: payload }),
      });
      if (res.ok) { setEditing(false); router.refresh(); }
    } finally {
      setBusy(false);
    }
  }

  // โหมดแก้ — โชว์ครบ 4 ช่อง (เพิ่ม/ลบบรรทัดได้โดยใส่/ล้างเป็น 0)
  if (editing) {
    return (
      <>
        <tr><td className={cellL}>รวมเป็นเงิน{suffix}</td><td className={cellR}><input type="number" step="0.01" min={0} value={sub} onChange={(e) => setSub(e.target.value)} className={inp} aria-label="รวมเป็นเงิน" /></td></tr>
        <tr><td className={cellL}>{discL}</td><td className={cellR}><span className="mr-0.5">-</span><input type="number" step="0.01" min={0} value={dis} onChange={(e) => setDis(e.target.value)} className={inp} aria-label="ส่วนลด" /></td></tr>
        <tr><td className={cellL}>{vatL}</td><td className={cellR}><input type="number" step="0.01" min={0} value={vat} onChange={(e) => setVat(e.target.value)} className={inp} aria-label="ภาษีมูลค่าเพิ่ม" /></td></tr>
        <tr><td className={cellL}>{whtL}</td><td className={cellR}><span className="mr-0.5">-</span><input type="number" step="0.01" min={0} value={wht} onChange={(e) => setWht(e.target.value)} className={inp} aria-label="หักภาษี ณ ที่จ่าย" /></td></tr>
        <tr className="no-print"><td colSpan={2} className="pt-2">
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy}
              onClick={() => { setSub(String(def.subtotal)); setDis(String(def.discount)); setVat(String(def.vat)); setWht(String(def.wht)); save(null); }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              title="ล้างค่าที่แก้ กลับไปใช้ค่าตั้งต้น">ค่าตั้งต้น</button>
            <button type="button" disabled={busy}
              onClick={() => { const b = current ?? def; setSub(String(b.subtotal)); setDis(String(b.discount)); setVat(String(b.vat)); setWht(String(b.wht)); setEditing(false); }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">ยกเลิก</button>
            <button type="button" disabled={busy}
              onClick={() => save({ subtotal: n(sub), discount: n(dis), vat: n(vat), wht: n(wht) })}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white font-semibold shadow-brand disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}บันทึก
            </button>
          </div>
        </td></tr>
      </>
    );
  }

  // โหมดแสดง (พิมพ์ได้) + ปุ่มแก้ (.no-print)
  const v = current ?? def;
  const sR = round2(v.subtotal), dR = round2(v.discount), vR = round2(v.vat), wR = round2(v.wht);
  return (
    <>
      <tr><td className={cellL}>รวมเป็นเงิน{suffix}</td><td className={cellR}>{baht(sR)}</td></tr>
      {dR > 0 && <tr><td className={cellL}>{discL}</td><td className={cellR}>-{baht(dR)}</td></tr>}
      {vR > 0 && <tr><td className={cellL}>{vatL}</td><td className={cellR}>{baht(vR)}</td></tr>}
      {wR > 0 && <tr><td className={cellL}>{whtL}</td><td className={cellR}>-{baht(wR)}</td></tr>}
      <tr className="no-print"><td colSpan={2} className="text-right pt-1">
        <button type="button" onClick={() => setEditing(true)}
          className="text-xs text-brand-dark/70 hover:text-brand-dark inline-flex items-center gap-1">
          ✎ แก้ footer{current ? " (แก้แล้ว)" : ""}
        </button>
      </td></tr>
    </>
  );
}
