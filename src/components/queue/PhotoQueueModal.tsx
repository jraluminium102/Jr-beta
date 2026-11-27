"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import DateField from "@/components/ui/DateField";
import type { QueueEntry } from "@/lib/queue";
import {
  PHOTO_CREW_MAX, PHOTO_JOB_TYPE, photoCrew, photoCrewField, photoHistoryLabel, photoIsDone, photoDateShort,
  type PhotoHistoryItem,
} from "@/lib/photo-queue";

/**
 * ฟอร์มคิวถ่ายผลงาน (เจ้าของสั่ง 27 พ.ย.69) — ฟอร์มสั้น แยกจากฟอร์มคิวประเมิน
 *   มีแค่: วันที่ · เวลา · คนไปถ่าย 1–3 คน · ลูกค้า · เบอร์ · ที่อยู่ · ลิงก์แผนที่ · โน้ต
 *   ไม่มีเซลล์ ค่าประเมิน ช่องชำระ หรือช่องติ๊กใด ๆ · บันทึกลงตารางคิวเดิม (ดู src/lib/photo-queue.ts)
 *
 * รอบ 2 (27 พ.ย.69): "ถ่ายผลงานมักมาจากลูกค้าที่ทำงานกับเราเสร็จแล้ว — อยากได้เป็นประวัติว่าเคยถ่าย และดึงข้อมูลหน้างานได้ ไม่ต้องกรอกซ้ำ
 *   ลูกค้าไม่มีในระบบก็ให้กรอกแยกไปเลย ไม่ต้องสร้างในทะเบียน"
 *   · ลูกค้าในระบบ: ค้นงานเดิม → จิ้ม → เติมชื่อ/เบอร์/ที่อยู่/ลิงก์แผนที่ให้ + ผูกคิวกับงานนั้น (ประวัติ)
 *   · ลูกค้านอกระบบ: กรอกเองทั้งหมด ไม่ผูกอะไร ไม่สร้างลูกค้าในทะเบียน
 */

type JobHit = {
  id: string; job_code: string | null; customer_id?: number | null; customer_name: string;
  customer_tel: string | null; status: string; current_stage: number; customer_area: string | null;
};
type SiteInfo = { customer_name: string; tel: string | null; address: string | null; location_url: string | null };
type Link = { job_id: string; customer_id: number | null; job_code: string | null; customer_name: string };

type Form = {
  queue_date: string; queue_time: string; crew: string[];
  customer_name: string; tel: string; address: string; location_url: string; note_admin: string;
};

const toTimeInput = (t: string | null | undefined) => {
  const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};
const localToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
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
const seg = (on: boolean) => `px-3 py-1.5 text-sm ${on ? "bg-brand text-white" : "text-ink-2"}`;

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
  const today = useMemo(localToday, []);
  const [view, setView] = useState<"form" | "history">("form");
  const [f, setF] = useState<Form>(() => initForm(entry, presetDate));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lock = useRef(false);   // กันกดบันทึกซ้ำ (ดับเบิลคลิก = คิวซ้ำ 2 แถว)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const setCrew = (i: number, v: string) => setF((s) => ({ ...s, crew: s.crew.map((c, j) => (j === i ? v : c)) }));

  // ── ลูกค้าในระบบ / นอกระบบ ──
  //   คิวใหม่ตั้งต้น = ในระบบ (ส่วนมากเป็นลูกค้าที่ทำงานเสร็จแล้ว) · คิวเดิม = ตามที่บันทึกไว้
  const [mode, setMode] = useState<"system" | "outside">(() => (entry && !entry.target_job_id && entry.target_customer_id == null ? "outside" : "system"));
  const [link, setLink] = useState<Link | null>(() => (entry?.target_job_id
    ? { job_id: entry.target_job_id, customer_id: entry.target_customer_id ?? null, job_code: null, customer_name: entry.customer_name }
    : null));

  // ── ประวัติถ่ายผลงานทั้งหมด (โหลดครั้งเดียวตอนเปิด) — ใช้ทำป้าย "เคยถ่ายแล้ว" + หน้ารายการประวัติ ──
  const [hist, setHist] = useState<PhotoHistoryItem[]>([]);
  const [histErr, setHistErr] = useState("");
  const [histLoaded, setHistLoaded] = useState(false);
  useEffect(() => {
    let dead = false;
    api.get<PhotoHistoryItem[]>("/queue/photo-history")
      .then((r) => { if (!dead) { setHist(r.data ?? []); setHistErr(""); } })
      .catch((e) => { if (!dead) setHistErr(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ"); })
      .finally(() => { if (!dead) setHistLoaded(true); });
    return () => { dead = true; };
  }, []);
  // รหัสงานของคิวที่กำลังแก้ (รายการคิวไม่ได้พกรหัสงานมา) — ได้จากประวัติ
  const linkCode = link?.job_code ?? (entry ? hist.find((h) => h.id === entry.id)?.job_code ?? null : null);
  // ประวัติของงาน/ลูกค้า ไม่นับคิวที่กำลังแก้อยู่
  const others = useMemo(() => hist.filter((h) => !entry || h.id !== entry.id), [hist, entry]);
  const histOfJob = (jobId: string) => others.filter((h) => h.target_job_id === jobId);
  const histOfCustOtherJob = (cid: number | null | undefined, jobId: string) =>
    cid == null ? [] : others.filter((h) => h.target_customer_id === cid && h.target_job_id !== jobId);

  // ── ค้นงานเดิม (ชื่อลูกค้า / เบอร์) ──
  const [jq, setJq] = useState("");
  const [hits, setHits] = useState<JobHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");
  useEffect(() => {
    const q = jq.trim();
    if (readOnly || mode !== "system" || q.length < 2) { setHits([]); setSearched(""); return; }
    let dead = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get<JobHit[]>(`/jobs/search?q=${encodeURIComponent(q)}`);
        if (!dead) { setHits(r.data ?? []); setSearched(q); }
      } catch { if (!dead) { setHits([]); setSearched(q); } }
      finally { if (!dead) setSearching(false); }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [jq, mode, readOnly]);

  const [filling, setFilling] = useState(false);
  async function pickJob(j: JobHit) {
    setErr("");
    setLink({ job_id: j.id, customer_id: j.customer_id ?? null, job_code: j.job_code, customer_name: j.customer_name });
    setJq(""); setHits([]);
    // เติมจากงานก่อน (ชื่อ/เบอร์/พื้นที่) แล้วค่อยทับด้วยข้อมูลหน้างานเต็ม (ที่อยู่ + ลิงก์แผนที่จากคิวประเมินเดิม)
    setF((s) => ({ ...s, customer_name: j.customer_name, tel: j.customer_tel || "", address: j.customer_area || "", location_url: "" }));
    setFilling(true);
    try {
      const r = await api.get<SiteInfo>(`/jobs/${j.id}/site-info`);
      const si = r.data;
      setF((s) => ({
        ...s,
        customer_name: si.customer_name || s.customer_name,
        tel: si.tel || s.tel,
        address: si.address || s.address,
        location_url: si.location_url || s.location_url,
      }));
    } catch {
      setErr("ดึงข้อมูลหน้างานไม่ครบ — ตรวจที่อยู่/ลิงก์แผนที่แล้วเติมเองได้");
    } finally { setFilling(false); }
  }
  function switchMode(m: "system" | "outside") {
    if (m === mode) return;
    setMode(m); setErr("");
    if (m === "outside") { setLink(null); setJq(""); setHits([]); }   // นอกระบบ = ไม่ผูกงาน (ข้อมูลที่กรอกไว้ยังอยู่)
  }

  const crewPicked = f.crew.map((c) => c.trim()).filter(Boolean);
  const crewChoices = knownCrew.filter((n) => !crewPicked.includes(n));
  function addCrew(name: string) {
    const i = f.crew.findIndex((c) => !c.trim());
    if (i >= 0) setCrew(i, name);
  }

  async function save() {
    if (lock.current || readOnly || filling) return;
    setErr("");
    const crew = photoCrewField(f.crew);
    if (!f.queue_date) { setErr("เลือกวันที่ไปถ่ายก่อน"); return; }
    if (!crew) { setErr("ใส่ชื่อคนไปถ่ายอย่างน้อย 1 คน"); return; }
    if (mode === "system" && !link) { setErr("ค้นแล้วจิ้มเลือกงานของลูกค้าก่อน — ถ้าลูกค้าไม่มีในระบบ กด “ลูกค้านอกระบบ” แล้วกรอกเอง"); return; }
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
      // ผูกกับงาน/ลูกค้าในระบบ = ประวัติว่าเคยถ่ายงานนี้ · ลูกค้านอกระบบ = ว่างทั้งคู่ (ไม่สร้างลูกค้าในทะเบียน)
      target_job_id: mode === "system" && link ? link.job_id : null,
      target_customer_id: mode === "system" && link ? link.customer_id : null,
    };
    lock.current = true; setBusy(true);
    let done = false;
    try {
      // แก้คิวที่ระบบปิดเป็น "เสร็จ" ไปแล้ว (เลยวัน) แล้วเลื่อนไปวันข้างหน้า → เปิดคิวกลับ ไม่งั้นค้างเป็นเสร็จทั้งที่ยังไม่ได้ไป
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
    if (!window.confirm(`ลบคิวถ่ายผลงานของ ${entry.customer_name} ?\nลบแล้วเอากลับไม่ได้ และจะหายจากประวัติถ่ายผลงานด้วย`)) return;
    lock.current = true; setBusy(true);
    try {
      await api.del(`/queue/${entry.id}`);
      onSaved(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ ลองอีกครั้ง");
      lock.current = false; setBusy(false);
    }
  }

  // ── หน้ารายการประวัติ ──
  const [hq, setHq] = useState("");
  const histShown = useMemo(() => {
    const kw = hq.trim().toLowerCase();
    return hist.filter((h) => !kw || `${h.customer_name} ${h.job_code ?? ""} ${h.crew.join(" ")} ${h.address ?? ""} ${h.tel ?? ""}`.toLowerCase().includes(kw));
  }, [hist, hq]);

  const linkedPrev = link ? histOfJob(link.job_id) : [];

  // portal ไป body — ปุ่มเปิดอยู่ในแถบหัวที่ตรึงบน (มี backdrop-filter) ถ้าไม่ย้าย หน้าต่างจะโดนตัด
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-lg max-h-[94dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in" role="dialog" aria-modal="true" aria-label="คิวถ่ายผลงาน">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-brand-dark flex items-center gap-2"><Icon name="camera" size={17} /> {view === "history" ? "ประวัติถ่ายผลงาน" : editing ? "แก้คิวถ่ายผลงาน" : "เพิ่มคิวถ่ายผลงาน"}</h2>
            <p className="text-xs text-ink-3 mt-0.5">ไม่เกี่ยวกับใบเสนอราคาและเซลล์ · ไม่มีช่องให้ติ๊ก · เลยวันแล้วระบบปิดคิวให้เอง</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1"><Icon name="close" size={17} /></button>
        </div>

        <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 mb-4">
          <button type="button" onClick={() => setView("form")} className={seg(view === "form")}>{editing ? "แก้คิว" : "เพิ่มคิว"}</button>
          <button type="button" onClick={() => setView("history")} className={seg(view === "history")}>ประวัติที่เคยถ่าย{histLoaded && !histErr ? ` (${hist.length})` : ""}</button>
        </div>

        {view === "history" ? (
          <div>
            <input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="ค้นชื่อลูกค้า / รหัสงาน / คนไปถ่าย…" aria-label="ค้นประวัติ" className={`${inp} mb-3`} />
            {!histLoaded && <p className="text-center text-ink-3 py-8 text-sm">กำลังโหลด…</p>}
            {histLoaded && histErr && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">โหลดประวัติไม่สำเร็จ: {histErr}</p>}
            {histLoaded && !histErr && histShown.length === 0 && <p className="text-center text-ink-3 py-8 text-sm">{hist.length === 0 ? "ยังไม่มีประวัติถ่ายผลงาน" : "ไม่เจอตามคำค้น"}</p>}
            {histLoaded && !histErr && histShown.length > 0 && (
              <div className="rounded-xl border border-gray-200/80 bg-white divide-y divide-gray-100">
                {histShown.map((h) => {
                  const done = photoIsDone(h, today);
                  return (
                    <div key={h.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-ink">{h.customer_name}</span>
                        {h.job_code
                          ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 tabular-nums">{h.job_code}</span>
                          : <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-3">นอกระบบ</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${done ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>{done ? "ถ่ายแล้ว" : "นัดไว้"}</span>
                      </div>
                      <div className="text-xs text-ink-2 mt-0.5 tabular-nums">
                        {photoDateShort(h.queue_date)}{toTimeInput(h.queue_time) ? ` · ${toTimeInput(h.queue_time).replace(":", ".")} น.` : ""} · คนไปถ่าย {h.crew.length ? h.crew.join(", ") : "—"}
                      </div>
                      {h.address && <div className="text-xs text-ink-3 mt-0.5">{h.address}</div>}
                      {h.note_admin && <div className="text-xs text-ink-3 mt-0.5">โน้ต: {h.note_admin}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end mt-5">
              <button type="button" onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm font-semibold glass-soft text-ink-2">ปิด</button>
            </div>
          </div>
        ) : (
          <>
            <fieldset disabled={readOnly || busy} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs font-medium text-ink-3">วันที่ไปถ่าย *</span>
                  <DateField value={f.queue_date} onChange={(iso) => set("queue_date", iso)} className={`${inp} mt-1`} aria-label="วันที่ไปถ่าย" />
                </div>
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

              {/* ลูกค้า: ในระบบ (ค้นงานเดิม → เติมให้ + เก็บประวัติ) / นอกระบบ (กรอกเอง ไม่สร้างในทะเบียน) */}
              <div className="rounded-xl border border-brand/20 bg-brand/5 p-3 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-ink-2">ลูกค้า</span>
                  <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 bg-white">
                    <button type="button" onClick={() => switchMode("system")} aria-pressed={mode === "system"} className={seg(mode === "system")}>ลูกค้าในระบบ</button>
                    <button type="button" onClick={() => switchMode("outside")} aria-pressed={mode === "outside"} className={seg(mode === "outside")}>ลูกค้านอกระบบ</button>
                  </div>
                </div>

                {mode === "system" && link && (
                  <div className="rounded-lg bg-white border border-emerald-300 px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap">
                    <span className="min-w-0">
                      <span className="text-emerald-700 font-semibold">ผูกกับงาน </span>
                      <b className="tabular-nums">{linkCode ?? "ในระบบ"}</b> · {link.customer_name}
                      {filling && <span className="text-ink-3"> · กำลังดึงข้อมูลหน้างาน…</span>}
                    </span>
                    {!readOnly && (
                      <button type="button" onClick={() => setLink(null)} className="press shrink-0 text-xs font-semibold text-brand underline">เปลี่ยนงาน</button>
                    )}
                  </div>
                )}
                {mode === "system" && link && linkedPrev.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                    <b>งานนี้เคยมีคิวถ่ายแล้ว {linkedPrev.length} ครั้ง</b>
                    {linkedPrev.slice(0, 3).map((h) => <div key={h.id}>· {photoHistoryLabel(h, today)}</div>)}
                  </div>
                )}

                {mode === "system" && !link && !readOnly && (
                  <div>
                    <input value={jq} onChange={(e) => setJq(e.target.value)} placeholder="ค้นชื่อลูกค้า หรือเบอร์โทร แล้วจิ้มเลือกงาน" aria-label="ค้นงานของลูกค้า"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30" />
                    {searching && <p className="text-[11px] text-ink-3 mt-1">กำลังค้น…</p>}
                    {!searching && searched && hits.length === 0 && (
                      <p className="text-xs text-ink-3 mt-1.5">ไม่เจองานของ “{searched}” ในระบบ — ถ้าเป็นลูกค้าที่ไม่มีในระบบ กด “ลูกค้านอกระบบ” แล้วกรอกเอง</p>
                    )}
                    {hits.length > 0 && (
                      <div className="mt-1.5 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 max-h-56 overflow-y-auto">
                        {hits.map((j) => {
                          const prev = histOfJob(j.id);
                          const prevOther = prev.length ? [] : histOfCustOtherJob(j.customer_id, j.id);
                          return (
                            <button key={j.id} type="button" onClick={() => pickJob(j)} className="press w-full text-left px-3 py-2 hover:bg-brand/5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <b className="text-sm text-ink">{j.customer_name}</b>
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 tabular-nums">{j.job_code ?? "—"}</span>
                                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${j.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-ink-3"}`}>
                                  {j.status === "COMPLETED" ? "งานจบแล้ว" : `ขั้น ${j.current_stage}`}
                                </span>
                                {prev.length > 0 && <span className="rounded bg-amber-100 text-amber-900 px-1.5 py-0.5 text-[11px] font-semibold">{photoHistoryLabel(prev[0], today)}</span>}
                                {prevOther.length > 0 && <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.5 text-[11px] font-semibold">ลูกค้านี้เคยถ่ายงานอื่น</span>}
                              </div>
                              <div className="text-xs text-ink-3 mt-0.5">{[j.customer_tel, j.customer_area].filter(Boolean).join(" · ") || "ไม่มีเบอร์/พื้นที่ในงาน"}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {histLoaded && histErr && <p className="text-[11px] text-amber-700 mt-1">โหลดประวัติถ่ายผลงานไม่สำเร็จ — ป้าย “เคยถ่ายแล้ว” อาจไม่ขึ้น</p>}
                  </div>
                )}
                {mode === "outside" && (
                  <p className="text-[11px] text-ink-3">กรอกเองทั้งหมด · ไม่สร้างลูกค้าในทะเบียน · ยังขึ้นในประวัติถ่ายผลงาน (ป้าย “นอกระบบ”)</p>
                )}

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
                <label className="block">
                  <span className="text-xs font-medium text-ink-3">ที่อยู่</span>
                  <textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="บ้านเลขที่ หมู่บ้าน ซอย เขต" className={`${inp} mt-1 resize-none`} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-ink-3">ลิงก์แผนที่ (โลเคชั่น)</span>
                  <input value={f.location_url} onChange={(e) => set("location_url", e.target.value)} placeholder="วางลิงก์ Google Maps" className={`${inp} mt-1`} />
                </label>
              </div>

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
                  <button type="button" onClick={save} disabled={busy || filling}
                    className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                    {busy ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
