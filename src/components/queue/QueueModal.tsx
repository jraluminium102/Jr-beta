"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import {
  FEE_OPTIONS, JOB_SIZE_META, STATUS_META, STATUS_ORDER, parseLatLng,
  type QueueEntry, type QueueSales, type JobSize, type QueueStatus,
} from "@/lib/queue";

type FormState = {
  status: QueueStatus;
  queue_date: string;
  queue_time: string;
  job_type: string;
  sales_id: string;
  line_contact: string;
  customer_name: string;
  tel: string;
  address: string;
  location_url: string;
  job_size: "" | JobSize;
  job_count: string;
  assess_fee: string;
  feeCustom: boolean;
  payment: string;
  receipt_done: boolean;
  note_admin: string;
};

function initForm(e?: QueueEntry | null): FormState {
  const fee = e?.assess_fee ?? null;
  return {
    status: e?.status ?? "PENDING",
    queue_date: e?.queue_date ?? "",
    queue_time: e?.queue_time ?? "",
    job_type: e?.job_type ?? "",
    sales_id: e?.sales_id ?? "",
    line_contact: e?.line_contact ?? "",
    customer_name: e?.customer_name ?? "",
    tel: e?.tel ?? "",
    address: e?.address ?? "",
    location_url: e?.location_url ?? "",
    job_size: (e?.job_size ?? "") as "" | JobSize,
    job_count: e?.job_count != null ? String(e.job_count) : "",
    assess_fee: fee != null ? String(fee) : "",
    feeCustom: fee != null && !FEE_OPTIONS.includes(fee),
    payment: e?.payment ?? "",
    receipt_done: e?.receipt_done ?? false,
    note_admin: e?.note_admin ?? "",
  };
}

export function QueueModal({
  entry, salesList, onClose, onSaved,
}: {
  entry?: QueueEntry | null;
  salesList: QueueSales[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!entry;
  const [f, setF] = useState<FormState>(() => initForm(entry));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const coords = parseLatLng(f.location_url);

  async function save() {
    if (!f.customer_name.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); return; }
    setBusy(true); setErr("");
    const payload = {
      status: f.status,
      queue_date: f.queue_date || null,
      queue_time: f.queue_time || null,
      job_type: f.job_type || null,
      sales_id: f.sales_id || null,
      line_contact: f.line_contact || null,
      customer_name: f.customer_name.trim(),
      tel: f.tel || null,
      address: f.address || null,
      location_url: f.location_url || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      job_size: f.job_size || null,
      job_count: f.job_count ? Number(f.job_count) : null,
      assess_fee: f.assess_fee ? Number(f.assess_fee) : null,
      payment: f.payment || null,
      receipt_done: f.receipt_done,
      note_admin: f.note_admin || null,
    };
    try {
      if (editing) await api.patch(`/queue/${entry!.id}`, payload);
      else await api.post("/queue", payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !confirm(`ลบคิวของ "${entry.customer_name}" ?`)) return;
    setBusy(true); setErr("");
    try {
      await api.del(`/queue/${entry.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={18} /> {editing ? "แก้ไขคิว" : "เพิ่มคิวงาน"}
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1">
            <Icon name="logout" size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="ชื่อลูกค้า *" wide>
            <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="คุณ…" className={inp} />
          </Field>

          <Field label="เซลล์">
            <select value={f.sales_id} onChange={(e) => set("sales_id", e.target.value)} className={inp}>
              <option value="">— ยังไม่ระบุ —</option>
              {salesList.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.team === "PHUKET" ? "ภูเก็ต" : "กทม."})</option>)}
            </select>
          </Field>
          <Field label="ประเภทงาน">
            <select value={f.job_type} onChange={(e) => set("job_type", e.target.value)} className={inp}>
              <option value="">ประเมินหน้างาน</option>
              <option value="โชว์รูม">โชว์รูม</option>
            </select>
          </Field>

          <Field label="วันที่นัด">
            <input type="date" value={f.queue_date} onChange={(e) => set("queue_date", e.target.value)} className={inp} />
          </Field>
          <Field label="เวลา">
            <input type="time" value={f.queue_time} onChange={(e) => set("queue_time", e.target.value)} className={inp} />
          </Field>

          <Field label="LINE ติดต่อลูกค้า">
            <input value={f.line_contact} onChange={(e) => set("line_contact", e.target.value)} className={inp} />
          </Field>
          <Field label="เบอร์โทร">
            <input value={f.tel} onChange={(e) => set("tel", e.target.value)} className={inp} />
          </Field>

          <Field label="ที่อยู่" wide>
            <textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2} className={`${inp} resize-none`} />
          </Field>

          <Field label="โลเคชั่น (ลิงก์แผนที่ หรือพิกัด lat,lng)" wide>
            <input value={f.location_url} onChange={(e) => set("location_url", e.target.value)} placeholder="https://maps.app.goo.gl/… หรือ 13.6466, 100.4936" className={inp} />
            <span className="text-[11px] mt-1 block">
              {coords
                ? <span className="text-emerald-700">✓ พิกัด {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                : f.location_url
                  ? <span className="text-amber-700">ดึงพิกัดไม่ได้ (ลิงก์ย่อ) — วาง “lat, lng” ตรง ๆ เพื่อให้คำนวณระยะได้ในเฟส 2</span>
                  : <span className="text-ink-3">ใส่พิกัดเพื่อใช้จัดคิวอัตโนมัติ (เฟส 2)</span>}
            </span>
          </Field>

          <Field label="ขนาดงาน">
            <select value={f.job_size} onChange={(e) => set("job_size", e.target.value as "" | JobSize)} className={inp}>
              <option value="">— เลือก —</option>
              {(Object.keys(JOB_SIZE_META) as JobSize[]).map((k) => <option key={k} value={k}>{JOB_SIZE_META[k]}</option>)}
            </select>
          </Field>
          <Field label="จำนวนงาน/จุด">
            <input type="number" min={0} value={f.job_count} onChange={(e) => set("job_count", e.target.value)} className={inp} />
          </Field>

          <Field label="ค่าประเมิน">
            {f.feeCustom ? (
              <div className="flex gap-1.5">
                <input type="number" value={f.assess_fee} onChange={(e) => set("assess_fee", e.target.value)} className={inp} />
                <button type="button" onClick={() => { set("feeCustom", false); set("assess_fee", ""); }} className="press glass-soft rounded-lg px-2 text-xs text-ink-2">เลือก</button>
              </div>
            ) : (
              <select value={f.assess_fee} onChange={(e) => {
                if (e.target.value === "__custom") { set("feeCustom", true); set("assess_fee", ""); }
                else set("assess_fee", e.target.value);
              }} className={inp}>
                <option value="">— เลือก —</option>
                {FEE_OPTIONS.map((v) => <option key={v} value={v}>{v.toLocaleString()}</option>)}
                <option value="__custom">พิมพ์เอง…</option>
              </select>
            )}
          </Field>
          <Field label="การชำระ">
            <input value={f.payment} onChange={(e) => set("payment", e.target.value)} className={inp} />
          </Field>

          <Field label="สถานะ">
            <select value={f.status} onChange={(e) => set("status", e.target.value as QueueStatus)} className={inp}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].th}</option>)}
            </select>
          </Field>
          <Field label="ใบเสร็จ">
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
              <input type="checkbox" checked={f.receipt_done} onChange={(e) => set("receipt_done", e.target.checked)} className="w-4 h-4 accent-[#B3151D]" />
              <span className="text-ink-2">ส่งใบเสร็จให้ลูกค้าแล้ว</span>
            </label>
          </Field>

          <Field label="หมายเหตุแอดมิน" wide>
            <input value={f.note_admin} onChange={(e) => set("note_admin", e.target.value)} className={inp} />
          </Field>
        </div>

        {err && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex items-center gap-2 mt-5">
          <button onClick={save} disabled={busy}
            className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
            <Icon name="check" size={16} /> {busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มคิว"}
          </button>
          <Badge tone={STATUS_META[f.status].tone}>{STATUS_META[f.status].th}</Badge>
          {editing && (
            <button onClick={remove} disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60">
              <Icon name="trash" size={16} /> ลบ
            </button>
          )}
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2 ml-auto">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full glass-soft rounded-lg px-3 py-2 outline-none";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
