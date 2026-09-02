"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, computeTotals, splitCashReceived } from "@/lib/money";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const PAYMENT_OPTIONS = [
  { value: "transfer", label: "โอนเงิน" },
  { value: "cash", label: "เงินสด" },
  { value: "cheque", label: "เช็ค" },
];

// นิยามนอก component — กัน remount หลุดโฟกัส
function Field({ label, value, onChange, required, placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; className?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}{required && <span className="text-red-600"> *</span>}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" />
    </label>
  );
}

// คิดยอดฝั่ง client ให้ตรงกับ server (before_vat → computeTotals · gross → splitCashReceived)
function calcMoney(amount: number, vat: 0 | 7, wht: 0 | 3, gross: boolean) {
  if (gross) {
    const s = splitCashReceived(round2(amount), vat, 0); // base+vat = amount เป๊ะ
    const wht_amt = round2((s.base * wht) / 100);
    return { subtotal: s.base, vat_amt: s.vat, total: round2(s.base + s.vat), wht_amt, net: round2(round2(amount) - wht_amt) };
  }
  const m = computeTotals({ items: [{ qty: 1, unit_price: amount }], vat_rate: vat, discount_pct: 0, wht_rate: wht });
  return { subtotal: m.subtotal, vat_amt: m.vat_amt, total: m.total, wht_amt: m.wht_amt, net: m.net };
}

export default function NewStandaloneReceiptClient() {
  const router = useRouter();

  const [kind, setKind] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branch, setBranch] = useState("สำนักงานใหญ่");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [gross, setGross] = useState(false); // false = ยอดก่อน VAT · true = ยอดรวม VAT แล้ว

  const [vat, setVat] = useState<0 | 7>(7);
  const [wht, setWht] = useState<0 | 3>(0);
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [err, setErr] = useState("");

  const amountNum = Number(amount) || 0;
  const t = useMemo(() => calcMoney(amountNum, vat, wht, gross), [amountNum, vat, wht, gross]);

  const taxIdDigits = taxId.replace(/\D/g, "");
  const taxIdWarn = kind === "COMPANY" && taxIdDigits.length > 0 && taxIdDigits.length !== 13;
  const taxIdMissing = kind === "COMPANY" && taxIdDigits.length === 0;
  const canSubmit = !!name.trim() && !!desc.trim() && amountNum > 0;

  async function submit() {
    if (busyRef.current) return;
    setErr("");
    if (!name.trim()) { setErr("ต้องระบุชื่อลูกค้า"); return; }
    if (!desc.trim()) { setErr("ต้องระบุรายละเอียด"); return; }
    if (amountNum <= 0) { setErr("ต้องระบุยอดเงินมากกว่า 0"); return; }

    busyRef.current = true; setBusy(true);
    try {
      const res = await fetch("/api/receipts/standalone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_snapshot: {
            name: name.trim(), address, tax_id: taxId, branch: kind === "COMPANY" ? branch : "", kind,
            postal_code: postalCode, contact_person: contactPerson, phone,
          },
          item_name: desc.trim(), qty: 1, unit_price: amountNum,
          vat_rate: vat, wht_rate: wht, payment_method: paymentMethod,
          issue_date: issueDate, note,
          doc_kind: "standalone", amount_mode: gross ? "gross" : "before_vat",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "บันทึกไม่สำเร็จ");
      router.push(`/receipts/${json.data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      busyRef.current = false; setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="receipt" size={18} />
        </span>
        ออกใบเสร็จ / ใบกำกับภาษี
        <span className="text-xs font-normal text-ink-3">(สร้างใหม่ · ไม่ผูกงาน · รหัสออกอัตโนมัติเมื่อบันทึก)</span>
      </h1>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* ── ลูกค้า ── */}
          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-brand-dark">ข้อมูลลูกค้า (หัวบิล)</h3>
            <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm">
              {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`press px-3 py-1.5 min-h-[44px] ${kind === k ? "bg-brand text-white" : "text-ink-2"}`}>
                  {k === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
                </button>
              ))}
            </div>

            <Field label={kind === "COMPANY" ? "ชื่อบริษัท" : "ชื่อลูกค้า"} value={name} onChange={setName} required />

            {kind === "COMPANY" && (
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <label className="flex items-center gap-1.5"><input type="radio" checked={!branch.startsWith("สาขา")} onChange={() => setBranch("สำนักงานใหญ่")} /> สำนักงานใหญ่</label>
                <label className="flex items-center gap-1.5"><input type="radio" checked={branch.startsWith("สาขา")} onChange={() => setBranch("สาขาที่ ")} /> สาขา</label>
                {branch.startsWith("สาขา") && (
                  <input value={branch.replace(/\D/g, "")} onChange={(e) => setBranch("สาขาที่ " + e.target.value.replace(/\D/g, ""))}
                    placeholder="รหัสสาขา เช่น 00001" className="glass-soft rounded-lg px-3 py-2 text-sm outline-none max-w-[160px]" />
                )}
              </div>
            )}

            <Field label="เลขประจำตัวผู้เสียภาษี / บัตรประชาชน" value={taxId} onChange={setTaxId} />
            {taxIdWarn && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">⚠ เลขผู้เสียภาษีควรมี 13 หลัก (กรอกแล้ว {taxIdDigits.length} หลัก) — ไม่ครบ ลูกค้าเครดิตภาษีซื้อไม่ได้</p>}
            {taxIdMissing && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">⚠ นิติบุคคลควรมีเลขผู้เสียภาษี 13 หลัก + สาขา บนใบกำกับภาษี</p>}
            <Field label="ที่อยู่ (ออกบิล)" value={address} onChange={setAddress} />
            <div className="max-w-[180px]">
              <Field label="รหัสไปรษณีย์" value={postalCode} onChange={(v) => setPostalCode(v.replace(/\D/g, "").slice(0, 5))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="ผู้ติดต่อ" value={contactPerson} onChange={setContactPerson} />
              <Field label="โทรศัพท์" value={phone} onChange={setPhone} />
            </div>
          </Card>

          {/* ── รายการ ── */}
          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-brand-dark">รายการ</h3>
            <label className="block text-sm">
              <span className="text-xs font-medium text-ink-3">รายละเอียด <span className="text-red-600">*</span></span>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="เช่น ค่าสินค้า/บริการ …"
                className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none resize-y" />
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ยอดเงิน <span className="text-red-600">*</span></span>
                <input type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none tabular-nums" />
              </label>
              <div className="text-sm">
                <span className="text-xs font-medium text-ink-3">ยอดที่กรอกคือ</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm mt-1 w-full">
                  <button type="button" onClick={() => setGross(false)} className={`press flex-1 px-2 py-2 min-h-[44px] ${!gross ? "bg-brand text-white" : "text-ink-2"}`}>ก่อน VAT</button>
                  <button type="button" onClick={() => setGross(true)} className={`press flex-1 px-2 py-2 min-h-[44px] ${gross ? "bg-brand text-white" : "text-ink-2"}`}>รวม VAT แล้ว</button>
                </div>
              </div>
            </div>
            <p className="text-xs text-ink-3">
              {gross ? "ยอดที่กรอก = ราคารวม VAT แล้ว — ระบบจะถอด VAT ให้" : "ยอดที่กรอก = ราคาก่อน VAT — ระบบจะบวก VAT ให้"}
            </p>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={vat === 7} onChange={(e) => setVat(e.target.checked ? 7 : 0)} /> ภาษีมูลค่าเพิ่ม 7%
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={wht === 3} onChange={(e) => setWht(e.target.checked ? 3 : 0)} /> หัก ณ ที่จ่าย 3%
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">วิธีชำระ</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-1.5 mt-0.5 outline-none">
                  {PAYMENT_OPTIONS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                </select>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">วันที่ออก</span>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" />
              </label>
              <Field label="หมายเหตุ" value={note} onChange={setNote} />
            </div>
          </Card>
        </div>

        {/* ── สรุปยอด ── */}
        <div>
          <Card className="p-5 sticky top-4">
            <h3 className="font-bold text-brand-dark mb-3">สรุปยอด</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-3">รวมเป็นเงิน (ก่อน VAT)</span><span className="tabular-nums">฿{baht(t.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-ink-3">ภาษีมูลค่าเพิ่ม {vat}%</span><span className="tabular-nums">฿{baht(t.vat_amt)}</span></div>
              <div className="border-t border-gray-300/70 my-1.5" />
              <div className="flex justify-between font-bold"><span className="text-ink">จำนวนเงินรวมทั้งสิ้น</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.total)}</span></div>
              {wht > 0 && (
                <div className="flex justify-between"><span className="text-ink-3">หักภาษี ณ ที่จ่าย {wht}%</span><span className="tabular-nums text-red-700">-฿{baht(t.wht_amt)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-300/70 pt-1.5">
                <span className="text-ink">เงินสดรับสุทธิ</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.net)}</span>
              </div>
            </div>

            {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}

            <div className="mt-4 space-y-2">
              <button onClick={submit} disabled={!canSubmit || busy}
                className="press w-full rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60 min-h-[44px]">
                {busy ? "กำลังบันทึก…" : "ออกใบเสร็จ / ใบกำกับภาษี"}
              </button>
              <button onClick={() => router.back()} disabled={busy}
                className="press w-full glass-soft rounded-xl py-2.5 text-sm text-ink-2 min-h-[44px] disabled:opacity-60">
                ยกเลิก
              </button>
            </div>
            <p className="mt-3 text-[11px] text-ink-3 leading-relaxed">
              เอกสารนี้ไม่ผูกงาน/ใบเสนอ · เงินไม่เข้ายอดรับ-ค้างรับของงานใด · VAT เข้ารายงานภาษีขายปกติ
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
