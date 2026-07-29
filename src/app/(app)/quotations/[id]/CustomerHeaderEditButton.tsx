"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

// แก้หัวบิลใบเสนอ: ชื่อลูกค้า + ที่อยู่ — บันทึกลงทะเบียนลูกค้าด้วย (default)
//   ทะเบียนอัปเดต → ชื่อ propagate ไปทุกเอกสารของลูกค้า (ที่อยู่อัปเดตทะเบียนอย่างเดียว)
export default function CustomerHeaderEditButton({
  quotationId,
  currentName,
  currentAddress,
  hasCustomerLink,
}: {
  quotationId: number;
  currentName: string;
  currentAddress: string;
  /** ใบนี้ผูกกับทะเบียนลูกค้าไหม (customer_id) — ไม่ผูก = แก้ได้เฉพาะใบนี้ */
  hasCustomerLink: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [address, setAddress] = useState(currentAddress);
  const [saveToRegistry, setSaveToRegistry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setName(currentName);
    setAddress(currentAddress);
    setSaveToRegistry(true);
    setError("");
    setOpen(true);
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
        aria-label="แก้ชื่อ/ที่อยู่ลูกค้า"
        className="press inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-3 hover:bg-gray-100 hover:text-brand-dark align-middle focus:outline-none focus-visible:ring-2"
      >
        <Icon name="pencil" size={14} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/60 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="แก้หัวบิลลูกค้า"
    >
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="user" size={18} /> แก้หัวบิล (ชื่อ / ที่อยู่)
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">ชื่อลูกค้า</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2" />
        </label>

        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-500">ที่อยู่ (หน้างาน)</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={500}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 resize-y" />
        </label>

        {hasCustomerLink ? (
          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={saveToRegistry} onChange={(e) => setSaveToRegistry(e.target.checked)} className="mt-0.5" />
            <span>
              บันทึกลงทะเบียนลูกค้าด้วย
              <span className="block text-xs text-gray-400">
                {saveToRegistry
                  ? "อัปเดตทะเบียน · ชื่อจะเปลี่ยนตามในทุกเอกสารของลูกค้ารายนี้ (ที่อยู่เปลี่ยนเฉพาะทะเบียน)"
                  : "แก้เฉพาะใบเสนอราคานี้ (ไม่แตะทะเบียน)"}
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-gray-400">ใบนี้ไม่ได้ผูกกับทะเบียนลูกค้า — แก้ได้เฉพาะใบเสนอราคานี้</p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
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
