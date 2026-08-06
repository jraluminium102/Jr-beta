"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baht, footerSnapshot } from "@/lib/money";
import type { InstallmentFooter } from "@/lib/types";
import { FooterDisplayRows } from "./FooterDisplayRows";

// footer ใบวางบิล แก้ inline บน PDF — เครื่องคิดจริง: กรอก subtotal + %ส่วนลด + VAT + %หัก ณ ที่จ่าย
// → คิดยอด/สุทธิ ให้ (computeTotals) · display-only (ไม่ re-split งวด แก้ได้แม้จ่ายแล้ว)
// ส่ง "ค่าตั้งต้น" (subtotal+%) ให้ server คิด snapshot เก็บ (กันเลขเพี้ยน) · ปุ่ม/อินพุต .no-print
export default function PrintFooterEditor({
  apiUrl,
  suffix = "",
  def,
  current,
  real = false,
}: {
  apiUrl: string;                        // PATCH endpoint
  suffix?: string;                       // ต่อท้าย "รวมเป็นเงิน" เช่น " (งวดนี้)"
  def: InstallmentFooter;                // ค่าตั้งต้น (คิดแล้ว)
  current: InstallmentFooter | null;     // override เดิม (ถ้าเคยแก้)
  real?: boolean;                        // true = แก้ยอดจริง (billing-notes: total+แตกงวด) · false = display-only (footer_override)
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const base = current ?? def;
  const [sub, setSub] = useState(String(base.subtotal));
  const [dp, setDp] = useState(String(base.discount_pct || ""));
  const [vatOn, setVatOn] = useState(base.vat_rate > 0);
  const [wr, setWr] = useState(base.wht_rate || 0);

  const n = (v: string) => Math.max(0, Number(v) || 0);
  const cellL = "pr-10 py-0.5 text-gray-500 text-left";
  const cellR = "text-right tabular-nums";
  const inp = "w-16 border border-gray-300 rounded px-1.5 py-1 text-right outline-none tabular-nums focus-visible:ring-2 focus-visible:ring-brand";
  const inpWide = "w-28 border border-gray-300 rounded px-1.5 py-1 text-right outline-none tabular-nums focus-visible:ring-2 focus-visible:ring-brand";

  // พรีวิวสด (คิดเหมือน server)
  const t = footerSnapshot(n(sub), n(dp), vatOn ? 7 : 0, wr);
  const afterDiscount = Math.round((t.subtotal - t.discount_amt + Number.EPSILON) * 100) / 100;
  const total = Math.round((afterDiscount + t.vat_amt + Number.EPSILON) * 100) / 100;

  async function save(payload: { subtotal: number; discount_pct: number; vat_rate: number; wht_rate: number } | null) {
    setBusy(true); setErr(null);
    try {
      // real = แก้ยอดจริง (billing-notes รับ subtotal+% → คิด total+แตกงวดใหม่)
      // งวดแยก (real=false): บันทึก = book ภาษีจริงลงงวด (0117 · ไม่ใช่ display-only อีกต่อไป)
      //   ปุ่ม "ค่าตั้งต้น" (payload=null) = ล้าง footer_override เดิม (legacy) ไม่ book
      const body = real ? payload : (payload ? { book: payload } : { footer_override: null });
      const res = await fetch(apiUrl, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) { setEditing(false); router.refresh(); }
      else setErr(j?.error || "บันทึกไม่สำเร็จ");
    } catch { setErr("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  }

  if (editing) {
    return (
      <>
        <tr><td className={cellL}>รวมเป็นเงิน{suffix}</td><td className={cellR}>
          <input type="number" step="0.01" min={0} value={sub} onChange={(e) => setSub(e.target.value)} className={inpWide} aria-label="รวมเป็นเงิน" />
        </td></tr>
        <tr><td className={cellL}>
          <span className="inline-flex items-center gap-1">ส่วนลด
            <input type="number" step="any" min={0} max={100} value={dp} onChange={(e) => setDp(e.target.value)} className={inp} aria-label="ส่วนลด %" />%
          </span>
        </td><td className={`${cellR} text-red-700`}>-{baht(t.discount_amt)}</td></tr>
        <tr><td className={cellL}>ราคาหลังหักส่วนลด</td><td className={cellR}>{baht(afterDiscount)}</td></tr>
        <tr><td className={cellL}>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            {/* ⚠ เคยล็อกช่องนี้ไว้ (15 ก.ค.69) แล้ว "ถอยคืน" วันเดียวกัน — อย่าล็อกอีกโดยไม่ดูข้อมูลจริงก่อน:
                ตรวจ production พบ override ต่องวด 7 อัน "6 อันตั้ง VAT/หัก ณ ที่จ่าย ต่างจากใบโดยตั้งใจ"
                = วิธีทำงานจริงของร้าน (งวดค่าแรงติดตั้ง ตั้ง VAT 7 + หัก 3 บนใบที่ตัวใบเป็น No-VAT)
                ตรงกับที่เจ้าของอธิบาย: "ดึงงวด 1 แล้วเลือกหัก 3 ก็หักทั้งยอดที่ดึง" = เลือกภาษีต่องวด
                ปัญหาจริงไม่ใช่ "ห้ามตั้งต่องวด" แต่คือ "ตั้งแล้วใบเสร็จไม่รู้" → ต้องทำให้ค่านี้ booked + ใบเสร็จอ่าน (งานรอบหน้า) */}
            <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} /> ภาษีมูลค่าเพิ่ม 7%
          </label>
        </td><td className={cellR}>{baht(t.vat_amt)}</td></tr>
        <tr className="font-semibold"><td className={cellL}>จำนวนเงินรวมทั้งสิ้น</td><td className={cellR}>{baht(total)}</td></tr>
        <tr><td className={cellL}>
          {/* ⚠ ถอยการล็อกคืนเช่นกัน — ดูเหตุผลที่ช่อง VAT ข้างบน (งวดค่าแรงตั้งหัก 3% เองคือ flow จริง) */}
          <span className="inline-flex items-center gap-1">หักภาษี ณ ที่จ่าย
            <select value={wr} onChange={(e) => setWr(Number(e.target.value))} className="border border-gray-300 rounded px-1 py-1 text-xs outline-none">
              <option value={0}>ไม่หัก</option><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option>
            </select>
          </span>
        </td><td className={`${cellR} text-red-700`}>-{baht(t.wht_amt)}</td></tr>
        <tr className="no-print"><td colSpan={2} className="pt-2">
          {err && <div className="mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">ยอดสุทธิ <b className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.net)}</b></span>
            <span className="flex gap-2">
              {!real && (
                <button type="button" disabled={busy} onClick={() => save(null)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50" title="ล้างค่าที่แก้ กลับค่าตั้งต้น">ค่าตั้งต้น</button>
              )}
              <button type="button" disabled={busy} onClick={() => { setEditing(false); setErr(null); }}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button type="button" disabled={busy}
                onClick={() => save({ subtotal: n(sub), discount_pct: n(dp), vat_rate: vatOn ? 7 : 0, wht_rate: wr })}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white font-semibold shadow-brand disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}{real ? "บันทึก (ยอดเปลี่ยนจริง + แตกงวดใหม่)" : "บันทึก"}
              </button>
            </span>
          </div>
          {real && <div className="mt-1.5 text-[11px] text-gray-500">แก้แล้วยอดรวมทั้งใบ + งวดชำระจะคิดใหม่ทันที · บิลที่จ่ายแล้ว/มีใบเสร็จจะแก้ไม่ได้ (ต้องยกเลิกออกใหม่)</div>}
          {!real && <div className="mt-1.5 text-[11px] text-gray-500">บันทึก = ภาษีของ &quot;งวดนี้&quot; จะถูกใช้จริงตอนออกใบเสร็จ (ยอดงวดเปลี่ยนตาม) · แก้หัก ณ ที่จ่ายเป็น &quot;ไม่หัก&quot; แล้วบันทึก = เอา WHT ออกจากงวดนี้ · งวดที่รับชำระแล้ว/มีใบเสร็จจะแก้ไม่ได้</div>}
        </td></tr>
      </>
    );
  }

  // โหมดแสดง (พิมพ์ได้) — ไล่ยอดตามที่คิดไว้ + ปุ่มแก้ (.no-print)
  const v = current ?? def;
  return (
    <>
      <FooterDisplayRows v={v} suffix={suffix} />
      <tr className="no-print"><td colSpan={2} className="text-right pt-1">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-dark/70 hover:text-brand-dark inline-flex items-center gap-1">
          ✎ แก้ footer{current ? " (แก้แล้ว)" : ""}
        </button>
      </td></tr>
    </>
  );
}
