"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import DateField from "@/components/ui/DateField";
import type { QueueEntry } from "@/lib/queue";
import { PHOTO_CREW_MAX, PHOTO_JOB_TYPE, photoCrew, photoCrewField } from "@/lib/photo-queue";

/**
 * ฟอร์มคิวถ่ายผลงาน (เจ้าของสั่ง 27 พ.ย.69) — ฟอร์มสั้น แยกจากฟอร์มคิวประเมิน
 *   มีแค่: วันที่ · เวลา · คนไปถ่าย 1–3 คน · ลูกค้า · เบอร์ · ที่อยู่ · ลิงก์แผนที่ · โน้ต
 *   ไม่มีเซลล์ ค่าประเมิน ช่องชำระ หรือช่องติ๊กใด ๆ · บันทึกลงตารางคิวเดิม (ดู src/lib/photo-queue.ts)
 */

type CustomerHit = { id: number; name: string; phone: string | null; line_id: string | null; address: string | null };

type Form = {
  queue_date: string; queue_time: string; crew: string[];
  customer_name: string; tel: string; address: string; location_url: string; note_admin: string;
};

const toTimeInput = (t: string | null | undefined) => {
  const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

function initForm(e: QueueEntry | null, presetDate?: string): Form {
  const crew = photoCrew(e);
  return {
    queue_date: e?.queue_date ?? presetDate ?? "",
    queue_time: toTimeInput(e?.queue_time),
    crew: Array.from({ length: PHOTO_CREW_MAX }, (_, i) => crew[i] ?? ""),
    customer_name: e?.customer_name ?? "",
    tel: e?.tel ?? "",
    address: e?.address ?? "",
    location_url: e?.location_url ?? "",
    note_admin: e?.note_admin ?? "",
  };
}

const inp = "w-full glass-soft rounded-lg px-3 py-2.5 outline-none text-sm";

export default function PhotoQueueModal({ entry, presetDate, knownCrew, readOnly, onClose, onSaved }: {
  entry: QueueEntry | null;
  presetDate?: string;
  /** ชื่อคนที่เคยไปถ่าย — ขึ้นเป็นตัวเลือกให้จิ้ม ไม่ต้องพิมพ์ซ้ำ */
  knownCrew: string[];
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (savedDate: string | null) => void;
}) {
  const editing = !!entry;
  const [f, setF] = useState<Form>(() => initForm(entry, presetDate));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lock = useRef(false);   // กันกดบันทึกซ้ำ (ดับเบิลคลิก = คิวซ้ำ 2 แถว)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const setCrew = (i: number, v: string) => setF((s) => ({ ...s, crew: s.crew.map((c, j) => (j === i ? v : c)) }));

  // ค้นลูกค้าเดิมจากชื่อที่พิมพ์ — จิ้มแล้วเติมชื่อ/เบอร์/ที่อยู่ให้ (ไม่บังคับ พิมพ์เองทั้งหมดก็ได้)
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [hitsFor, setHitsFor] = useState("");
  useEffect(() => {
    const q = f.customer_name.trim();
    if (readOnly || q.length < 2 || q === hitsFor) { if (q.length < 2) setHits([]); return; }
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.get<CustomerHit[]>(`/customers?q=${encodeURIComponent(q)}`);
        if (!dead) setHits((r.data ?? []).slice(0, 6));
      } catch { if (!dead) setHits([]); }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [f.customer_name, hitsFor, readOnly]);
  function pickCustomer(c: CustomerHit) {
    setF((s) => ({ ...s, customer_name: c.name, tel: c.phone || s.tel, address: c.address || s.address }));
    setHitsFor(c.name.trim());
    setHits([]);
  }

  const crewPicked = f.crew.map((c) => c.trim()).filter(Boolean);
  const crewChoices = knownCrew.filter((n) => !crewPicked.includes(n));
  function addCrew(name: string) {
    const i = f.crew.findIndex((c) => !c.trim());
    if (i >= 0) setCrew(i, name);
  }

  async function save() {
    if (lock.current || readOnly) return;
    setErr("");
    const crew = photoCrewField(f.crew);
    if (!f.queue_date) { setErr("เลือกวันที่ไปถ่ายก่อน"); return; }
    if (!crew) { setErr("ใส่ชื่อคนไปถ่ายอย่างน้อย 1 คน"); return; }
    if (!f.customer_name.trim()) { setErr("ใส่ชื่อลูกค้าก่อน"); return; }
    const payload = {
      job_type: PHOTO_JOB_TYPE,           // ห้ามว่าง — ว่าง = ระบบถือเป็นคิวประเมิน
      queue_date: f.queue_date,
      queue_time: f.queue_time || null,
      note_ai: crew,                      // รายชื่อคนไปถ่าย
      customer_name: f.customer_name.trim(),
      tel: f.tel.trim() || null,
      address: f.address.trim() || null,
      location_url: f.location_url.trim() || null,
      note_admin: f.note_admin.trim() || null,
    };
    lock.current = true; setBusy(true);
    let done = false;
    try {
      // แก้คิวที่ระบบปิดเป็น "เสร็จ" ไปแล้ว (เลยวัน) แล้วเลื่อนไปวันข้างหน้า → เปิดคิวกลับ ไม่งั้นค้างเป็นเสร็จทั้งที่ยังไม่ได้ไป
      const n = new Date();
      const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      const reopen = entry && entry.status === "DONE" && f.queue_date >= today && f.queue_date !== (entry.queue_date ?? "");
      if (entry) await api.patch(`/queue/${entry.id}`, reopen ? { ...payload, status: "CONFIRMED" } : payload);
      else await api.post("/queue", { ...payload, status: "CONFIRMED", sales_id: null, assess_fee: null });
      done = true;
      onSaved(f.queue_date || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      if (!done) { lock.current = false; setBusy(false); }
    }
  }

  async function remove() {
    if (!entry || lock.current || readOnly) return;
    if (!window.confirm(`ลบคิวถ่ายผลงานของ ${entry.customer_name} ?\nลบแล้วเอากลับไม่ได้`)) return;
    lock.current = true; setBusy(true);
    try {
      await api.del(`/queue/${entry.id}`);
      onSaved(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ ลองอีกครั้ง");
      lock.current = false; setBusy(false);
    }
  }

  // portal ไป body — ปุ่มเปิดอยู่ในแถบหัวที่ตรึงบน (มี backdrop-filter) ถ้าไม่ย้าย หน้าต่างจะโดนตัด
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-lg max-h-[94dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in" role="dialog" aria-modal="true" aria-label="คิวถ่ายผลงาน">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-brand-dark flex items-center gap-2"><Icon name="camera" size={17} /> {editing ? "แก้คิวถ่ายผลงาน" : "เพิ่มคิวถ่ายผลงาน"}</h2>
            <p className="text-xs text-ink-3 mt-0.5">ไม่เกี่ยวกับใบเสนอราคาและเซลล์ · ไม่มีช่องให้ติ๊ก · เลยวันแล้วระบบปิดคิวให้เอง</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1"><Icon name="close" size={17} /></button>
        </div>

        <fieldset disabled={readOnly || busy} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-3">วันที่ไปถ่าย *</span>
              <DateField value={f.queue_date} onChange={(iso) => set("queue_date", iso)} className={`${inp} mt-1`} aria-label="วันที่ไปถ่าย" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">เวลา</span>
              <input type="time" value={f.queue_time} onChange={(e) => set("queue_time", e.target.value)} className={`${inp} mt-1 tabular-nums`} />
            </label>
          </div>

          <div>
            <span className="text-xs font-medium text-ink-3">คนไปถ่าย * <span className="font-normal">(ใส่ได้ 1–{PHOTO_CREW_MAX} คน)</span></span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {f.crew.map((c, i) => (
                <input key={i} value={c} onChange={(e) => setCrew(i, e.target.value)} placeholder={`คนที่ ${i + 1}${i === 0 ? "" : " (ถ้ามี)"}`}
                  aria-label={`คนไปถ่าย คนที่ ${i + 1}`} className={inp} />
              ))}
            </div>
            {!readOnly && crewChoices.length > 0 && crewPicked.length < PHOTO_CREW_MAX && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-ink-3">จิ้มเลือก:</span>
                {crewChoices.slice(0, 10).map((n) => (
                  <button key={n} type="button" onClick={() => addCrew(n)}
                    className="press rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-ink-2">+ {n}</button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-3">ชื่อลูกค้า *</span>
              <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="เช่น คุณสมชาย" className={`${inp} mt-1`} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-3">เบอร์โทร</span>
              <input value={f.tel} onChange={(e) => set("tel", e.target.value)} placeholder="(ไม่บังคับ)" inputMode="tel" className={`${inp} mt-1 tabular-nums`} />
            </label>
          </div>
          {hits.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white/80 p-2">
              <div className="text-[11px] text-ink-3 mb-1">ลูกค้าในทะเบียน — จิ้มเพื่อเติมชื่อ เบอร์ ที่อยู่ให้ (ไม่จิ้มก็ได้)</div>
              <div className="flex flex-col gap-1">
                {hits.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                    className="press text-left rounded-lg px-2.5 py-1.5 text-xs hover:bg-brand/5">
                    <b className="text-ink">{c.name}</b>
                    {c.phone ? <span className="text-ink-2 tabular-nums"> · {c.phone}</span> : null}
                    {c.address ? <span className="text-ink-3"> · {c.address.slice(0, 60)}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-ink-3">ที่อยู่</span>
            <textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="บ้านเลขที่ หมู่บ้าน ซอย เขต" className={`${inp} mt-1 resize-none`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-3">ลิงก์แผนที่ (โลเคชั่น)</span>
            <input value={f.location_url} onChange={(e) => set("location_url", e.target.value)} placeholder="วางลิงก์ Google Maps" className={`${inp} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-3">โน้ต</span>
            <input value={f.note_admin} onChange={(e) => set("note_admin", e.target.value)} placeholder="เช่น ถ่ายห้องกระจกหลังบ้าน · โทรก่อนเข้า" className={`${inp} mt-1`} />
          </label>
        </fieldset>

        {err && <p className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</p>}

        <div className="flex items-center justify-between gap-2 mt-5">
          {editing && !readOnly ? (
            <button type="button" onClick={remove} disabled={busy}
              className="press rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-red-50 text-red-700 disabled:opacity-60">ลบคิวนี้</button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="press rounded-xl px-4 py-2.5 text-sm font-semibold glass-soft text-ink-2">{readOnly ? "ปิด" : "ยกเลิก"}</button>
            {!readOnly && (
              <button type="button" onClick={save} disabled={busy}
                className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
