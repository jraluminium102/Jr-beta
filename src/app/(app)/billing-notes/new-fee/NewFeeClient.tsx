"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, computeTotals } from "@/lib/money";

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "transfer", label: "โอนเงิน" },
  { value: "cash", label: "เงินสด" },
  { value: "cheque", label: "เช็ค" },
];

// นิยามนอก component — ถ้านิยามใน render input จะ remount หลุดโฟกัสทุกตัวอักษร
function Field({ label, value, onChange, required, placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; className?: string;
}) {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}{required && <span className="text-red-600"> *</span>}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none"
      />
    </label>
  );
}

export type FeePrefill = {
  name?: string; address?: string; taxId?: string; phone?: string; contactPerson?: string; fee?: string;
};

export default function NewFeeClient({ initial }: { initial?: FeePrefill }) {
  const router = useRouter();

  // ── ข้อมูลลูกค้า (ใบกำกับภาษีเต็มรูป) — prefill จากคิว/ทะเบียนลูกค้าได้ (หัวบิลเหมือนฟอร์มอื่น) ──
  const [kind, setKind] = useState<"INDIVIDUAL" | "COMPANY">("INDIVIDUAL");
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [postalCode, setPostalCode] = useState("");
  const [taxId, setTaxId] = useState(initial?.taxId ?? "");
  const [branch, setBranch] = useState("สำนักงานใหญ่");
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");

  // ── รายการ ──
  const [itemName, setItemName] = useState("ค่าประเมินหน้างาน");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState(initial?.fee ?? "");

  // ── ภาษี/ชำระ ──
  const [vat, setVat] = useState<0 | 7>(7);
  const [wht, setWht] = useState<0 | 3>(0);
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState<"" | "bill" | "receipt">("");
  const busyRef = useRef(false);
  const [err, setErr] = useState("");

  const qtyNum = Number(qty) || 0;
  const unitPriceNum = Number(unitPrice) || 0;
  const t = useMemo(
    () => computeTotals({ items: [{ qty: qtyNum, unit_price: unitPriceNum }], vat_rate: vat, discount_pct: 0, wht_rate: wht }),
    [qtyNum, unitPriceNum, vat, wht]
  );

  const customerSnapshot = {
    name: name.trim(), address, tax_id: taxId, branch: kind === "COMPANY" ? branch : "", kind,
    postal_code: postalCode, contact_person: contactPerson, phone,
  };
  const canSubmit = !!name.trim() && unitPriceNum > 0 && qtyNum > 0;

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? "บันทึกไม่สำเร็จ");
    return json.data as { id: number; code: string };
  }

  async function submit(mode: "bill" | "receipt") {
    if (busyRef.current) return; // กันกดรัว/ดับเบิลแท็ป
    setErr("");
    if (!name.trim()) { setErr("ต้องระบุชื่อลูกค้า"); return; }
    if (unitPriceNum <= 0) { setErr("ต้องระบุราคาต่อหน่วยมากกว่า 0"); return; }

    busyRef.current = true;
    setBusy(mode);
    try {
      const itemBody = {
        customer_snapshot: customerSnapshot,
        item_name: itemName.trim() || "ค่าประเมินหน้างาน",
        qty: qtyNum, unit_price: unitPriceNum,
        vat_rate: vat, wht_rate: wht,
        issue_date: issueDate, note,
      };

      if (mode === "bill") {
        // (ก) ออกใบวางบิล + ใบเสร็จ ต่อกัน — ใบเสร็จผูก billing_note_id ที่เพิ่งสร้าง
        const bn = await postJson("/api/billing-notes/standalone", itemBody);
        const rc = await postJson("/api/receipts/standalone", {
          ...itemBody, payment_method: paymentMethod, billing_note_id: bn.id,
        });
        router.push(`/receipts/${rc.id}`);
      } else {
        // (ข) ออกใบเสร็จเลย — จ่ายหน้างานทันที ไม่ต้องมีใบวางบิล
        const rc = await postJson("/api/receipts/standalone", { ...itemBody, payment_method: paymentMethod });
        router.push(`/receipts/${rc.id}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="clipboard" size={18} />
        </span>
        ออกใบค่าประเมินหน้างาน
        <span className="text-xs font-normal text-ink-3">(เอกสารอิสระ ไม่ผูกใบเสนอราคา — รหัสออกอัตโนมัติเมื่อบันทึก)</span>
      </h1>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-brand-dark">ข้อมูลลูกค้า</h3>
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
                    placeholder="รหัสสาขา เช่น 00001"
                    className="glass-soft rounded-lg px-3 py-2 text-sm outline-none max-w-[160px]" />
                )}
              </div>
            )}

            <Field label="เลขประจำตัวผู้เสียภาษี / บัตรประชาชน" value={taxId} onChange={setTaxId} />
            <Field label="ที่อยู่ (ออกบิล)" value={address} onChange={setAddress} />
            <div className="max-w-[180px]">
              <Field label="รหัสไปรษณีย์" value={postalCode} onChange={(v) => setPostalCode(v.replace(/\D/g, "").slice(0, 5))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="ผู้ติดต่อ" value={contactPerson} onChange={setContactPerson} />
              <Field label="โทรศัพท์" value={phone} onChange={setPhone} />
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-brand-dark">รายการ</h3>
            <Field label="ชื่อรายการ" value={itemName} onChange={setItemName} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">จำนวน</span>
                <input type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none tabular-nums" />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ราคา/หน่วย *</span>
                <input type="number" inputMode="decimal" min={0} step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none tabular-nums" />
              </label>
            </div>

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

        <div>
          <Card className="p-5 sticky top-4">
            <h3 className="font-bold text-brand-dark mb-3">สรุปยอด</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-3">รวมเป็นเงิน</span><span className="tabular-nums">฿{baht(t.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-ink-3">ภาษีมูลค่าเพิ่ม {vat}%</span><span className="tabular-nums">฿{baht(t.vat_amt)}</span></div>
              <div className="border-t border-gray-300/70 my-1.5" />
              <div className="flex justify-between font-bold"><span className="text-ink">จำนวนเงินรวมทั้งสิ้น</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.total)}</span></div>
              {wht > 0 && (
                <div className="flex justify-between"><span className="text-ink-3">หักภาษี ณ ที่จ่าย {wht}%</span><span className="tabular-nums text-red-700">-฿{baht(t.wht_amt)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-300/70 pt-1.5">
                <span className="text-ink">ยอดชำระ</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.net)}</span>
              </div>
            </div>

            {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}

            <div className="mt-4 space-y-2">
              <button
                onClick={() => submit("bill")}
                disabled={!canSubmit || busy !== ""}
                className="press w-full rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60 min-h-[44px]"
              >
                {busy === "bill" ? "กำลังบันทึก…" : "ออกใบวางบิล + ใบเสร็จ"}
              </button>
              <button
                onClick={() => submit("receipt")}
                disabled={!canSubmit || busy !== ""}
                className="press w-full glass-soft rounded-xl py-2.5 text-sm font-semibold text-brand-dark disabled:opacity-60 min-h-[44px]"
              >
                {busy === "receipt" ? "กำลังบันทึก…" : "ออกใบเสร็จเลย (จ่ายหน้างานทันที)"}
              </button>
              <button
                onClick={() => router.back()}
                disabled={busy !== ""}
                className="press w-full glass-soft rounded-xl py-2.5 text-sm text-ink-2 min-h-[44px] disabled:opacity-60"
              >
                ยกเลิก
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
