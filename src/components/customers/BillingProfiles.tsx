"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";

export type BillingProfile = {
  id: number;
  kind: "INDIVIDUAL" | "COMPANY";
  bill_name: string;
  tax_id: string;
  branch: string;
  address: string;
  ship_address: string;
  contact_person: string;
  phone: string;
  is_default: boolean;
};

type FormState = Omit<BillingProfile, "id" | "is_default"> & { id?: number; is_default?: boolean };
const EMPTY: FormState = {
  kind: "INDIVIDUAL", bill_name: "", tax_id: "", branch: "สำนักงานใหญ่",
  address: "", ship_address: "", contact_person: "", phone: "",
};

// จัดการ "นามออกบิล" ของลูกค้า 1 คน → ออกเอกสารได้หลายนาม (บุคคล/บริษัท)
export function BillingProfiles({ customerId, canWrite }: { customerId: number; canWrite: boolean }) {
  const [rows, setRows] = useState<BillingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/billing-profiles?customer_id=${customerId}`);
      const j = await r.json().catch(() => null);
      setRows(j?.data ?? []);
    } finally { setLoading(false); }
  }, [customerId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form?.bill_name.trim()) { setErr("ใส่ชื่อที่ออกบิล"); return; }
    setBusy(true); setErr("");
    try {
      const editing = !!form.id;
      const r = await fetch(editing ? `/api/billing-profiles/${form.id}` : "/api/billing-profiles", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? form : { ...form, customer_id: customerId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setErr(j?.error ?? "บันทึกไม่สำเร็จ"); return; }
      setForm(null); load();
    } finally { setBusy(false); }
  }
  async function del(id: number) {
    if (!confirm("ลบนามออกบิลนี้?")) return;
    const r = await fetch(`/api/billing-profiles/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => null); alert(j?.error ?? "ลบไม่ได้"); return; }
    load();
  }
  async function setDefault(id: number) {
    const r = await fetch(`/api/billing-profiles/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    if (r.ok) load();
  }

  const inp = "w-full glass-soft rounded-lg px-3 py-2 text-sm outline-none";

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-brand-dark flex items-center gap-1.5">
          <Icon name="receipt" size={15} /> นามออกบิล ({rows.length})
        </div>
        {canWrite && !form && (
          <button onClick={() => { setForm({ ...EMPTY }); setErr(""); }}
            className="press inline-flex items-center gap-1 text-xs font-semibold text-brand-dark glass-soft rounded-lg px-2.5 py-1.5">
            <Icon name="plus" size={13} /> เพิ่มนาม
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-ink-3">กำลังโหลด…</p>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="glass-soft rounded-lg px-3 py-2.5 flex items-start gap-2.5">
              <Icon name={p.kind === "COMPANY" ? "building" : "user"} size={16} className="text-ink-3 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                  {p.bill_name}
                  {p.is_default && <span className="text-[10px] text-brand-dark bg-brand/10 rounded px-1.5 py-0.5">นามหลัก</span>}
                </div>
                <div className="text-xs text-ink-3 mt-0.5">
                  {p.kind === "COMPANY" ? "นิติบุคคล" : "บุคคลธรรมดา"}
                  {p.tax_id ? ` · เลขภาษี ${p.tax_id}` : " · ยังไม่ใส่เลขภาษี"}
                  {p.kind === "COMPANY" && p.branch ? ` · ${p.branch}` : ""}
                </div>
                {p.address && <div className="text-xs text-ink-3 mt-0.5 truncate">{p.address}</div>}
              </div>
              {canWrite && (
                <div className="flex items-center gap-1 shrink-0">
                  {!p.is_default && (
                    <button onClick={() => setDefault(p.id)} title="ตั้งเป็นนามหลัก"
                      className="press text-[11px] text-ink-3 hover:text-brand-dark px-1.5 py-1">ตั้งหลัก</button>
                  )}
                  <button onClick={() => { setForm({ ...p }); setErr(""); }} title="แก้ไข" className="press text-ink-3 hover:text-brand-dark p-1"><Icon name="pencil" size={14} /></button>
                  <button onClick={() => del(p.id)} title="ลบ" className="press text-ink-3 hover:text-red-600 p-1"><Icon name="trash" size={14} /></button>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-ink-3 glass-soft rounded-lg px-3 py-2">ยังไม่มีนามออกบิล</p>}
        </div>
      )}

      {form && (
        <div className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 space-y-2">
          <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm">
            {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
              <button key={k} onClick={() => setForm({ ...form, kind: k })}
                className={`px-3 py-1.5 ${form.kind === k ? "bg-brand text-white" : "text-ink-2"}`}>
                {k === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
              </button>
            ))}
          </div>
          <input value={form.bill_name} onChange={(e) => setForm({ ...form, bill_name: e.target.value })}
            placeholder={form.kind === "COMPANY" ? "ชื่อบริษัท" : "ชื่อ-สกุล"} className={inp} />
          <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
            placeholder={form.kind === "COMPANY" ? "เลขผู้เสียภาษี 13 หลัก" : "เลขบัตรประชาชน/ผู้เสียภาษี (ถ้ามี)"} className={inp} />
          {form.kind === "COMPANY" && (
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <label className="flex items-center gap-1.5"><input type="radio" checked={!form.branch.startsWith("สาขา")} onChange={() => setForm({ ...form, branch: "สำนักงานใหญ่" })} /> สำนักงานใหญ่</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={form.branch.startsWith("สาขา")} onChange={() => setForm({ ...form, branch: "สาขาที่ " })} /> สาขา</label>
              {form.branch.startsWith("สาขา") && (
                <input value={form.branch.replace(/\D/g, "")} onChange={(e) => setForm({ ...form, branch: "สาขาที่ " + e.target.value.replace(/\D/g, "") })}
                  placeholder="รหัสสาขา เช่น 00001" className={`${inp} max-w-[170px]`} />
              )}
            </div>
          )}
          <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2}
            placeholder="ที่อยู่ออกบิล (ตามภาษี — ขึ้นหัวเอกสาร)" className={`${inp} resize-none`} />
          <textarea value={form.ship_address} onChange={(e) => setForm({ ...form, ship_address: e.target.value })} rows={2}
            placeholder="ที่อยู่จัดส่ง/หน้างาน (ถ้าต่างจากที่อยู่บิล — ไม่บังคับ)" className={`${inp} resize-none`} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="ผู้ติดต่อ" className={inp} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="เบอร์โทร" className={inp} />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="press rounded-lg px-4 py-2 text-sm font-semibold text-white bg-brand disabled:opacity-60">
              {busy ? "กำลังบันทึก…" : "บันทึกนาม"}
            </button>
            <button onClick={() => setForm(null)} className="press glass-soft rounded-lg px-4 py-2 text-sm text-ink-2">ยกเลิก</button>
          </div>
        </div>
      )}
    </div>
  );
}
