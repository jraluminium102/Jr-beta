"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

type Snap = {
  name?: string; job?: string; address?: string; postal_code?: string;
  tax_id?: string; branch?: string; kind?: string; contact_person?: string; phone?: string;
};

// นิยามนอก component — ถ้านิยามใน render input จะ remount หลุดโฟกัสทุกตัวอักษร
function HeaderField({ label, value, onChange, required }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-gray-500">{label}{required && <span className="text-red-600"> *</span>}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
    </label>
  );
}

// ปุ่ม + โมดัลแก้หัวเอกสาร (ชื่อ/ที่อยู่/เลขภาษีลูกค้า) — เผื่อออกในนามบริษัท
// requireReason=true (ใบเสร็จ) → บังคับเหตุผล + เตือนภาษีเมื่อแก้เลขผู้เสียภาษี
export function EditDocHeaderModal({
  endpoint,
  snapshot,
  requireReason,
}: {
  endpoint: string;
  snapshot: Snap;
  requireReason?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: snapshot.name ?? "",
    job: snapshot.job ?? "",
    kind: snapshot.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL",
    tax_id: snapshot.tax_id ?? "",
    branch: snapshot.branch ?? "สำนักงานใหญ่",
    address: snapshot.address ?? "",
    postal_code: snapshot.postal_code ?? "",
    contact_person: snapshot.contact_person ?? "",
    phone: snapshot.phone ?? "",
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const taxChanged = (snapshot.tax_id ?? "") !== f.tax_id;
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setError("ต้องระบุชื่อ"); return; }
    if (requireReason && !reason.trim()) { setError("ต้องระบุเหตุผลการแก้ไข"); return; }
    setBusy(true);
    setError("");
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: f, reason: reason || undefined }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else setError(json?.error ?? "บันทึกไม่สำเร็จ");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark min-h-[44px] focus:outline-none focus-visible:ring-2"
        aria-label="แก้หัวเอกสาร"
      >
        <Icon name="pencil" size={16} /> แก้หัวเอกสาร
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true" aria-label="แก้หัวเอกสาร">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="pencil" size={18} /> แก้หัวเอกสาร (ข้อมูลลูกค้า)
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
            className="press w-9 h-9 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          แก้ชื่อ/ที่อยู่/เลขผู้เสียภาษี เผื่อออกเอกสารในนามบริษัท · ไม่กระทบยอดเงิน
          {!requireReason && <> · <b>หัวเอกสารนี้จะไหลไปใบเสร็จที่ออกจากใบวางบิลนี้ด้วย</b> (ที่ยังไม่ยกเลิก) — ออกใบเสร็จใหม่ก็ใช้หัวนี้</>}
        </p>

        {/* บุคคล/นิติบุคคล */}
        <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm">
          {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setF({ ...f, kind: k })}
              className={`px-3 py-1.5 ${f.kind === k ? "bg-brand text-white" : "text-gray-600"}`}>
              {k === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
            </button>
          ))}
        </div>

        <HeaderField label={f.kind === "COMPANY" ? "ชื่อบริษัท" : "ชื่อลูกค้า"} value={f.name} onChange={set("name")} required />
        <HeaderField label="ชื่องาน / โปรเจกต์" value={f.job} onChange={set("job")} />
        <HeaderField label="เลขประจำตัวผู้เสียภาษี" value={f.tax_id} onChange={set("tax_id")} />

        {/* สำนักงานใหญ่/สาขา — เฉพาะนิติบุคคล */}
        {f.kind === "COMPANY" && (
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!f.branch.startsWith("สาขา")} onChange={() => setF({ ...f, branch: "สำนักงานใหญ่" })} /> สำนักงานใหญ่</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={f.branch.startsWith("สาขา")} onChange={() => setF({ ...f, branch: "สาขาที่ " })} /> สาขา</label>
            {f.branch.startsWith("สาขา") && (
              <input value={f.branch.replace(/\D/g, "")} onChange={(e) => setF({ ...f, branch: "สาขาที่ " + e.target.value.replace(/\D/g, "") })}
                placeholder="รหัสสาขา เช่น 00001"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand max-w-[160px]" />
            )}
          </div>
        )}

        <HeaderField label="ที่อยู่ (ออกบิล)" value={f.address} onChange={set("address")} />
        <div className="max-w-[180px]"><HeaderField label="รหัสไปรษณีย์" value={f.postal_code} onChange={(v) => set("postal_code")(v.replace(/\D/g, "").slice(0, 5))} /></div>
        <div className="grid grid-cols-2 gap-2">
          <HeaderField label="ผู้ติดต่อ" value={f.contact_person} onChange={set("contact_person")} />
          <HeaderField label="โทรศัพท์" value={f.phone} onChange={set("phone")} />
        </div>

        {requireReason && taxChanged && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ คุณกำลังแก้ <b>เลขผู้เสียภาษี</b> ของใบกำกับภาษี — หากใบนี้ส่งให้ลูกค้าไปแล้ว ตามหลักภาษีควร
            <b> ยกเลิกใบเดิมแล้วออกใหม่</b> แทนการแก้ย้อนหลัง
          </p>
        )}

        {requireReason && (
          <label className="block text-sm">
            <span className="text-xs font-medium text-gray-500">เหตุผลการแก้ไข <span className="text-red-600">*</span></span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="เช่น ลูกค้าขอออกในนามบริษัท XXX จำกัด"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand resize-none"
            />
          </label>
        )}

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}
            className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px] focus:outline-none focus-visible:ring-2">
            ยกเลิก
          </button>
          <button type="submit" disabled={busy || !f.name.trim()}
            className="press flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
