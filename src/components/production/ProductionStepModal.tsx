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

export function ProductionStepModal({ prod, canWrite, onClose, onSaved }: {
  prod: ProdRow; canWrite: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
  const [schedTime, setSchedTime] = useState(prod.measure_time ?? "");
  const [measurerName, setMeasurerName] = useState(prod.measurer_name ?? "");
  // วันติดตั้งที่กำหนด — กรอก/แก้ได้ทุกขั้น (ลูกค้ารู้ตั้งแต่ก่อนมัดจำ) ใช้วางเดดไลน์
  const [installDate, setInstallDate] = useState(prod.planned_install_date ?? "");

  // action ที่ "กางฟอร์ม" อยู่ (null = ยังไม่เลือก)
  const [armed, setArmed] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

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

  const patch = async (body: Record<string, unknown>) => {
    setErr(null); setSaving(true);
    try { await api.patch(`/production/${prod.id}`, body); onSaved(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const markOrdered = async () => {
    if (!prod.boq_summary) return;
    setBoqErr(null); setBoqSaving(true);
    try {
      await api.patch(`/boq/${prod.boq_summary.id}`, { status: "ordered" });
      setBoqStatus("ordered");
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
      patch(body);
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
    patch(body);
  };

  // หลัง confirm dialog → ดำเนินต่อปกติ (กางฟอร์ม หรือ patch เลย)
  const proceedMfgAction = (a: Action) => {
    setMfgConfirmPending(null);
    if (!a.fields || a.fields.length === 0) {
      const body: Record<string, unknown> = { status: a.to };
      if (a.qc) body.qc_result = a.qc;
      patch(body);
      return;
    }
    const init: Record<string, string> = {};
    a.fields.forEach(f => { if (!f.type || f.type === "date") init[f.field] = today(); });
    setVals(init); setArmed(a.to); setErr(null);
  };

  const reportProblem = () => {
    if (!problem.trim()) { setErr("กรุณาพิมพ์ปัญหาที่เจอ"); return; }
    patch({ status: "ISSUE", notes: problem });
  };

  const big = "min-h-[54px] rounded-2xl text-base font-semibold";

  // Portal ออก document.body เพื่อให้ fixed inset-0 อ้างอิง viewport จริง
  // (glass ancestor มี backdrop-filter → สร้าง stacking context ทำให้ fixed ถูก contain)
  if (typeof document === "undefined") return null;
  return createPortal(
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

        {/* สถานะตอนนี้ */}
        <div className="text-center py-2">
          <div className="text-[13px] mb-1.5" style={{ color: "var(--t-low)" }}>ตอนนี้อยู่ขั้น</div>
          <div className="inline-block scale-125"><Chip>{PROD_STATUS[prod.status]}</Chip></div>
        </div>

        {!canWrite ? (
          <p className="text-center text-sm mt-4" style={{ color: "var(--t-low)" }}>บทบาทนี้ดูได้อย่างเดียว</p>
        ) : (
          <>
            {/* นัดวัดล่วงหน้า (เฉพาะรอวัด) — บันทึกได้โดยงานยังอยู่ "รอวัด" */}
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
                  onClick={() => patch({
                    measure_scheduled: sched,
                    measure_time: schedTime || null,
                    measurer_name: measurerName || null,
                  })}
                  disabled={saving}
                  className="focusable pressable w-full px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold min-h-[48px] disabled:opacity-60"
                >
                  บันทึกนัดวัด
                </button>
                <p className="text-[11px]" style={{ color: "var(--t-low)" }}>ยังอยู่ขั้น "รอวัด" — กดปุ่มเขียวด้านล่างเมื่อวัดจริงเสร็จแล้ว</p>
              </div>
            )}

            {/* วันติดตั้งที่กำหนด — กรอก/แก้ได้ทุกขั้น (ตั้งแต่รอวัด) เพื่อวางเดดไลน์ล่วงหน้า */}
            {prod.status !== "READY" && (
              <div className="mt-3 glass-card rounded-2xl p-4 border border-emerald-300/20">
                <label className="block text-[13px] mb-1.5 font-medium text-emerald-100">📅 วันติดตั้งที่กำหนด (นัดลูกค้า)</label>
                <div className="flex gap-2">
                  <input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)} aria-label="วันติดตั้งที่กำหนด"
                    className="focusable flex-1 glass-card rounded-xl px-4 py-3 text-base text-white outline-none tnum min-h-[52px] [&::-webkit-calendar-picker-indicator]:invert" />
                  <button onClick={() => patch({ planned_install_date: installDate || null })} disabled={saving}
                    className="focusable pressable px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold min-h-[52px] disabled:opacity-60">บันทึกวัน</button>
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
                      className="focusable pressable mt-2.5 w-full min-h-[44px] rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-300/30 text-emerald-200 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {boqSaving
                        ? <span className="w-4 h-4 rounded-full border-2 border-emerald-300/40 border-t-emerald-200 animate-spin" />
                        : <PackageCheck size={16} />}
                      ยืนยัน สั่งของแล้ว
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

            {/* ปุ่มเลือกเส้นทาง */}
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
                        <button onClick={() => confirmAction(a)} disabled={saving}
                          className={`focusable pressable w-full ${big} ${TONE_BTN[a.tone]} border shadow-lg disabled:opacity-60 flex items-center justify-center gap-2`}>
                          {saving ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={22} />}
                          ยืนยัน → {PROD_STATUS[a.to]}
                        </button>
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

            {/* ประวัติการทำงาน */}
            {(prod.measure_scheduled || prod.measure_actual || prod.measurer_name || prod.planned_install_date || prod.production_queued || prod.production_done || prod.qc_result) && (
              <div className="mt-4 text-[12px] space-y-1" style={{ color: "var(--t-low)" }}>
                {prod.measure_scheduled && (
                  <div>นัดวัด: <span className="tnum text-white/80">{thDate(prod.measure_scheduled)}{prod.measure_time ? ` เวลา ${prod.measure_time.slice(0, 5)}` : ""}</span></div>
                )}
                {prod.measurer_name && <div>ช่างวัด: <span className="text-white/80">{prod.measurer_name}</span></div>}
                {prod.measure_actual   && <div>วัดจริง: <span className="tnum text-white/80">{thDate(prod.measure_actual)}</span></div>}
                {prod.planned_install_date && <div>นัดติดตั้ง: <span className="tnum text-white/80">{thDate(prod.planned_install_date)}</span></div>}
                {prod.production_queued && <div>เริ่มผลิต: <span className="tnum text-white/80">{thDate(prod.production_queued)}</span></div>}
                {prod.production_done  && <div>ผลิตเสร็จ: <span className="tnum text-white/80">{thDate(prod.production_done)}</span></div>}
                {prod.qc_result && (
                  <div>
                    QC:{" "}
                    <span className={prod.qc_result === "PASSED" ? "text-emerald-300" : "text-rose-300"}>
                      {prod.qc_result === "PASSED" ? "ผ่าน" : "ไม่ผ่าน"}
                    </span>
                    {prod.qc_date && <span className="tnum text-white/70"> · {thDate(prod.qc_date)}</span>}
                  </div>
                )}
                {prod.qc_note && <div className="text-white/60">หมายเหตุ: {prod.qc_note}</div>}
              </div>
            )}

            {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
