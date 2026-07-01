"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { BillingProfiles } from "@/components/customers/BillingProfiles";
import type { Customer } from "@/lib/types";

// หน้างานของลูกค้า (จาก /api/jobs/search?customer_id=)
type CustJob = {
  id: string; job_code: string | null; customer_area: string | null;
  status: string; current_stage: number; design_state: string;
};

const EMPTY = { name: "", job: "", address: "", tax_id: "", line_id: "", phone: "", contact_person: "" };
// นามออกบิลเริ่มต้น (นามหลัก) — กรอกได้ตั้งแต่ตอนสร้างลูกค้าใหม่ (นิติบุคคล/สาขา/ที่อยู่จัดส่ง)
type BillingDraft = { kind: "INDIVIDUAL" | "COMPANY"; bill_name: string; branch: string; ship_address: string };
const EMPTY_BILLING: BillingDraft = { kind: "INDIVIDUAL", bill_name: "", branch: "สำนักงานใหญ่", ship_address: "" };

export default function CustomersClient({ initial, canWrite }: { initial: Customer[]; canWrite: boolean }) {
  const [list, setList] = useState<Customer[]>(initial);
  const [sel, setSel] = useState<Customer | null>(initial[0] ?? null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [billing, setBilling] = useState<BillingDraft>(EMPTY_BILLING);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // หน้างานของลูกค้าที่เลือก
  const [custJobs, setCustJobs] = useState<CustJob[]>([]);
  const [jobsBusy, setJobsBusy] = useState(false);

  useEffect(() => {
    if (!sel) { setCustJobs([]); return; }
    let cancelled = false;
    setJobsBusy(true);
    fetch(`/api/jobs/search?customer_id=${sel.id}`, { headers: { accept: "application/json" } })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setCustJobs((j.data ?? []) as CustJob[]); })
      .catch(() => { if (!cancelled) setCustJobs([]); })
      .finally(() => { if (!cancelled) setJobsBusy(false); });
    return () => { cancelled = true; };
  }, [sel]);

  const filtered = list.filter((c) =>
    [c.name, c.job, c.phone, c.line_id].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  function startAdd() { setForm(EMPTY); setBilling(EMPTY_BILLING); setEditId(null); setAdding(true); setSel(null); setErr(""); }
  function startEdit(c: Customer) {
    setForm({ name: c.name, job: c.job, address: c.address, tax_id: c.tax_id, line_id: c.line_id, phone: c.phone, contact_person: c.contact_person });
    setEditId(c.id); setAdding(true); setErr("");
  }
  function cancelForm() { setAdding(false); setEditId(null); setErr(""); }

  async function save() {
    if (!form.name.trim()) { setErr("ต้องระบุชื่อลูกค้า"); return; }
    setBusy(true); setErr("");
    const editing = editId != null;
    const res = await fetch(editing ? `/api/customers/${editId}` : "/api/customers", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    if (editing) {
      setList(list.map((c) => (c.id === editId ? json.data : c)));
      setSel(json.data);
    } else {
      // ลูกค้าใหม่ — trigger สร้าง "นามหลัก" ให้แล้ว · อัปเดตด้วยข้อมูลนิติบุคคล/สาขา/ที่อยู่จัดส่งที่กรอก
      const newC = json.data;
      await syncDefaultBilling(newC?.id);
      setList([newC, ...list]);
      setSel(newC);
    }
    setAdding(false); setEditId(null); setForm(EMPTY); setBilling(EMPTY_BILLING);
  }

  // อัปเดต "นามหลัก" ที่ trigger สร้างให้ตอนสร้างลูกค้าใหม่ ด้วยข้อมูลนิติบุคคล/สาขา/ที่อยู่จัดส่ง
  // เลขภาษี/ที่อยู่บิล/ผู้ติดต่อ/เบอร์ ใช้จากฟอร์มลูกค้าด้านบน
  async function syncDefaultBilling(customerId?: number) {
    if (!customerId) return;
    const bbody = {
      kind: billing.kind,
      bill_name: billing.bill_name.trim() || form.name.trim(),
      tax_id: form.tax_id,
      branch: billing.kind === "COMPANY" ? (billing.branch.trim() || "สำนักงานใหญ่") : "สำนักงานใหญ่",
      address: form.address,
      ship_address: billing.ship_address,
      contact_person: form.contact_person,
      phone: form.phone,
    };
    try {
      const r = await fetch(`/api/billing-profiles?customer_id=${customerId}`);
      const j = await r.json().catch(() => null);
      const rows = (j?.data ?? []) as { id: number; is_default: boolean }[];
      const def = rows.find((p) => p.is_default) ?? rows[0];
      if (def) {
        await fetch(`/api/billing-profiles/${def.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bbody),
        });
      } else {
        // เผื่อ trigger ยังไม่ถูกติดตั้ง — สร้างนามหลักเอง
        await fetch(`/api/billing-profiles`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...bbody, customer_id: customerId, is_default: true }),
        });
      }
    } catch { /* นามออกบิลแก้ทีหลังในรายละเอียดลูกค้าได้ */ }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="users" size={18} />
          </span>
          ทะเบียนลูกค้า
        </h1>
        {canWrite && (
          <button onClick={startAdd} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
            <Icon name="plus" size={16} /> เพิ่มลูกค้าใหม่
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1">
          <label className="relative block mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
            <input aria-label="ค้นหาลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / เบอร์ / Line"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
          </label>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((c) => (
              <button key={c.id} onClick={() => { setSel(c); setAdding(false); }} aria-current={sel?.id === c.id}
                className={`press w-full text-left rounded-xl px-3 py-2.5 ${sel?.id === c.id ? "text-white bg-brand shadow-brand" : "glass-soft hover:bg-white/70"}`}>
                <div className="font-semibold text-sm">{c.name}</div>
                <div className={`text-xs ${sel?.id === c.id ? "text-red-50" : "text-ink-3"}`}>{c.job || "—"}</div>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-ink-3 text-center py-4">ไม่พบลูกค้า</p>}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          {adding ? (
            <div>
              <h3 className="text-lg font-bold text-brand-dark mb-4">{editId != null ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้าใหม่"}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <FormField label="ชื่อลูกค้า/งาน *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} wide />
                <FormField label="ชื่องาน/โปรเจกต์" value={form.job} onChange={(v) => setForm({ ...form, job: v })} wide />
                <FormField label="ที่อยู่ออกบิล" value={form.address} onChange={(v) => setForm({ ...form, address: v })} wide />
                <FormField label="เลขผู้เสียภาษี" value={form.tax_id} onChange={(v) => setForm({ ...form, tax_id: v })} />
                <FormField label="ผู้ติดต่อ" value={form.contact_person} onChange={(v) => setForm({ ...form, contact_person: v })} />
                <FormField label="Line" value={form.line_id} onChange={(v) => setForm({ ...form, line_id: v })} />
                <FormField label="เบอร์โทร" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              </div>

              {/* นามออกบิล (นามหลัก) — กรอกได้ตั้งแต่สร้างลูกค้าใหม่ · เพิ่มนามอื่นภายหลังในรายละเอียดลูกค้า */}
              {editId == null && (
                <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-3.5 space-y-2.5">
                  <div className="text-sm font-semibold text-brand-dark flex items-center gap-1.5">
                    <Icon name="receipt" size={15} /> นามออกบิล (นามหลัก)
                  </div>
                  <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm">
                    {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
                      <button key={k} type="button" onClick={() => setBilling({ ...billing, kind: k })}
                        className={`px-3 py-1.5 ${billing.kind === k ? "bg-brand text-white" : "text-ink-2"}`}>
                        {k === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">ชื่อที่ออกบิล {billing.bill_name.trim() ? "" : "(เว้นว่าง = ใช้ชื่อลูกค้า)"}</span>
                    <input value={billing.bill_name} onChange={(e) => setBilling({ ...billing, bill_name: e.target.value })}
                      placeholder={billing.kind === "COMPANY" ? "ชื่อบริษัท" : "ชื่อ-สกุล"}
                      className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none text-sm" />
                  </label>
                  {billing.kind === "COMPANY" && (
                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      <label className="flex items-center gap-1.5"><input type="radio" checked={!billing.branch.startsWith("สาขา")} onChange={() => setBilling({ ...billing, branch: "สำนักงานใหญ่" })} /> สำนักงานใหญ่</label>
                      <label className="flex items-center gap-1.5"><input type="radio" checked={billing.branch.startsWith("สาขา")} onChange={() => setBilling({ ...billing, branch: "สาขาที่ " })} /> สาขา</label>
                      {billing.branch.startsWith("สาขา") && (
                        <input value={billing.branch.replace(/\D/g, "")} onChange={(e) => setBilling({ ...billing, branch: "สาขาที่ " + e.target.value.replace(/\D/g, "") })}
                          placeholder="รหัสสาขา เช่น 00001" className="glass-soft rounded-lg px-3 py-2 outline-none text-sm max-w-[170px]" />
                      )}
                    </div>
                  )}
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">ที่อยู่จัดส่ง/หน้างาน (ถ้าต่างจากที่อยู่บิล — ไม่บังคับ)</span>
                    <textarea value={billing.ship_address} onChange={(e) => setBilling({ ...billing, ship_address: e.target.value })} rows={2}
                      className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none text-sm resize-none" />
                  </label>
                  <p className="text-[11px] text-ink-3">เลขภาษี/ที่อยู่บิล/ผู้ติดต่อ ใช้จากช่องด้านบน · เพิ่มนามออกบิลอื่นได้ภายหลังในรายละเอียดลูกค้า</p>
                </div>
              )}

              {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={save} disabled={busy} className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                  {busy ? "กำลังบันทึก…" : "บันทึก"}
                </button>
                <button onClick={cancelForm} className="press glass-soft rounded-xl px-5 py-2.5 text-sm text-ink-2">ยกเลิก</button>
              </div>
            </div>
          ) : sel ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-brand-dark">{sel.name}</h3>
                  <p className="text-sm text-ink-3">{sel.job || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canWrite && (
                    <button onClick={() => startEdit(sel)} className="press inline-flex items-center gap-1.5 glass-soft rounded-lg px-3 py-1.5 text-sm text-brand-dark font-semibold">
                      <Icon name="file" size={14} /> แก้ไข
                    </button>
                  )}
                  <Badge tone="violet">ลูกค้า #{String(sel.id).padStart(4, "0")}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
                <Detail label="ที่อยู่ออกบิล" val={sel.address} wide />
                <Detail label="เลขผู้เสียภาษี" val={sel.tax_id} />
                <Detail label="ผู้ติดต่อ" val={sel.contact_person} />
                <Detail label="Line" val={sel.line_id} />
                <Detail label="เบอร์โทร" val={sel.phone} />
              </div>
              <div className="mt-5 glass-soft rounded-xl p-3.5 text-sm flex gap-2 text-ink-2">
                <span className="shrink-0 mt-0.5 text-sky-700"><Icon name="info" size={16} /></span>
                <span>เมื่อสร้างใบเสนอราคา ข้อมูลชุดนี้จะถูกคัดลอกไปฝัง (snapshot) ในเอกสาร — แก้ทะเบียนทีหลังไม่กระทบเอกสารเก่า</span>
              </div>

              {/* นามออกบิล — ออกเอกสารได้หลายนาม (บุคคล/บริษัท) */}
              <BillingProfiles customerId={sel.id} canWrite={canWrite} />

              {/* หน้างานของลูกค้า — เห็นว่ามีหลายหน้างานใต้ชื่อเดียว (ลูกค้าเก่า หน้างานใหม่) */}
              <div className="mt-5">
                <div className="text-sm font-semibold text-brand-dark mb-2 flex items-center gap-1.5">
                  <Icon name="building" size={15} /> หน้างานของลูกค้า ({custJobs.length})
                </div>
                {jobsBusy ? (
                  <p className="text-sm text-ink-3">กำลังโหลด…</p>
                ) : custJobs.length === 0 ? (
                  <p className="text-sm text-ink-3 glass-soft rounded-lg px-3 py-2">ยังไม่มีหน้างาน</p>
                ) : (
                  <div className="space-y-2">
                    {custJobs.map((j) => (
                      <a
                        key={j.id}
                        href={`/jobs?open=${j.id}`}
                        className="press flex items-center justify-between gap-2 glass-soft rounded-lg px-3 py-2.5 text-sm hover:bg-white/60"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-brand-dark tnum">{j.job_code || "—"}</div>
                          <div className="text-xs text-ink-3 truncate">{j.customer_area || "ไม่ระบุพื้นที่"}</div>
                        </div>
                        <Badge tone="sky">ขั้น {j.current_stage}</Badge>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-ink-3 text-center py-10">เลือกลูกค้าทางซ้าย หรือเพิ่มใหม่</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none" />
    </label>
  );
}

function Detail({ label, val, wide }: { label: string; val: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="glass-soft rounded-lg px-3 py-2 mt-1">{val || "—"}</div>
    </div>
  );
}
