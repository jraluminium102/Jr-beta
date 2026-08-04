"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// แก้หัวเอกสารใบเสนอ (เหมือนใบวางบิล) — ชื่อ/นิติบุคคล/สาขา/เลขภาษี/ที่อยู่/ผู้ติดต่อ/เบอร์
//   บันทึกลง customer_snapshot ของใบนี้ + (ถ้าเลือก) ทะเบียนลูกค้าด้วย
export type HeaderSnapshot = {
  name?: string; address?: string; tax_id?: string; branch?: string;
  kind?: string; postal_code?: string; contact_person?: string; phone?: string;
};

const F = (v: unknown) => String(v ?? "");

export default function CustomerHeaderEditButton({
  quotationId,
  current,
  hasCustomerLink,
}: {
  quotationId: number;
  current: HeaderSnapshot;
  /** ใบนี้ผูกกับทะเบียนลูกค้าไหม (customer_id) — ไม่ผูก = แก้ได้เฉพาะใบนี้ */
  hasCustomerLink: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"INDIVIDUAL" | "COMPANY">(current.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL");
  const [name, setName] = useState(F(current.name));
  const [address, setAddress] = useState(F(current.address));
  const [postal, setPostal] = useState(F(current.postal_code));
  const [taxId, setTaxId] = useState(F(current.tax_id));
  const [branch, setBranch] = useState(F(current.branch) || "สำนักงานใหญ่");
  const [contact, setContact] = useState(F(current.contact_person));
  const [phone, setPhone] = useState(F(current.phone));
  const [saveToRegistry, setSaveToRegistry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setKind(current.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL");
    setName(F(current.name)); setAddress(F(current.address)); setPostal(F(current.postal_code));
    setTaxId(F(current.tax_id)); setBranch(F(current.branch) || "สำนักงานใหญ่");
    setContact(F(current.contact_person)); setPhone(F(current.phone));
    setSaveToRegistry(true); setError(""); setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError("กรุณากรอกชื่อลูกค้า"); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/quotations/${quotationId}/header`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        address: address.trim(),
        tax_id: taxId.trim(),
        branch: kind === "COMPANY" ? branch.trim() : "",
        kind,
        postal_code: postal.trim(),
        contact_person: contact.trim(),
        phone: phone.trim(),
        save_to_registry: hasCustomerLink && saveToRegistry,
      }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "แก้ไขไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={start}
        aria-label="แก้หัวเอกสาร (ข้อมูลลูกค้า)"
        className="press inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-3 hover:bg-gray-100 hover:text-brand-dark align-middle focus:outline-none focus-visible:ring-2"
      >
        <Icon name="pencil" size={14} />
      </button>
    );
  }

  const inp = "mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2";
  const lbl = "block text-sm";
  const cap = "text-xs font-medium text-gray-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 bg-black/60 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="แก้หัวเอกสารลูกค้า"
    >
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl space-y-3.5 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="user" size={18} /> แก้หัวเอกสาร (ข้อมูลลูกค้า)
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* ประเภทลูกค้า */}
        <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm">
          {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`press px-3 py-1.5 min-h-[40px] ${kind === k ? "bg-brand text-white" : "text-ink-2"}`}>
              {k === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
            </button>
          ))}
        </div>

        <label className={lbl}>
          <span className={cap}>{kind === "COMPANY" ? "ชื่อบริษัท" : "ชื่อลูกค้า"}</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200} className={inp} />
        </label>

        {kind === "COMPANY" && (
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!branch.startsWith("สาขา")} onChange={() => setBranch("สำนักงานใหญ่")} /> สำนักงานใหญ่</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={branch.startsWith("สาขา")} onChange={() => setBranch("สาขาที่ ")} /> สาขา</label>
            {branch.startsWith("สาขา") && (
              <input value={branch.replace(/\D/g, "")} onChange={(e) => setBranch("สาขาที่ " + e.target.value.replace(/\D/g, ""))}
                placeholder="รหัสสาขา เช่น 00001" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none max-w-[160px]" />
            )}
          </div>
        )}

        <label className={lbl}><span className={cap}>เลขประจำตัวผู้เสียภาษี / บัตรประชาชน</span>
          <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={40} className={inp} /></label>

        <label className={lbl}><span className={cap}>ที่อยู่ (ออกบิล)</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} className={`${inp} resize-y`} /></label>

        <div className="grid grid-cols-3 gap-3">
          <label className={lbl}><span className={cap}>รหัสไปรษณีย์</span>
            <input type="text" value={postal} onChange={(e) => setPostal(e.target.value.replace(/\D/g, "").slice(0, 5))} className={inp} /></label>
          <label className={lbl}><span className={cap}>ผู้ติดต่อ</span>
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} className={inp} /></label>
          <label className={lbl}><span className={cap}>โทรศัพท์</span>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} className={inp} /></label>
        </div>

        {hasCustomerLink ? (
          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={saveToRegistry} onChange={(e) => setSaveToRegistry(e.target.checked)} className="mt-0.5" />
            <span>บันทึกลงทะเบียนลูกค้าด้วย
              <span className="block text-xs text-gray-400">
                {saveToRegistry
                  ? "อัปเดตทะเบียน (ชื่อ/ที่อยู่/เลขภาษี/ผู้ติดต่อ/เบอร์) · ชื่อเปลี่ยนตามในทุกเอกสาร · ประเภท/สาขา/ไปรษณีย์ เก็บเฉพาะใบนี้"
                  : "แก้เฉพาะใบเสนอราคานี้ (ไม่แตะทะเบียน)"}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-gray-400">ใบนี้ไม่ได้ผูกกับทะเบียนลูกค้า — แก้ได้เฉพาะใบเสนอราคานี้</p>
        )}

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">ยกเลิก</button>
          <button type="submit" disabled={busy}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
