"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";

// แก้ "ยอด" บนใบเสร็จเอง (Canva/FlowAccount) — พิมพ์ฐานภาษี/VAT/หัก ณ ที่จ่าย เอง ไม่คิดบังคับ ไม่บล็อก
//   amount = ฐาน + VAT (ก่อนหัก) · net = amount − หัก ณ ที่จ่าย (โชว์สดให้ดู)
export default function EditReceiptAmountsButton({
  receiptId, base, vatRate, vatAmt, whtRate, whtAmt,
}: {
  receiptId: number; base: number; vatRate: number; vatAmt: number; whtRate: number; whtAmt: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mBase, setMBase] = useState(String(base || ""));
  const [mVatRate, setMVatRate] = useState(String(vatRate || 7));
  const [mVat, setMVat] = useState(String(vatAmt || ""));
  const [mWhtRate, setMWhtRate] = useState(String(whtRate || 0));
  const [mWht, setMWht] = useState(String(whtAmt || ""));

  const n = (v: string) => Number(v) || 0;
  const gross = Math.round((n(mBase) + n(mVat)) * 100) / 100;
  const net = Math.round((gross - n(mWht)) * 100) / 100;
  const vatAuto = () => setMVat(String(Math.round((n(mBase) * (n(mVatRate) / 100)) * 100) / 100));

  function start() {
    setMBase(String(base || "")); setMVatRate(String(vatRate || 7)); setMVat(String(vatAmt || ""));
    setMWhtRate(String(whtRate || 0)); setMWht(String(whtAmt || "")); setErr(null); setOpen(true);
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/receipts/${receiptId}/amounts`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_amt: n(mBase), vat_rate: n(mVatRate), vat_amt: n(mVat),
          wht_rate: n(mWhtRate), wht_amt: n(mWht),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) { setOpen(false); router.refresh(); }
      else setErr(j?.error ?? "บันทึกไม่สำเร็จ");
    } catch { setErr("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={start} aria-label="แก้ยอด"
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
        <Icon name="pencil" size={16} /> แก้ยอด
      </button>
    );
  }

  const inp = "mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right outline-none tabular-nums focus-visible:ring-2";
  const rate = "w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right outline-none tabular-nums";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 bg-black/60 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="แก้ยอดใบเสร็จ">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-3.5 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2"><Icon name="pencil" size={18} /> แก้ยอดใบเสร็จ</h2>
          <button onClick={() => setOpen(false)} aria-label="ปิด" className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"><Icon name="close" size={18} /></button>
        </div>

        <label className="block text-sm"><span className="text-xs font-medium text-gray-500">ยอดก่อนภาษี (ฐาน)</span>
          <input type="number" step="0.01" value={mBase} onChange={(e) => setMBase(e.target.value)} className={inp} /></label>

        <div className="flex items-end gap-2">
          <label className="block text-sm flex-1"><span className="text-xs font-medium text-gray-500 flex items-center gap-1">ภาษีมูลค่าเพิ่ม
            <input type="number" step="any" value={mVatRate} onChange={(e) => setMVatRate(e.target.value)} className={rate} aria-label="อัตรา VAT %" />%
            <button type="button" onClick={vatAuto} className="ml-auto text-[11px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50" title="คิด VAT จากฐาน × อัตรา (แก้ทับได้)">= คิดให้</button></span>
            <input type="number" step="0.01" value={mVat} onChange={(e) => setMVat(e.target.value)} className={inp} aria-label="ยอด VAT" /></label>
        </div>

        <label className="block text-sm"><span className="text-xs font-medium text-gray-500 flex items-center gap-1">หักภาษี ณ ที่จ่าย
          <input type="number" step="any" value={mWhtRate} onChange={(e) => setMWhtRate(e.target.value)} className={rate} aria-label="อัตราหัก ณ ที่จ่าย %" />%</span>
          <input type="number" step="0.01" value={mWht} onChange={(e) => setMWht(e.target.value)} className={inp} aria-label="ยอดหัก ณ ที่จ่าย" /></label>

        <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm space-y-0.5">
          <div className="flex justify-between text-gray-500"><span>จำนวนเงินรวมทั้งสิ้น (ฐาน+VAT)</span><b className="tabular-nums text-ink">฿{baht(gross)}</b></div>
          <div className="flex justify-between text-gray-500"><span>เงินสดรับสุทธิ (หลังหัก ณ ที่จ่าย)</span><b className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(net)}</b></div>
        </div>

        {err && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
        <p className="text-[11px] text-gray-400">พิมพ์ยอดเองได้ทุกช่อง เอกสารพิมพ์ตามนี้เป๊ะ · ยอดรวม/สุทธิ คิดจากที่พิมพ์ (ฐาน+VAT, แล้วลบหัก ณ ที่จ่าย)</p>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy} className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">ยกเลิก</button>
          <button type="button" onClick={save} disabled={busy} className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] inline-flex items-center justify-center gap-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}บันทึก</button>
        </div>
      </div>
    </div>
  );
}
