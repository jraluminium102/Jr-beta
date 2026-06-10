"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import {
  FEE_OPTIONS, JOB_SIZE_META, STATUS_META, STATUS_ORDER, parseLatLng,
  type QueueEntry, type QueueSales, type JobSize, type QueueStatus,
} from "@/lib/queue";

// ---- slot-conflict helpers --------------------------------------------------

type SlotConflict = {
  kind: "leave" | "full" | "warn";
  msg: string;
};

type AvailabilityRow = {
  sales_id: string;
  date: string;
  kind: string;
  half: string | null;
};

type ExistingSlot = {
  id: string;
  sales_id: string | null;
  queue_date: string | null;
  queue_time: string | null;
  status: string;
  customer_name: string;
};

type FormState = {
  status: QueueStatus;
  queue_date: string;
  queue_time: string;
  job_type: string;
  sales_id: string;
  assistant_id: string;
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
    assistant_id: e?.assistant_id ?? "",
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
  entry, salesList, onClose, onSaved, readOnly = false,
}: {
  entry?: QueueEntry | null;
  salesList: QueueSales[];
  onClose: () => void;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const editing = !!entry;
  const [f, setF] = useState<FormState>(() => initForm(entry));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const [resolved, setResolved] = useState<{ lat: number; lng: number } | null>(null);
  const [resolving, setResolving] = useState(false);
  // พิกัด: parse ตรงๆ (raw/ลิงก์เต็ม) ก่อน, ไม่ได้ค่อยใช้ที่ server แกะลิงก์ย่อมา
  const coords = parseLatLng(f.location_url) ?? resolved;
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState("");

  // แกะลิงก์แผนที่ผ่าน server (รองรับ maps.app.goo.gl) เมื่อ parse ตรงๆ ไม่ได้
  async function resolveLink() {
    const raw = f.location_url.trim();
    if (!raw || parseLatLng(raw)) { setResolved(null); return; }
    if (!/^https?:\/\//i.test(raw)) { setResolved(null); return; }
    setResolving(true);
    try {
      const r = await api.post<{ lat: number; lng: number }>("/queue/resolve-location", { url: raw });
      setResolved(r.data ?? null);
    } catch { setResolved(null); }
    finally { setResolving(false); }
  }

  // ---- slot-conflict check ----
  const [conflicts, setConflicts] = useState<SlotConflict[]>([]);
  const [checkingConflict, setCheckingConflict] = useState(false);
  // ref เก็บ AbortController ปัจจุบัน ยกเลิก request เก่าก่อนเริ่ม request ใหม่
  const conflictAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!f.queue_date || !f.queue_time || !f.sales_id) { setConflicts([]); return; }

    // ยกเลิก request เก่าถ้ายังค้างอยู่
    conflictAbortRef.current?.abort();
    const controller = new AbortController();
    conflictAbortRef.current = controller;

    setCheckingConflict(true);

    async function checkConflict() {
      try {
        // โหลด availability + existing entries ของวันนั้น (timeout 8 วินาที)
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const [availRes, entryRes] = await Promise.all([
          api.get<AvailabilityRow[]>(`/queue/availability?sales_id=${f.sales_id}`),
          api.get<ExistingSlot[]>(`/queue?month=${f.queue_date!.slice(0, 7)}&sales=${f.sales_id}`),
        ]);
        clearTimeout(timeoutId);

        if (controller.signal.aborted) return;

        const found: SlotConflict[] = [];
        const slot = f.queue_time.slice(0, 5);
        const date = f.queue_date;

        // ตรวจวันลา
        const av = (availRes.data ?? []).filter((a) => a.sales_id === f.sales_id && a.date === date);
        const isFullLeave = av.some((a) => a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY");
        const isAMLeave = av.some((a) => (a.kind === "LEAVE_HALF" && a.half === "AM") || a.kind === "OFFICE_HALF");
        const isPMLeave = av.some((a) => a.kind === "LEAVE_HALF" && a.half === "PM");

        if (isFullLeave) found.push({ kind: "leave", msg: "เซลล์ลา/วันหยุดทั้งวันในวันนี้" });
        else if (isAMLeave && slot === "10:00") found.push({ kind: "leave", msg: "เซลล์ลาช่วงเช้า — ไม่สามารถรับคิว 10:00" });
        else if (isPMLeave && slot === "14:00") found.push({ kind: "leave", msg: "เซลล์ลาช่วงบ่าย — ไม่สามารถรับคิว 14:00" });

        // ตรวจชนคิวเดิม
        const sameSlot = (entryRes.data ?? []).filter((e) =>
          e.sales_id === f.sales_id &&
          e.queue_date === date &&
          e.queue_time?.slice(0, 5) === slot &&
          e.status !== "CANCELLED" &&
          (!editing || e.id !== entry!.id)
        );
        if (sameSlot.length > 0) {
          found.push({ kind: "full", msg: `slot นี้มีคิวอยู่แล้ว: ${sameSlot.map((x) => x.customer_name).join(", ")}` });
        }

        // ตรวจ FULLDAY: ต้องการทั้ง 2 slot
        if (f.job_size === "FULLDAY") {
          const otherSlot = slot === "10:00" ? "14:00" : "10:00";
          const otherTaken = (entryRes.data ?? []).filter((e) =>
            e.sales_id === f.sales_id &&
            e.queue_date === date &&
            e.queue_time?.slice(0, 5) === otherSlot &&
            e.status !== "CANCELLED" &&
            (!editing || e.id !== entry!.id)
          );
          if (otherTaken.length > 0) {
            found.push({ kind: "warn", msg: `งานเต็มวัน — slot ${otherSlot} ถูกจองแล้ว` });
          }
        }

        // ตรวจเกิน 2 slot ต่อวัน
        const dayCount = (entryRes.data ?? []).filter((e) =>
          e.sales_id === f.sales_id &&
          e.queue_date === date &&
          e.status !== "CANCELLED" &&
          (!editing || e.id !== entry!.id)
        ).length;
        if (dayCount >= 2 && !sameSlot.length) {
          found.push({ kind: "warn", msg: "เซลล์มีคิวครบ 2 ช่องในวันนี้แล้ว" });
        }

        setConflicts(found);
      } catch {
        if (!controller.signal.aborted) setConflicts([]);
      } finally {
        if (!controller.signal.aborted) setCheckingConflict(false);
      }
    }

    checkConflict();
    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.queue_date, f.queue_time, f.sales_id, f.job_size]);

  // Separate main sales reps from assistants for dropdowns
  const mainSales = salesList.filter((s) => s.role !== "ASSISTANT");

  // ---- ข้อ 3: local mirror ของ assistants เพื่อให้เพิ่มใหม่แล้วเห็นใน dropdown ทันที ----
  const [localAssistants, setLocalAssistants] = useState<QueueSales[]>(() =>
    salesList.filter((s) => s.role === "ASSISTANT")
  );
  // sync เมื่อ salesList prop เปลี่ยน (เช่น parent reload)
  useEffect(() => {
    setLocalAssistants(salesList.filter((s) => s.role === "ASSISTANT"));
  }, [salesList]);

  // "เพิ่มผู้ช่วยเอง" inline form state
  const [addingAssistant, setAddingAssistant] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [addAssistBusy, setAddAssistBusy] = useState(false);
  const [addAssistErr, setAddAssistErr] = useState("");

  // ref สำหรับ AbortController ของ suggestAuto
  const suggestAbortRef = useRef<AbortController | null>(null);

  async function suggestAuto() {
    // ยกเลิก request เก่าถ้ายังค้างอยู่
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;

    setSuggesting(true); setSuggestMsg("");
    // timeout 10 วินาที
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await api.post<{
        queue_date: string; queue_time: string;
        sales_id: string; sales_name: string; reason: string;
      }>("/queue/suggest", {
        sales_id: f.sales_id || null,
        job_size: f.job_size || null,
        address: f.address || null,
        location_url: f.location_url || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      clearTimeout(timeoutId);
      if (controller.signal.aborted) return;
      setF((s) => ({
        ...s,
        queue_date: r.data.queue_date,
        queue_time: r.data.queue_time,
        sales_id: s.sales_id || r.data.sales_id,
      }));
      setSuggestMsg("✓ " + r.data.reason);
    } catch (e) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        setSuggestMsg("หมดเวลา — ลองใหม่อีกครั้ง");
      } else {
        setSuggestMsg(e instanceof Error ? e.message : "เสนอคิวไม่สำเร็จ");
      }
    } finally {
      if (!controller.signal.aborted) setSuggesting(false);
      else setSuggesting(false);
    }
  }

  // ---- ข้อ 3: Create a new ASSISTANT record in queue_sales ----
  async function addAssistant() {
    if (!newAssistantName.trim()) { setAddAssistErr("กรุณาระบุชื่อผู้ช่วย"); return; }

    // ตรวจชื่อซ้ำใน local list ก่อน — ถ้าซ้ำให้เลือกตัวเดิมแทนการสร้างซ้ำ
    const trimmedName = newAssistantName.trim();
    const existing = localAssistants.find(
      (a) => a.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      setF((s) => ({ ...s, assistant_id: existing.id }));
      setAddingAssistant(false);
      setNewAssistantName("");
      setAddAssistErr("");
      return;
    }

    setAddAssistBusy(true); setAddAssistErr("");
    try {
      const res = await api.post<{ id: string; name: string }>("/queue/sales", {
        name: trimmedName,
        code: trimmedName.toLowerCase().replace(/\s+/g, "_").slice(0, 20),
        team: "BKK",
        role: "ASSISTANT",
        active: true,
      });
      // เพิ่มเข้า local mirror ทันที และเลือกเป็นค่าที่เลือกอยู่
      const newRecord: QueueSales = {
        id: res.data.id,
        name: res.data.name,
        code: trimmedName.toLowerCase().replace(/\s+/g, "_").slice(0, 20),
        team: "BKK",
        role: "ASSISTANT",
        active: true,
        start_label: null,
        start_lat: null,
        start_lng: null,
        profile_id: null,
        parent_sales_id: null,
      };
      setLocalAssistants((prev) => [...prev, newRecord]);
      setF((s) => ({ ...s, assistant_id: res.data.id }));
      setAddingAssistant(false);
      setNewAssistantName("");
    } catch (e) {
      setAddAssistErr(e instanceof Error ? e.message : "เพิ่มผู้ช่วยไม่สำเร็จ");
    } finally {
      setAddAssistBusy(false);
    }
  }

  async function save() {
    if (!f.customer_name.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); return; }

    // ---- ข้อ 1: ตรวจ/ยืนยันก่อนเปลี่ยนสถานะเป็น DONE ----
    if (f.status === "DONE") {
      if (!f.queue_date) { setErr("กรุณาระบุวันที่นัดก่อนยืนยันประเมินเสร็จ"); return; }
      if (!f.sales_id) { setErr("กรุณาเลือกเซลล์ก่อนยืนยันประเมินเสร็จ"); return; }

      const confirmed = window.confirm(
        "ยืนยันว่าประเมินเสร็จ? ระบบจะสร้างลูกค้า + งานจริงทันที และย้อนกลับยาก"
      );
      if (!confirmed) return;

      // เตือนถ้าไม่มีเบอร์โทร
      const telRaw = f.tel.trim();
      if (!telRaw) {
        const telOk = window.confirm(
          "ยังไม่ได้ใส่เบอร์โทร ระบบจะถือเป็นลูกค้าใหม่เสมอ (เสี่ยงลูกค้าซ้ำ) — ยืนยัน?"
        );
        if (!telOk) return;
      }
    }

    // ---- ข้อ 2: ตรวจ conflict ร้าย (leave / full) ก่อน save ----
    const badConflicts = conflicts.filter((c) => c.kind === "leave" || c.kind === "full");
    if (badConflicts.length > 0) {
      const reason = badConflicts.map((c) => c.msg).join(" / ");
      const ok = window.confirm(`วันนี้ ${reason} — ยืนยันบันทึกทับ?`);
      if (!ok) return;
    }

    setBusy(true); setErr("");

    // ---- ข้อ 1: normalize เบอร์โทร (ตัดช่องว่าง/ขีด/วงเล็บ) ----
    const telNormalized = f.tel.replace(/[\s\-()]/g, "").trim() || null;

    const payload = {
      status: f.status,
      queue_date: f.queue_date || null,
      queue_time: f.queue_time || null,
      job_type: f.job_type || null,
      sales_id: f.sales_id || null,
      assistant_id: f.assistant_id || null,
      line_contact: f.line_contact || null,
      customer_name: f.customer_name.trim(),
      tel: telNormalized,
      address: f.address || null,
      location_url: f.location_url || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      job_size: f.job_size || null,
      job_count: f.job_count ? Number(f.job_count) : null,
      assess_fee: f.assess_fee && Number.isFinite(Number(f.assess_fee)) ? Number(f.assess_fee) : null,
      payment: f.payment || null,
      receipt_done: f.receipt_done,
      note_admin: f.note_admin || null,
    };
    try {
      if (editing) {
        const r = await api.patch<{ id: string }>(`/queue/${entry!.id}`, payload);
        if (payload.status === "DONE" && r.meta?.job_id) {
          alert(
            "✓ เข้าประเมินเสร็จ — บันทึกลูกค้าเข้าทะเบียน + สร้างงานในระบบให้แล้ว\nดูต่อได้ที่หน้า \"ติดตามงาน\" (ไม่ต้องกรอกซ้ำ)"
          );
        }
      } else {
        await api.post("/queue", payload);
      }
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
            <Icon name="calendar" size={18} />
            {readOnly ? "รายละเอียดคิว" : editing ? "แก้ไขคิว" : "เพิ่มคิวงาน"}
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* ---- ข้อ 4: grid-cols-1 sm:grid-cols-2 แทน grid-cols-2 hardcode ---- */}
        <fieldset disabled={readOnly} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-0 p-0 m-0 min-w-0">
          <Field label="ชื่อลูกค้า *" wide>
            <input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)}
              placeholder="คุณ…" className={inp} />
          </Field>

          {/* Main sales rep (role=MAIN only) */}
          <Field label="เซลล์">
            <select value={f.sales_id} onChange={(e) => set("sales_id", e.target.value)} className={inp}>
              <option value="">— ยังไม่ระบุ —</option>
              {mainSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.team === "PHUKET" ? "ภูเก็ต" : "กทม."})
                </option>
              ))}
            </select>
          </Field>

          {/* Assistant (role=ASSISTANT) — ใช้ localAssistants แทน prop โดยตรง */}
          <Field label="ผู้ช่วยเซลล์">
            {addingAssistant ? (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={newAssistantName}
                    onChange={(e) => setNewAssistantName(e.target.value)}
                    placeholder="ชื่อผู้ช่วย"
                    className={`${inp} flex-1`}
                  />
                  <button type="button" onClick={addAssistant} disabled={addAssistBusy}
                    className="press glass-soft rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-dark disabled:opacity-60">
                    {addAssistBusy ? "…" : "บันทึก"}
                  </button>
                  <button type="button" onClick={() => { setAddingAssistant(false); setNewAssistantName(""); setAddAssistErr(""); }}
                    className="press glass-soft rounded-lg px-2 text-xs text-ink-3">
                    <Icon name="close" size={13} />
                  </button>
                </div>
                {addAssistErr && <p className="text-[11px] text-red-600">{addAssistErr}</p>}
              </div>
            ) : (
              <div className="flex gap-1.5">
                <select value={f.assistant_id} onChange={(e) => set("assistant_id", e.target.value)}
                  className={`${inp} flex-1`}>
                  <option value="">— ไม่มีผู้ช่วย —</option>
                  {localAssistants.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {!readOnly && (
                  <button type="button" onClick={() => setAddingAssistant(true)}
                    className="press glass-soft rounded-lg px-2.5 text-xs text-ink-2 shrink-0"
                    title="เพิ่มผู้ช่วยเอง">
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </div>
            )}
          </Field>

          <Field label="ประเภทงาน">
            <select value={f.job_type} onChange={(e) => set("job_type", e.target.value)} className={inp}>
              <option value="">ประเมินหน้างาน</option>
              <option value="โชว์รูม">โชว์รูม</option>
            </select>
          </Field>

          {!readOnly && (
            <Field label="จัดวันอัตโนมัติ (เสนอวันว่างเร็วสุดตามกฎ)" wide>
              <button type="button" onClick={suggestAuto} disabled={suggesting}
                className="press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#1F4E78" }}>
                <Icon name="calendar" size={15} />
                {suggesting ? "กำลังหา…" : "เสนอวัน-เวลา-เซลล์ ที่ว่างเร็วสุด"}
              </button>
              {suggestMsg && <p className="text-[11px] mt-1.5 text-ink-2">{suggestMsg}</p>}
            </Field>
          )}

          <Field label="วันที่นัด">
            <input type="date" value={f.queue_date} onChange={(e) => set("queue_date", e.target.value)} className={inp} />
          </Field>
          <Field label="เวลา (slot)">
            <div className="flex gap-2">
              {(["", "10:00", "14:00"] as const).map((slot) => {
                const isActive = f.queue_time === slot;
                const label = slot === "" ? "— ยังไม่ระบุ" : slot === "10:00" ? "เช้า 10:00" : "บ่าย 14:00";
                return (
                  <button key={slot} type="button"
                    onClick={() => set("queue_time", slot)}
                    className={`press flex-1 rounded-lg px-2 py-2 text-sm font-semibold border transition-colors min-h-[44px]
                      ${isActive
                        ? slot === "10:00" ? "bg-sky-600 text-white border-sky-600"
                          : slot === "14:00" ? "bg-amber-500 text-white border-amber-500"
                          : "bg-gray-200 text-ink border-gray-300"
                        : "glass-soft text-ink-2 hover:bg-white/60"
                      }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* แสดงคำเตือน conflict */}
          {(conflicts.length > 0 || checkingConflict) && (
            <div className="col-span-1 sm:col-span-2">
              {checkingConflict ? (
                <p className="text-[11px] text-ink-3 flex items-center gap-1">
                  <Icon name="refresh" size={11} className="animate-spin" /> ตรวจสอบ slot…
                </p>
              ) : (
                <div className="space-y-1">
                  {conflicts.map((c, i) => (
                    <p key={i} role="alert"
                      className={`text-[12px] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5
                        ${c.kind === "leave" ? "bg-red-50 text-red-700" :
                          c.kind === "full" ? "bg-orange-50 text-orange-800" :
                          "bg-amber-50 text-amber-800"}`}>
                      <Icon name={c.kind === "leave" ? "warn" : "info"} size={13} />
                      {c.msg}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <Field label="LINE ติดต่อลูกค้า">
            <input value={f.line_contact} onChange={(e) => set("line_contact", e.target.value)} className={inp} />
          </Field>
          <Field label="เบอร์โทร">
            <input value={f.tel} onChange={(e) => set("tel", e.target.value)} className={inp} />
          </Field>

          <Field label="ที่อยู่" wide>
            <textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2}
              className={`${inp} resize-none`} />
          </Field>

          <Field label="โลเคชั่น (ลิงก์แผนที่ หรือพิกัด lat,lng)" wide>
            <input value={f.location_url} onChange={(e) => { set("location_url", e.target.value); setResolved(null); }}
              onBlur={resolveLink}
              placeholder="https://maps.app.goo.gl/… หรือ 13.6466, 100.4936" className={inp} />
            <span className="text-[11px] mt-1 block">
              {resolving ? (
                <span className="text-ink-3">⏳ กำลังอ่านพิกัดจากลิงก์…</span>
              ) : coords ? (
                <span className="text-emerald-700">
                  ✓ พิกัด {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}{resolved ? " (จากลิงก์)" : ""}
                </span>
              ) : f.location_url ? (
                <span className="text-amber-700">
                  อ่านพิกัดจากลิงก์ไม่ได้ — ลองวางลิงก์ Google Maps แบบเต็ม หรือพิมพ์ "lat, lng" ตรง ๆ
                </span>
              ) : (
                <span className="text-ink-3">ใส่พิกัดเพื่อใช้ตรวจกฎ R-45min อัตโนมัติ</span>
              )}
            </span>
          </Field>

          <Field label="ขนาดงาน">
            <select value={f.job_size} onChange={(e) => set("job_size", e.target.value as "" | JobSize)} className={inp}>
              <option value="">— เลือก —</option>
              {(Object.keys(JOB_SIZE_META) as JobSize[]).map((k) => (
                <option key={k} value={k}>{JOB_SIZE_META[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="จำนวนงาน/จุด">
            <input type="number" min={0} value={f.job_count}
              onChange={(e) => set("job_count", e.target.value)} className={inp} />
          </Field>

          <Field label="ค่าประเมิน">
            {f.feeCustom ? (
              <div className="flex gap-1.5">
                <input type="number" value={f.assess_fee}
                  onChange={(e) => set("assess_fee", e.target.value)} className={inp} />
                <button type="button" onClick={() => { set("feeCustom", false); set("assess_fee", ""); }}
                  className="press glass-soft rounded-lg px-2 text-xs text-ink-2">เลือก</button>
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
              <input type="checkbox" checked={f.receipt_done}
                onChange={(e) => set("receipt_done", e.target.checked)}
                className="w-4 h-4 accent-brand" />
              <span className="text-ink-2">ส่งใบเสร็จให้ลูกค้าแล้ว</span>
            </label>
          </Field>

          <Field label="หมายเหตุแอดมิน" wide>
            <input value={f.note_admin} onChange={(e) => set("note_admin", e.target.value)} className={inp} />
          </Field>
        </fieldset>

        {err && (
          <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>
        )}

        <div className="flex items-center gap-2 mt-5">
          {!readOnly && (
            <button onClick={save} disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
              <Icon name="check" size={16} /> {busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มคิว"}
            </button>
          )}
          <Badge tone={STATUS_META[f.status].tone}>{STATUS_META[f.status].th}</Badge>
          {!readOnly && editing && (
            <button onClick={remove} disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60">
              <Icon name="trash" size={16} /> ลบ
            </button>
          )}
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2 ml-auto">
            {readOnly ? "ปิด" : "ยกเลิก"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full glass-soft rounded-lg px-3 py-2 outline-none";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "col-span-1 sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
