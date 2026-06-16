"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip } from "@/components/ui/primitives";
import { X, Check, TriangleAlert, ChevronRight, Package, ExternalLink, PackageCheck } from "@/components/ui/icons";
import type { ProdStatus } from "@/lib/database.types";

export type BoqSummary = {
  id: number;
  status: "draft" | "confirmed" | "ordered";
  item_count: number;
};

export type ProdRow = {
  id: string; job_id: string; status: ProdStatus;
  measure_scheduled: string | null; measure_actual: string | null; planned_install_date: string | null;
  measure_time: string | null; measurer_id: string | null; measurer_name: string | null;
  production_queued: string | null; production_done: string | null;
  qc_result: "PASSED" | "FAILED" | null; qc_date: string | null; qc_note: string | null;
  producer_note?: string | null;
  job: { job_code: string; customer_name: string; customer_area: string | null; deposit_date: string | null } | null;
  boq_summary: BoqSummary | null;
};

type StepField = { field: string; label: string; type?: "date" | "note"; optional?: boolean };
type Tone = "go" | "warn" | "wait";
type Action = {
  to: ProdStatus;
  label: string;
  hint?: string;
  tone: Tone;
  qc?: "PASSED" | "FAILED";
  fields?: StepField[];
};

// ── State machine งานผลิต (มีทางแยก ไม่ใช่เส้นตรง) ─────────────────────
// แต่ละสถานะ → action ที่ทำได้ (ปุ่มเลือกเส้นทาง)
// หมายเหตุ: ตัดขั้น "รอลงผลิต" (QUEUED) ออก — ใส่วันผลิตแล้วเข้า "กำลังผลิต" เลย
// วันติดตั้งที่กำหนด (planned_install_date) ย้ายไปเป็นช่องแก้ได้ตลอด (ดูใน modal) ตั้งแต่ขั้นแรก
const TRANSITIONS: Record<ProdStatus, Action[]> = {
  // รอวัด: นัดวัดล่วงหน้าได้ (อาจเป็นเดือน) — บันทึกนัดวัดแยกด้านบน, ปุ่มนี้คือ "วัดเสร็จแล้ว"
  PENDING_MEASURE: [
    { to: "PENDING_MEETING", label: "วัดหน้างานเสร็จ → เข้าขั้นประชุมแบบ", tone: "go",
      fields: [{ field: "measure_actual", label: "วันที่วัดจริง" }] },
  ],
  MEASURED: [
    { to: "PENDING_MEETING", label: "เข้าสู่ขั้นประชุมสรุปแบบ", tone: "go" },
  ],
  // หลังประชุม → เลือกได้ 3 ทาง (ลงวันผลิต = เข้าผลิตเลย)
  PENDING_MEETING: [
    { to: "MANUFACTURING", label: "แบบโอเค → เริ่มผลิต (ลงวันผลิต)", hint: "ใส่วันผลิตแล้วเข้าขั้นผลิตเลย", tone: "go",
      fields: [{ field: "production_queued", label: "วันเริ่มผลิต (กำหนด)" }] },
    { to: "PENDING_CONFIRM", label: "รอลูกค้าคอนเฟิร์มแบบก่อน", tone: "wait" },
    { to: "REVISING", label: "ต้องแก้แบบ → ส่งกลับทีมเขียนแบบ", hint: "งานจะเด้งไปหน้าเขียนแบบ (สถานะ: แก้แบบ)", tone: "warn" },
  ],
  // แก้แบบหลังวัด
  REVISING: [
    { to: "PENDING_CONFIRM", label: "แก้แบบเสร็จ → รอลูกค้าคอนเฟิร์ม", tone: "go" },
    { to: "MANUFACTURING", label: "แก้เสร็จ + ลูกค้าโอเค → เริ่มผลิต (ลงวันผลิต)", tone: "go",
      fields: [{ field: "production_queued", label: "วันเริ่มผลิต (กำหนด)" }] },
  ],
  // รอลูกค้าคอนเฟิร์ม
  PENDING_CONFIRM: [
    { to: "MANUFACTURING", label: "ลูกค้าคอนเฟิร์มแล้ว → เริ่มผลิต (ลงวันผลิต)", tone: "go",
      fields: [{ field: "production_queued", label: "วันเริ่มผลิต (กำหนด)" }] },
    { to: "REVISING", label: "ลูกค้าขอแก้แบบอีก → ส่งกลับเขียนแบบ", tone: "warn" },
  ],
  // QUEUED: คงไว้สำหรับงานเก่าที่ยังค้างสถานะนี้ — กดเข้าผลิตได้
  QUEUED: [
    { to: "MANUFACTURING", label: "เริ่มลงมือผลิตแล้ว", tone: "go" },
  ],
  MANUFACTURING: [
    { to: "QC", label: "ผลิตเสร็จ → ส่งตรวจ QC", tone: "go",
      fields: [{ field: "production_done", label: "วันผลิตเสร็จ" }] },
  ],
  QC: [
    { to: "READY", label: "QC ผ่าน → พร้อมติดตั้ง", tone: "go", qc: "PASSED",
      fields: [
        { field: "qc_date", label: "วันตรวจ QC" },
        { field: "qc_note", label: "หมายเหตุ QC (ไม่บังคับ)", type: "note", optional: true },
      ] },
    { to: "MANUFACTURING", label: "QC ไม่ผ่าน → กลับไปแก้/ผลิตใหม่", tone: "warn", qc: "FAILED",
      fields: [{ field: "qc_note", label: "ระบุสิ่งที่ไม่ผ่าน", type: "note" }] },
  ],
  READY: [],
  // กู้คืนจากปัญหา
  ISSUE: [
    { to: "MANUFACTURING", label: "เคลียร์ปัญหาแล้ว → กลับไปผลิต", tone: "go" },
    { to: "PENDING_MEASURE", label: "ต้องวัด/ประชุมใหม่ → กลับไปรอวัด", tone: "wait" },
  ],
};

const today = () => new Date().toISOString().slice(0, 10);

/** แปลง "9.30"→"09:30", "10.00"→"10:00", "09:30"→"09:30"  กัน import จุดทำ input ว่าง */
function normalizeTime(t: string | null | undefined): string {
  if (!t) return "";
  const s = t.trim().replace(".", ":");
  const [h, m] = s.split(":");
  if (!h) return "";
  const hh = h.padStart(2, "0");
  const mm = (m ?? "00").padStart(2, "0");
  return `${hh}:${mm}`;
}

const TONE_BTN: Record<Tone, string> = {
  go:   "bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-white",
  warn: "bg-amber-500 hover:bg-amber-400 border-amber-400 text-white",
  wait: "glass-card border-white/15 text-white hover:border-sky-300/50",
};

const BOQ_STATUS_LABEL: Record<"draft" | "confirmed" | "ordered", string> = {
  draft: "ร่าง",
  confirmed: "ยืนยันแล้ว",
  ordered: "สั่งของแล้ว",
};

// ── Summary chips (อ่านจาก row ทำให้เห็นค่าสดหลัง in-place save) ─────────
function SummaryChips({ row }: { row: ProdRow }) {
  const chips: { label: string; value: string; cls: string }[] = [];
  if (row.measure_scheduled) chips.push({
    label: "นัดวัด",
    value: thDate(row.measure_scheduled) + (row.measure_time ? ` ${normalizeTime(row.measure_time).slice(0, 5)}` : ""),
    cls: "bg-sky-500/20 border-sky-300/25 text-sky-100",
  });
  if (row.planned_install_date) chips.push({
    label: "ติดตั้ง",
    value: thDate(row.planned_install_date),
    cls: "bg-emerald-500/20 border-emerald-300/25 text-emerald-100",
  });
  if (row.production_queued) chips.push({
    label: "เริ่มผลิต",
    value: thDate(row.production_queued),
    cls: "bg-orange-500/20 border-orange-300/25 text-orange-100",
  });
  if (row.qc_result) chips.push({
    label: "QC",
    value: row.qc_result === "PASSED" ? "ผ่าน" : "ไม่ผ่าน",
    cls: row.qc_result === "PASSED" ? "bg-emerald-500/20 border-emerald-300/25 text-emerald-200" : "bg-rose-500/20 border-rose-300/25 text-rose-200",
  });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {chips.map((c) => (
        <span key={c.label} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border font-medium tnum ${c.cls}`}>
          <span className="font-normal opacity-75">{c.label}:</span> {c.value}
        </span>
      ))}
    </div>
  );
}

export function ProductionStepModal({
  prod,
  canWrite,
  onClose,
  onSavedInPlace,
  onSavedAndClose,
  /** @deprecated ใช้ onSavedInPlace + onSavedAndClose แทน — คงไว้ backward-compat */
  onSaved,
}: {
  prod: ProdRow;
  canWrite: boolean;
  onClose: () => void;
  onSavedInPlace?: () => void;
  onSavedAndClose?: () => void;
  /** @deprecated */
  onSaved?: () => void;
}) {
  // row ที่ใช้แสดงใน summary/ประวัติ — อัปเดตสดหลัง in-place save
  const [row, setRow] = useState<ProdRow>(prod);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null); // feedback flash
  const [problemOpen, setProblemOpen] = useState(false);
  const [problem, setProblem] = useState("");
  // BOQ
  const [boqSaving, setBoqSaving] = useState(false);
  const [boqErr, setBoqErr] = useState<string | null>(null);
  const [boqStatus, setBoqStatus] = useState(prod.boq_summary?.status ?? null);
  // confirm "เริ่มผลิต" เมื่อ BOQ ยังไม่ ordered
  const [mfgConfirmPending, setMfgConfirmPending] = useState<Action | null>(null);

  // นัดวัด (เฉพาะตอน PENDING_MEASURE) — บันทึกได้โดยไม่เลื่อนสถานะ
  const [sched, setSched] = useState(prod.measure_scheduled ?? today());
  const [schedTime, setSchedTime] = useState(normalizeTime(prod.measure_time));
  const [measurerName, setMeasurerName] = useState(prod.measurer_name ?? "");
  // วันติดตั้งที่กำหนด — กรอก/แก้ได้ทุกขั้น
  const [installDate, setInstallDate] = useState(prod.planned_install_date ?? "");

  // action ที่ "กางฟอร์ม" อยู่ (null = ยังไม่เลือก)
  const [armed, setArmed] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  // collapsible ประวัติ
  const [histOpen, setHistOpen] = useState(false);

  const actions = TRANSITIONS[prod.status] ?? [];

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ล็อก body scroll ขณะโมดอลเปิด
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // dirty detection — ฟิลด์ที่พิมพ์แล้วยังไม่ได้บันทึก
  const dirtyFields: string[] = [];
  if (sched !== (row.measure_scheduled ?? today()) && prod.status === "PENDING_MEASURE") dirtyFields.push("วันนัดวัด");
  if (schedTime !== normalizeTime(row.measure_time) && prod.status === "PENDING_MEASURE") dirtyFields.push("เวลานัดวัด");
  if (measurerName !== (row.measurer_name ?? "") && prod.status === "PENDING_MEASURE") dirtyFields.push("ช่างที่วัด");
  if (installDate !== (row.planned_install_date ?? "")) dirtyFields.push("วันติดตั้ง");

  const flashFeedback = (key: string) => {
    setSavedField(key);
    setTimeout(() => setSavedField(null), 1500);
  };

  // patch helper: close=false → in-place (อัปเดต row + flash), close=true → close modal
  const patch = async (body: Record<string, unknown>, opts: { close?: boolean; feedbackKey?: string } = {}) => {
    const { close = true, feedbackKey } = opts;
    setErr(null); setSaving(true);
    try {
      await api.patch(`/production/${prod.id}`, body);
      if (close) {
        // ปิดโมดอล
        if (onSavedAndClose) onSavedAndClose();
        else if (onSaved) onSaved();
        else onClose();
      } else {
        // อัปเดต row ใน state (merge)
        setRow((prev) => ({ ...prev, ...body } as ProdRow));
        if (feedbackKey) flashFeedback(feedbackKey);
        if (onSavedInPlace) onSavedInPlace();
        else if (onSaved) onSaved();
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const markOrdered = async () => {
    if (!prod.boq_summary) return;
    setBoqErr(null); setBoqSaving(true);
    try {
      await api.patch(`/boq/${prod.boq_summary.id}`, { status: "ordered" });
      setBoqStatus("ordered");
      flashFeedback("boq");
    } catch (e) {
      setBoqErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBoqSaving(false);
    }
  };

  // ตรวจว่าจะเข้า MANUFACTURING ไหม — ถ้า BOQ ยังไม่ ordered → ขอ confirm ก่อน
  const needsMfgConfirm = (a: Action): boolean =>
    a.to === "MANUFACTURING" && boqStatus !== "ordered";

  // คลิก action: ถ้าไม่มีฟอร์ม → ทำเลย, ถ้ามีฟอร์ม → กางฟอร์ม (กรอกแล้วกดยืนยัน)
  const clickAction = (a: Action) => {
    if (needsMfgConfirm(a)) { setMfgConfirmPending(a); return; }
    if (!a.fields || a.fields.length === 0) {
      const body: Record<string, unknown> = { status: a.to };
      if (a.qc) body.qc_result = a.qc;
      patch(body, { close: true }); // เลื่อนขั้น → ปิดโมดอล
      return;
    }
    if (armed === a.to) { setArmed(null); return; }
    const init: Record<string, string> = {};
    a.fields.forEach(f => { if (!f.type || f.type === "date") init[f.field] = today(); });
    setVals(init); setArmed(a.to); setErr(null);
  };

  const confirmAction = (a: Action) => {
    for (const f of a.fields ?? []) {
      if (!f.optional && !vals[f.field]) { setErr(`กรุณากรอก "${f.label}"`); return; }
    }
    const body: Record<string, unknown> = { status: a.to };
    (a.fields ?? []).forEach(f => { if (vals[f.field]) body[f.field] = vals[f.field]; });
    if (a.qc) body.qc_result = a.qc;
    patch(body, { close: true }); // เลื่อนขั้น → ปิดโมดอล
  };

  // หลัง confirm dialog → ดำเนินต่อปกติ (กางฟอร์ม หรือ patch เลย)
  const proceedMfgAction = (a: Action) => {
    setMfgConfirmPending(null);
    if (!a.fields || a.fields.length === 0) {
      const body: Record<string, unknown> = { status: a.to };
      if (a.qc) body.qc_result = a.qc;
      patch(body, { close: true });
      return;
    }
    const init: Record<string, string> = {};
    a.fields.forEach(f => { if (!f.type || f.type === "date") init[f.field] = today(); });
    setVals(init); setArmed(a.to); setErr(null);
  };

  // บันทึกนัดวัด + วันติดตั้ง (dirty fields) แล้วดำเนิน action เลื่อนขั้น — ใน 1 patch
  const saveDirtyAndProceed = (a: Action) => {
    const body: Record<string, unknown> = { status: a.to };
    if (a.qc) body.qc_result = a.qc;
    // รวม dirty fields เข้าไปด้วย
    if (prod.status === "PENDING_MEASURE") {
      body.measure_scheduled = sched;
      body.measure_time = schedTime || null;
      body.measurer_name = measurerName || null;
    }
    if (installDate !== (row.planned_install_date ?? "")) {
      body.planned_install_date = installDate || null;
    }
    patch(body, { close: true });
  };

  const reportProblem = () => {
    if (!problem.trim()) { setErr("กรุณาพิมพ์ปัญหาที่เจอ"); return; }
    patch({ status: "ISSUE", notes: problem }, { close: true });
  };

  const big = "min-h-[54px] rounded-2xl text-base font-semibold";

  // Portal ออก document.body เพื่อให้ fixed inset-0 อ้างอิง viewport จริง
  // (glass ancestor มี backdrop-filter → สร้าง stacking context ทำให้ fixed ถูก contain)
  if (typeof document === "undefined") return null;
  return createPortal(
    // ครอบ app-bg: ให้ ".app-bg .glass" (กระจกมืดโซน OMS) มีผล — portal ไป body หลุด scope
    // ทำให้ .glass กลายเป็นพื้นขาว + text-white = อ่านไม่ออก · background โปร่งใสกัน gradient แดงทับ scrim
    <div className="app-bg" style={{ background: "transparent", minHeight: 0 }}>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`อัปเดตงาน ${prod.job?.job_code}`}>
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 fade-in max-h-[92dvh] overflow-y-auto">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-white font-bold text-xl tnum">{prod.job?.job_code}</div>
            <div className="text-sm truncate" style={{ color: "var(--t-mid)" }}>{prod.job?.customer_name} · {prod.job?.customer_area ?? "—"}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10 shrink-0"><X size={22} /></button>
        </div>

        {/* สถานะตอนนี้ + summary chips (ข้อ 8: ขึ้นมาใต้ชื่อ) */}
        <div className="text-center py-2">
          <div className="text-[13px] mb-1.5" style={{ color: "var(--t-low)" }}>ตอนนี้อยู่ขั้น</div>
          <div className="inline-block scale-125"><Chip>{PROD_STATUS[prod.status]}</Chip></div>
        </div>
        {/* summary chips อ่านจาก row (สดหลัง in-place save) */}
        <SummaryChips row={row} />

        {!canWrite ? (
          <p className="text-center text-sm mt-4" style={{ color: "var(--t-low)" }}>บทบาทนี้ดูได้อย่างเดียว</p>
        ) : (
          <>
            {/* ── ข้อ 8: dirty warning banner (ก่อนปุ่มเลื่อนขั้น) ── */}
            {dirtyFields.length > 0 && (
              <div className="mt-3 rounded-2xl border border-yellow-300/35 bg-yellow-500/15 p-3.5">
                <div className="flex items-start gap-2 text-[13px] text-yellow-100">
                  <TriangleAlert size={15} className="shrink-0 mt-0.5 text-yellow-300" />
                  <span>มีข้อมูลที่ยังไม่บันทึก: <b>{dirtyFields.join(", ")}</b></span>
                </div>
              </div>
            )}

            {/* ── ข้อ 8: ปุ่มเลื่อนขั้นขึ้นก่อน ── */}
            {actions.length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {actions.map((a) => (
                  <div key={a.to + a.label}>
                    <button onClick={() => clickAction(a)} disabled={saving}
                      className={`focusable pressable w-full ${big} border flex items-center justify-between gap-2 px-4 disabled:opacity-60 ${TONE_BTN[a.tone]}`}>
                      <span className="text-left leading-tight">
                        {a.label}
                        {a.hint && <span className="block text-[11px] font-normal opacity-80 mt-0.5">{a.hint}</span>}
                      </span>
                      {a.fields?.length ? <ChevronRight size={18} className={`shrink-0 transition-transform ${armed === a.to ? "rotate-90" : ""}`} /> : <Check size={18} className="shrink-0" />}
                    </button>

                    {/* ฟอร์มของ action ที่กางอยู่ */}
                    {armed === a.to && a.fields?.length ? (
                      <div className="mt-2 glass-card rounded-2xl p-4 space-y-3 border border-white/10">
                        {/* dirty warning ใน form inline */}
                        {dirtyFields.length > 0 && (
                          <div className="rounded-xl border border-yellow-300/30 bg-yellow-500/12 p-3 space-y-2">
                            <p className="text-[12px] text-yellow-100">มีข้อมูลที่ยังไม่บันทึก ({dirtyFields.join(", ")}) — บันทึกก่อนไปต่อไหม?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveDirtyAndProceed(a)}
                                disabled={saving}
                                className="focusable pressable flex-1 min-h-[40px] rounded-xl bg-yellow-500 hover:bg-yellow-400 text-white text-[12px] font-semibold disabled:opacity-60"
                              >
                                บันทึกแล้วไปต่อ
                              </button>
                              <button
                                onClick={() => confirmAction(a)}
                                disabled={saving}
                                className="focusable pressable flex-1 min-h-[40px] rounded-xl glass-card border border-white/15 text-white/80 text-[12px]"
                              >
                                ข้ามไปเลย
                              </button>
                            </div>
                          </div>
                        )}
                        {a.fields.map(f => (
                          <div key={f.field}>
                            <label className="block text-[13px] mb-1.5 font-medium text-white">{f.label}</label>
                            {f.type === "note" ? (
                              <textarea value={vals[f.field] ?? ""} onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value }))} rows={2}
                                placeholder="ระบุหมายเหตุ (ถ้ามี)" aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40" />
                            ) : (
                              <input type="date" value={vals[f.field] ?? ""} onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value }))} aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-4 py-3 text-base text-white outline-none tnum min-h-[52px] [&::-webkit-calendar-picker-indicator]:invert" />
                            )}
                          </div>
                        ))}
                        {/* ถ้าไม่มี dirty ให้แสดงปุ่มยืนยันปกติ */}
                        {dirtyFields.length === 0 && (
                          <button onClick={() => confirmAction(a)} disabled={saving}
                            className={`focusable pressable w-full ${big} ${TONE_BTN[a.tone]} border shadow-lg disabled:opacity-60 flex items-center justify-center gap-2`}>
                            {saving ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={22} />}
                            ยืนยัน → {PROD_STATUS[a.to]}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 bg-emerald-500/15 border border-emerald-300/30 rounded-2xl p-4 text-center">
                <div className="text-emerald-200 font-semibold">พร้อมติดตั้งแล้ว</div>
                <div className="text-[12px] mt-1" style={{ color: "var(--t-mid)" }}>งานนี้ส่งเข้าทีมติดตั้งอัตโนมัติแล้ว</div>
              </div>
            )}

            {/* confirm: เริ่มผลิตทั้งที่ยังไม่ได้สั่งของ */}
            {mfgConfirmPending && (
              <div className="mt-3 rounded-2xl border border-amber-300/35 bg-amber-500/15 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <TriangleAlert size={18} className="text-amber-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-100">วัสดุยังไม่พร้อม</p>
                    <p className="text-[13px] mt-0.5" style={{ color: "var(--t-mid)" }}>
                      {boqStatus === null
                        ? "ยังไม่มี BOQ — ยังไม่ได้สั่งของเลย"
                        : `BOQ สถานะ "${BOQ_STATUS_LABEL[boqStatus as "draft" | "confirmed" | "ordered"]}" — ยังไม่ได้สั่งของ`}
                      {" "}ยืนยันเริ่มผลิตเลยไหม?
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMfgConfirmPending(null)}
                    className="focusable pressable flex-1 glass-card border border-white/15 text-white rounded-xl py-2.5 text-sm min-h-[44px]"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => proceedMfgAction(mfgConfirmPending)}
                    className="focusable pressable flex-1 bg-orange-500 hover:bg-orange-400 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px]"
                  >
                    เริ่มผลิตเลย
                  </button>
                </div>
              </div>
            )}

            {/* แจ้งปัญหา */}
            {prod.status !== "ISSUE" && (!problemOpen ? (
              <button onClick={() => setProblemOpen(true)} className="focusable pressable w-full mt-3 min-h-[48px] rounded-2xl border border-amber-300/30 bg-amber-500/12 text-amber-100 font-medium flex items-center justify-center gap-2">
                <TriangleAlert size={18} /> งานนี้มีปัญหา
              </button>
            ) : (
              <div className="mt-3 glass-card rounded-2xl p-4 border border-amber-300/25">
                <label className="block text-[13px] mb-1.5 font-medium text-amber-100">เจอปัญหาอะไร?</label>
                <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder="เช่น กระจกมาผิดขนาด รออะไหล่"
                  className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setProblemOpen(false)} className="focusable pressable flex-1 glass-card text-white rounded-xl py-2.5 text-sm min-h-[44px]">ยกเลิก</button>
                  <button onClick={reportProblem} disabled={saving} className="focusable pressable flex-1 bg-amber-500 hover:bg-amber-400 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60">ส่งแจ้งปัญหา</button>
                </div>
              </div>
            ))}

            {/* ── การ์ดกรอกข้อมูล (ลงมาใต้ปุ่มเลื่อนขั้น ตาม ข้อ 8) ── */}

            {/* นัดวัดล่วงหน้า (เฉพาะรอวัด) — บันทึกได้โดยไม่เลื่อนสถานะ */}
            {prod.status === "PENDING_MEASURE" && (
              <div className="mt-4 glass-card rounded-2xl p-4 border border-sky-300/20 space-y-3">
                <div className="text-[13px] font-semibold text-sky-100">นัดวัดหน้างาน (จองคิวล่วงหน้าได้)</div>

                {/* วันที่ + เวลา */}
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>วันที่</label>
                    <input type="date" value={sched} onChange={e => setSched(e.target.value)} aria-label="วันนัดวัด"
                      className="focusable w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none tnum min-h-[48px] [&::-webkit-calendar-picker-indicator]:invert" />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>เวลา</label>
                    <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} aria-label="เวลานัดวัด"
                      step={60}
                      className="focusable w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none tnum min-h-[48px] [&::-webkit-calendar-picker-indicator]:invert" />
                  </div>
                </div>

                {/* ช่างที่วัด (free-text — ช่างวัดไม่มี user account) */}
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ช่างที่วัด</label>
                  <input
                    type="text"
                    list="measurer-suggestions"
                    value={measurerName}
                    onChange={e => setMeasurerName(e.target.value)}
                    placeholder="เช่น เป, เนียน"
                    aria-label="ช่างที่วัด"
                    className="focusable w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none min-h-[48px] placeholder-white/35"
                  />
                  <datalist id="measurer-suggestions">
                    <option value="เป" />
                    <option value="เนียน" />
                  </datalist>
                </div>

                <button
                  onClick={() => {
                    patch({
                      measure_scheduled: sched,
                      measure_time: schedTime || null,
                      measurer_name: measurerName || null,
                    }, { close: false, feedbackKey: "sched" });
                    // sync local state
                    setSched(sched);
                    setSchedTime(schedTime);
                    setMeasurerName(measurerName);
                  }}
                  disabled={saving}
                  className={`focusable pressable w-full px-4 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-60 transition-colors ${
                    savedField === "sched"
                      ? "bg-emerald-400 border-emerald-300"
                      : "bg-sky-500 hover:bg-sky-400"
                  }`}
                >
                  {savedField === "sched" ? (
                    <span className="flex items-center justify-center gap-1.5"><Check size={16} /> บันทึกแล้ว</span>
                  ) : "บันทึกนัดวัด"}
                </button>
                <p className="text-[11px]" style={{ color: "var(--t-low)" }}>ยังอยู่ขั้น "รอวัด" — กดปุ่มเขียวด้านบนเมื่อวัดจริงเสร็จแล้ว</p>
              </div>
            )}

            {/* วันติดตั้งที่กำหนด — กรอก/แก้ได้ทุกขั้น */}
            {prod.status !== "READY" && (
              <div className="mt-3 glass-card rounded-2xl p-4 border border-emerald-300/20">
                <label className="block text-[13px] mb-1.5 font-medium text-emerald-100">วันติดตั้งที่กำหนด (นัดลูกค้า)</label>
                <div className="flex gap-2">
                  <input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)} aria-label="วันติดตั้งที่กำหนด"
                    className="focusable flex-1 glass-card rounded-xl px-4 py-3 text-base text-white outline-none tnum min-h-[52px] [&::-webkit-calendar-picker-indicator]:invert" />
                  <button
                    onClick={() => patch({ planned_install_date: installDate || null }, { close: false, feedbackKey: "install" })}
                    disabled={saving}
                    className={`focusable pressable px-4 rounded-xl text-white text-sm font-semibold min-h-[52px] disabled:opacity-60 transition-colors ${
                      savedField === "install"
                        ? "bg-emerald-400"
                        : "bg-emerald-500 hover:bg-emerald-400"
                    }`}
                  >
                    {savedField === "install" ? <Check size={16} /> : "บันทึกวัน"}
                  </button>
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--t-low)" }}>ลูกค้ารู้วันติดตั้งตั้งแต่ก่อนมัดจำ — กรอกไว้เลยเพื่อกำหนดเดดไลน์ผลิต/วัด</p>
              </div>
            )}

            {/* ── Panel วัสดุ (BOQ) ── */}
            <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Package size={16} className="text-sky-300 shrink-0" />
                <span className="text-sm font-semibold text-white">วัสดุ (BOQ)</span>
              </div>

              {prod.boq_summary ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    {boqStatus === "ordered" ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-300/30">
                        <PackageCheck size={13} /> สั่งของแล้ว
                      </span>
                    ) : boqStatus === "confirmed" ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-lg bg-sky-500/20 text-sky-200 border border-sky-300/30">
                        <Package size={13} /> ยืนยันแล้ว
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-lg bg-white/10 text-white/70 border border-white/15">
                        <Package size={13} /> ร่าง
                      </span>
                    )}
                    <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>
                      {prod.boq_summary.item_count} รายการ
                    </span>
                    <a
                      href={`/boq/${prod.boq_summary.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focusable inline-flex items-center gap-1 text-[12px] text-sky-300 hover:text-sky-200 underline underline-offset-2"
                    >
                      ดู/แก้ BOQ <ExternalLink size={12} />
                    </a>
                  </div>

                  {boqStatus !== "ordered" && canWrite && (
                    <button
                      onClick={markOrdered}
                      disabled={boqSaving}
                      className={`focusable pressable mt-2.5 w-full min-h-[44px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors ${
                        savedField === "boq"
                          ? "bg-emerald-400/30 border-emerald-300/40 text-emerald-100"
                          : "bg-emerald-500/20 hover:bg-emerald-500/35 border-emerald-300/30 text-emerald-200"
                      }`}
                    >
                      {boqSaving ? (
                        <span className="w-4 h-4 rounded-full border-2 border-emerald-300/40 border-t-emerald-200 animate-spin" />
                      ) : savedField === "boq" ? (
                        <><Check size={16} /> บันทึกแล้ว</>
                      ) : (
                        <><PackageCheck size={16} /> ยืนยัน สั่งของแล้ว</>
                      )}
                    </button>
                  )}
                  {boqErr && <p className="mt-1.5 text-[12px] text-rose-200">{boqErr}</p>}
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--t-low)" }}>
                    <TriangleAlert size={14} className="text-amber-400 shrink-0" />
                    ยังไม่มี BOQ — สร้างที่เมนู BOQ ตัดอลู
                  </div>
                  <a
                    href={`/boq?job_id=${prod.job_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focusable pressable inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-300/25 text-sky-200 text-[13px] font-medium"
                  >
                    <ExternalLink size={13} /> ไปหน้า BOQ ตัดอลู
                  </a>
                </div>
              )}
            </div>

            {/* ── ข้อ 8: ประวัติการทำงาน — collapsible ล่างสุด ── */}
            {(row.measure_scheduled || row.measure_actual || row.measurer_name || row.planned_install_date || row.production_queued || row.production_done || row.qc_result) && (
              <div className="mt-4">
                <button
                  onClick={() => setHistOpen((v) => !v)}
                  className="focusable pressable w-full flex items-center justify-between gap-2 text-[12px] px-3 py-2 rounded-xl glass-card border border-white/10 text-white/60 hover:text-white/80"
                  aria-expanded={histOpen}
                >
                  <span>ประวัติการทำงาน</span>
                  <ChevronRight size={14} className={`transition-transform ${histOpen ? "rotate-90" : ""}`} />
                </button>
                {histOpen && (
                  <div className="mt-2 text-[12px] space-y-1 px-1" style={{ color: "var(--t-low)" }}>
                    {row.measure_scheduled && (
                      <div>นัดวัด: <span className="tnum text-white/80">{thDate(row.measure_scheduled)}{row.measure_time ? ` เวลา ${normalizeTime(row.measure_time).slice(0, 5)}` : ""}</span></div>
                    )}
                    {row.measurer_name && <div>ช่างวัด: <span className="text-white/80">{row.measurer_name}</span></div>}
                    {row.measure_actual   && <div>วัดจริง: <span className="tnum text-white/80">{thDate(row.measure_actual)}</span></div>}
                    {row.planned_install_date && <div>นัดติดตั้ง: <span className="tnum text-white/80">{thDate(row.planned_install_date)}</span></div>}
                    {row.production_queued && <div>เริ่มผลิต: <span className="tnum text-white/80">{thDate(row.production_queued)}</span></div>}
                    {row.production_done  && <div>ผลิตเสร็จ: <span className="tnum text-white/80">{thDate(row.production_done)}</span></div>}
                    {row.qc_result && (
                      <div>
                        QC:{" "}
                        <span className={row.qc_result === "PASSED" ? "text-emerald-300" : "text-rose-300"}>
                          {row.qc_result === "PASSED" ? "ผ่าน" : "ไม่ผ่าน"}
                        </span>
                        {row.qc_date && <span className="tnum text-white/70"> · {thDate(row.qc_date)}</span>}
                      </div>
                    )}
                    {row.qc_note && <div className="text-white/60">หมายเหตุ: {row.qc_note}</div>}
                  </div>
                )}
              </div>
            )}

            {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
          </>
        )}
      </div>
    </div>
    </div>,
    document.body,
  );
}
