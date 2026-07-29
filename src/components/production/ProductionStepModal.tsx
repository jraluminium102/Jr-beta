"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS, PROD_LANE, PROD_LANE_META, PROD_FLOW_STEPS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip } from "@/components/ui/primitives";
import { X, Check, TriangleAlert, ChevronRight } from "@/components/ui/icons";
import DateField from "@/components/ui/DateField";
import { ProductionSetsSection } from "@/components/production/ProductionSetsSection";
import JobCutlists from "@/components/cutlist/JobCutlists";
import { FloorWorkBadge } from "@/components/ui/FloorWorkBadge";
import type { BlockerNote } from "@/components/production/BlockerNotesInline";
import type { ProdStatus } from "@/lib/database.types";

export type ProdRow = {
  id: string; job_id: string; status: ProdStatus;
  measure_scheduled: string | null; measure_actual: string | null; planned_install_date: string | null;
  measure_time: string | null; measurer_id: string | null; measurer_name: string | null;
  measure_actual_time: string | null; measured_by_name: string | null;
  production_queued: string | null; production_done: string | null; production_due_date: string | null;
  qc_result: "PASSED" | "FAILED" | null; qc_date: string | null; qc_note: string | null;
  producer_note?: string | null;
  cover_sheet_exists?: boolean;                                          // มีใบปะหน้าแล้วหรือยัง (0111) — ป้าย CoverSheetChip
  job: {
    job_code: string; customer_name: string; customer_area: string | null; deposit_date: string | null;
    floor_work?: string | null; floor_note?: string | null;             // งานพื้น ผรม. (0090) — read-only marker
    current_stage?: number | null;                                      // ขั้นงาน (24 stage) — ใช้ตัดสินว่าเตือนทำใบปะหน้าไหม
    job_blocker_notes?: BlockerNote[];                                  // โน้ตเด่น "ทำไมยังวัด/ผลิตไม่ได้" (0098)
  } | null;
};

type StepField = { field: string; label: string; type?: "date" | "note" | "time" | "text"; optional?: boolean };
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
// flow: ...ประชุม/แก้แบบ/ลูกค้าคอนเฟิร์ม → "ส่งเข้ารอลงผลิต" (QUEUED) → ออฟฟิศกรอกข้อมูล
//        → ช่างกด "เริ่มผลิต" (MANUFACTURING) ในตารางผลิตช่าง (บังคับวันติดตั้ง+กำหนดเสร็จ)
// วันติดตั้ง/วันกำหนดเสร็จ เป็นช่องแก้ได้ตลอด (ดูใน modal)
const TRANSITIONS: Record<ProdStatus, Action[]> = {
  // รอวัด: นัดวัดล่วงหน้าได้ (อาจเป็นเดือน) — บันทึกนัดวัดแยกด้านบน, ปุ่มนี้คือ "วัดเสร็จแล้ว"
  PENDING_MEASURE: [
    { to: "PENDING_MEETING", label: "วัดหน้างานเสร็จ → เข้าขั้นประชุมแบบ", tone: "go",
      fields: [
        { field: "measure_actual",      label: "วันที่วัดจริง",           type: "date" },
        { field: "measure_actual_time", label: "เวลาที่วัด (ถ้ามี)",       type: "time", optional: true },
        { field: "measured_by_name",    label: "ใครวัด",                  type: "text", optional: true },
      ] },
  ],
  MEASURED: [
    { to: "PENDING_MEETING", label: "เข้าสู่ขั้นประชุมสรุปแบบ", tone: "go" },
  ],
  // หลังประชุม → เลือกได้ 3 ทาง (แบบโอเค+ลูกค้าคอนเฟิร์ม = ส่งเข้ารอลงผลิต)
  PENDING_MEETING: [
    { to: "QUEUED", label: "แบบโอเค + ลูกค้าคอนเฟิร์มแล้ว → ส่งเข้ารอลงผลิต", hint: "ไปกรอกข้อมูลผลิตก่อนเข้าตารางช่าง", tone: "go" },
    { to: "PENDING_CONFIRM", label: "รอลูกค้าคอนเฟิร์มแบบก่อน", tone: "wait" },
    { to: "REVISING", label: "ต้องแก้แบบ → ส่งกลับทีมเขียนแบบ", hint: "งานจะเด้งไปหน้าเขียนแบบ (สถานะ: แก้แบบ)", tone: "warn" },
    // ต้องเข้าไปวัดหน้างานใหม่ → เด้งกลับ "รอวัดจริง" (ไม่ไปผลิต) · ตอนวัดเสร็จรอบใหม่จะกรอกวันวัดทับให้เอง
    { to: "PENDING_MEASURE", label: "ต้องวัดหน้างานใหม่ → กลับไปรอวัดจริง", hint: "ชื่อลูกค้าเด้งกลับหน้าวัดจริง ไม่เข้าผลิต", tone: "warn" },
  ],
  // แก้แบบหลังวัด
  REVISING: [
    { to: "PENDING_CONFIRM", label: "แก้แบบเสร็จ → รอลูกค้าคอนเฟิร์ม", tone: "go" },
    { to: "QUEUED", label: "แก้เสร็จ + ลูกค้าโอเค → ส่งเข้ารอลงผลิต", tone: "go" },
  ],
  // รอลูกค้าคอนเฟิร์ม
  PENDING_CONFIRM: [
    { to: "QUEUED", label: "ลูกค้าคอนเฟิร์มแล้ว → ส่งเข้ารอลงผลิต", hint: "ไปกรอกข้อมูลผลิตก่อนเข้าตารางช่าง", tone: "go" },
    { to: "REVISING", label: "ลูกค้าขอแก้แบบอีก → ส่งกลับเขียนแบบ", tone: "warn" },
  ],
  // รอลงผลิต: ออฟฟิศกรอกวันติดตั้ง+วันกำหนดเสร็จ+สเปค แล้วช่างกดเริ่มผลิต (บังคับวันครบ)
  QUEUED: [
    { to: "MANUFACTURING", label: "ข้อมูลครบ → เริ่มผลิต", hint: "ต้องมีวันติดตั้ง + วันกำหนดผลิตเสร็จ", tone: "go" },
  ],
  // ผลิต + QC ทำในเช็คลิสต์ชุดงาน (หน้าตารางผลิต) — เสร็จแล้วส่งติดตั้งได้เลย ไม่มีเฟส QC แยก
  MANUFACTURING: [
    { to: "READY", label: "ผลิต + QC เสร็จ → พร้อมติดตั้ง", hint: "QC กดในตารางผลิต (เช็คลิสต์ชุดงาน)", tone: "go", qc: "PASSED",
      fields: [
        { field: "production_done", label: "วันผลิตเสร็จ" },
        { field: "qc_date", label: "วันพร้อมส่งติดตั้ง" },
      ] },
  ],
  // งานเก่าที่ยังค้างสถานะ QC — ส่งติดตั้ง หรือกลับไปผลิต
  QC: [
    { to: "READY", label: "QC ผ่าน → พร้อมติดตั้ง", tone: "go", qc: "PASSED",
      fields: [{ field: "qc_date", label: "วันตรวจ QC" }] },
    { to: "MANUFACTURING", label: "กลับไปผลิต/แก้", tone: "warn" },
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

// ── P0-1A: Clash detection types + helpers ────────────────────────────────────

type ScheduledEntry = {
  production_id: string;
  customer_name: string | null;
  customer_area: string | null;
  measure_scheduled: string | null;
  measure_time: string | null;
  measurer_name: string | null;
};

type ClashResult = {
  entry: ScheduledEntry;
  diffMin: number | null; // null = วันเดียวกันแต่ไม่มีเวลา (เตือนเบา)
};

/** แปลงเวลา HH:MM (หรือ "10.00") → นาที */
function timeToMin(t: string | null | undefined): number | null {
  const n = normalizeTime(t);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

/**
 * หา entry นัดวัดที่ช่าง (measurerName) มีในวัน (sched) แล้วอาจชนกับเวลา schedTime
 * ข้าม selfId (production ปัจจุบัน)
 */
function computeClashes(
  scheduled: ScheduledEntry[],
  sched: string,
  schedTime: string,
  measurerName: string,
  selfId: string,
): ClashResult[] {
  if (!sched || !measurerName.trim()) return [];
  const nameA = measurerName.trim();
  const minA = timeToMin(schedTime);

  const candidates = scheduled.filter(
    (e) =>
      e.production_id !== selfId &&
      e.measure_scheduled === sched &&
      (e.measurer_name ?? "").trim() === nameA,
  );

  return candidates
    .map((e): ClashResult => {
      const minB = timeToMin(e.measure_time);
      if (minA !== null && minB !== null) {
        return { entry: e, diffMin: Math.abs(minA - minB) };
      }
      // ไม่มีเวลาฝั่งใดฝั่งหนึ่ง → เตือนเบา (diffMin null)
      return { entry: e, diffMin: null };
    })
    // กรองเฉพาะที่ชน (|diff|<90) หรือเตือนเบา (null)
    .filter((c) => c.diffMin === null || c.diffMin < 90)
    .sort((a, b) => {
      if (a.diffMin === null && b.diffMin === null) return 0;
      if (a.diffMin === null) return 1;
      if (b.diffMin === null) return -1;
      return a.diffMin - b.diffMin;
    });
}

const TONE_BTN: Record<Tone, string> = {
  go:   "bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-white",
  warn: "bg-amber-500 hover:bg-amber-400 border-amber-400 text-white",
  wait: "glass-card border-white/15 text-white hover:border-sky-300/50",
};

// ── Summary chips (อ่านจาก row ทำให้เห็นค่าสดหลัง in-place save) ─────────
function SummaryChips({ row }: { row: ProdRow }) {
  const chips: { label: string; value: string; cls: string }[] = [];
  if (row.measure_scheduled) chips.push({
    label: "นัดวัด",
    value: thDate(row.measure_scheduled) + (row.measure_time ? ` ${normalizeTime(row.measure_time).slice(0, 5)}` : ""),
    cls: "bg-sky-500/20 border-sky-300/25 text-sky-100",
  });
  if (row.measure_actual) chips.push({
    label: "วัดจริง",
    value: thDate(row.measure_actual)
      + (row.measure_actual_time ? ` ${normalizeTime(row.measure_actual_time).slice(0, 5)}` : "")
      + (row.measured_by_name ? ` โดย ${row.measured_by_name}` : ""),
    cls: "bg-teal-500/20 border-teal-300/25 text-teal-100",
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

// ทุกสถานะผลิต (สำหรับ "แก้เฟส" แอดมิน) — เรียงตาม flow
const ALL_PROD_STATUSES: ProdStatus[] = ["PENDING_MEASURE","MEASURED","PENDING_MEETING","REVISING","PENDING_CONFIRM","QUEUED","MANUFACTURING","QC","READY","ISSUE"];

export function ProductionStepModal({
  prod,
  canWrite,
  canAdmin = false,
  canUndeposit = false,
  onClose,
  onSavedInPlace,
  onSavedAndClose,
  /** @deprecated ใช้ onSavedInPlace + onSavedAndClose แทน — คงไว้ backward-compat */
  onSaved,
}: {
  prod: ProdRow;
  canWrite: boolean;
  canAdmin?: boolean;      // ADMIN — แก้เฟสงาน (override)
  canUndeposit?: boolean;  // ADMIN/ACCOUNTING (finance:void) — ถอยมัดจำ
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
  // undo "พร้อมติดตั้ง" (กันกดผิด) — กางยืนยันก่อนถอยกลับกำลังผลิต
  const [undoReadyOpen, setUndoReadyOpen] = useState(false);

  // นัดวัด (เฉพาะตอน PENDING_MEASURE) — บันทึกได้โดยไม่เลื่อนสถานะ
  const [sched, setSched] = useState(prod.measure_scheduled ?? today());
  const [schedTime, setSchedTime] = useState(normalizeTime(prod.measure_time));
  const [measurerName, setMeasurerName] = useState(prod.measurer_name ?? "");
  // วันติดตั้งที่กำหนด — กรอก/แก้ได้ทุกขั้น
  const [installDate, setInstallDate] = useState(prod.planned_install_date ?? "");
  // วันกำหนดผลิตเสร็จ (เดดไลน์ช่าง) — กรอกตอนรอลงผลิต
  const [dueDate, setDueDate] = useState(prod.production_due_date ?? "");

  // action ที่ "กางฟอร์ม" อยู่ (null = ยังไม่เลือก)
  const [armed, setArmed] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  // collapsible ประวัติ
  const [histOpen, setHistOpen] = useState(false);

  // ── เครื่องมือแอดมิน (แก้กรณีกดผิด) ──
  const [adminOpen, setAdminOpen] = useState(false);
  const [ovStatus, setOvStatus] = useState<ProdStatus>(prod.status);
  const [ovBusy, setOvBusy] = useState(false);
  const [undepOpen, setUndepOpen] = useState(false);
  const [undepReason, setUndepReason] = useState("");
  const [undepBusy, setUndepBusy] = useState(false);
  const [adminErr, setAdminErr] = useState<string | null>(null);

  const doOverride = async () => {
    if (ovStatus === prod.status) { setAdminErr("เลือกเฟสใหม่ที่ต่างจากปัจจุบันก่อน"); return; }
    if (!confirm(`ย้ายเฟสงานเป็น "${PROD_STATUS[ovStatus]}"?\n(เครื่องมือแก้กรณีกดผิด — ข้ามลำดับปกติ)`)) return;
    setAdminErr(null); setOvBusy(true);
    try {
      await api.post(`/production/${prod.id}/override-status`, { status: ovStatus });
      if (onSavedAndClose) onSavedAndClose(); else onClose();
    } catch (e) { setAdminErr(e instanceof ApiError ? e.message : "แก้เฟสไม่สำเร็จ"); }
    finally { setOvBusy(false); }
  };

  const doUndeposit = async () => {
    if (!undepReason.trim()) { setAdminErr("กรุณาระบุเหตุผลการถอยมัดจำ"); return; }
    setAdminErr(null); setUndepBusy(true);
    try {
      await api.post(`/jobs/${prod.job_id}/undeposit`, { reason: undepReason.trim() });
      if (onSavedAndClose) onSavedAndClose(); else onClose();
    } catch (e) { setAdminErr(e instanceof ApiError ? e.message : "ถอยมัดจำไม่สำเร็จ"); }
    finally { setUndepBusy(false); }
  };

  // ── P0-1A: ดึง schedule เฉพาะตอน PENDING_MEASURE (React Query dedupe กับหน้า measure-schedule) ──
  const { data: scheduleRes } = useQuery({
    queryKey: ["measure-schedule"],
    queryFn: () => api.get<{ scheduled: ScheduledEntry[] }>("/measure-schedule"),
    staleTime: 30_000,
    enabled: prod.status === "PENDING_MEASURE",
  });

  // คำนวณ clashes แบบ live ตาม sched/schedTime/measurerName
  const clashes = useMemo<ClashResult[]>(() => {
    if (prod.status !== "PENDING_MEASURE") return [];
    const scheduled = scheduleRes?.data?.scheduled ?? [];
    return computeClashes(scheduled, sched, schedTime, measurerName, prod.id);
  }, [scheduleRes, sched, schedTime, measurerName, prod.id, prod.status]);

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
  if (dueDate !== (row.production_due_date ?? "")) dirtyFields.push("วันกำหนดผลิตเสร็จ");

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

  // สร้าง prefill เริ่มต้นสำหรับ action (รวม default ของฟีเจอร์ "ใครวัด + กี่โมง")
  const buildInitVals = (a: Action): Record<string, string> => {
    const init: Record<string, string> = {};
    a.fields?.forEach(f => {
      if (!f.type || f.type === "date") {
        init[f.field] = today();
      } else if (f.type === "time") {
        // prefill เวลาจากเวลานัด (measure_time) เป็นค่าเริ่มต้น
        if (f.field === "measure_actual_time") {
          const t = normalizeTime(row.measure_time);
          if (t) init[f.field] = t;
        }
      } else if (f.type === "text") {
        // prefill ชื่อช่างจากที่นัดไว้ (measurer_name)
        if (f.field === "measured_by_name" && row.measurer_name) {
          init[f.field] = row.measurer_name;
        }
      }
    });
    return init;
  };

  // เริ่มผลิต (จากรอลงผลิต) — ส่งวันติดตั้ง+กำหนดเสร็จไปด้วย กันยังไม่กดบันทึกในการ์ด
  const startProduction = () =>
    patch({ status: "MANUFACTURING", planned_install_date: installDate || null, production_due_date: dueDate || null }, { close: true });

  // คลิก action: ถ้าไม่มีฟอร์ม → ทำเลย, ถ้ามีฟอร์ม → กางฟอร์ม (กรอกแล้วกดยืนยัน)
  const clickAction = (a: Action) => {
    // gate "เริ่มผลิต" (ช่าง) จากรอลงผลิต — บังคับวันติดตั้ง + วันกำหนดผลิตเสร็จ
    if (a.to === "MANUFACTURING" && prod.status === "QUEUED") {
      if (!installDate || !dueDate) { setErr("กรอกวันติดตั้ง + วันกำหนดผลิตเสร็จ (การ์ดด้านล่าง) ก่อนเริ่มผลิต"); return; }
      startProduction();
      return;
    }
    if (!a.fields || a.fields.length === 0) {
      const body: Record<string, unknown> = { status: a.to };
      if (a.qc) body.qc_result = a.qc;
      patch(body, { close: true }); // เลื่อนขั้น → ปิดโมดอล
      return;
    }
    if (armed === a.to) { setArmed(null); return; }
    setVals(buildInitVals(a)); setArmed(a.to); setErr(null);
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
    if (dueDate !== (row.production_due_date ?? "")) {
      body.production_due_date = dueDate || null;
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
      {/* กว้าง 3xl (เดิม md=448px แคบไป) — ในนี้มีตารางแผนผลิต (ชุดงาน) 4 คอลัมน์ ตัวหนังสือเลยเล็กจนอ่านไม่ออก
          เจ้าของแจ้ง 16 ก.ค.2569: "ฟ้อนเล็ก อ่านยาก บับเบิ้ลเอาใหญ่ขึ้นได้ไหม" */}
      <div className="relative w-full sm:max-w-3xl glass rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 fade-in max-h-[92dvh] overflow-y-auto">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-white font-bold text-xl tnum">{prod.job?.job_code}</div>
              <FloorWorkBadge floorWork={prod.job?.floor_work} floorNote={prod.job?.floor_note} dark />
            </div>
            <div className="text-sm truncate" style={{ color: "var(--t-mid)" }}>{prod.job?.customer_name} · {prod.job?.customer_area ?? "—"}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10 shrink-0"><X size={22} /></button>
        </div>

        {/* เลน + สถานะตอนนี้ + progress ขั้นที่ x/n (ให้เห็นชัดว่าใครดูแล อยู่ตรงไหน) */}
        {(() => {
          const lane = PROD_LANE[prod.status];
          const meta = PROD_LANE_META[lane];
          const stepIdx = PROD_FLOW_STEPS.indexOf(prod.status);   // -1 ถ้า ISSUE (ทางแยก)
          return (
            <div className="py-2">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="text-[12px] font-semibold rounded-full px-2.5 py-1" style={{ background: meta.bg, color: meta.fg }}>
                  {meta.icon} {meta.label}
                </span>
              </div>
              <div className="text-center">
                <div className="text-[13px] mb-1.5" style={{ color: "var(--t-low)" }}>
                  ตอนนี้อยู่ขั้น{stepIdx >= 0 ? ` (${stepIdx + 1}/${PROD_FLOW_STEPS.length})` : ""}
                </div>
                <div className="inline-block scale-125"><Chip>{PROD_STATUS[prod.status]}</Chip></div>
              </div>
              {stepIdx >= 0 && (
                <div className="flex items-center justify-center gap-[5px] mt-3">
                  {PROD_FLOW_STEPS.map((s, i) => (
                    <span key={s} title={PROD_STATUS[s]} className="rounded-full transition-all"
                      style={{
                        width: i === stepIdx ? 10 : 7, height: i === stepIdx ? 10 : 7,
                        background: i < stepIdx ? "#34d399" : i === stepIdx ? (lane === "chang" ? "#a7e08a" : "#93c5fd") : "rgba(255,255,255,.22)",
                      }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
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
                            <label className="block text-[13px] mb-1.5 font-medium text-white">
                              {f.label}
                              {f.optional && <span className="ml-1 font-normal text-white/45 text-[11px]">(ไม่บังคับ)</span>}
                            </label>
                            {f.type === "note" ? (
                              <textarea value={vals[f.field] ?? ""} onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value }))} rows={2}
                                placeholder="ระบุหมายเหตุ (ถ้ามี)" aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40" />
                            ) : f.type === "time" ? (
                              <input type="time" step={60} value={vals[f.field] ?? ""} onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value.slice(0, 5) }))} aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-4 py-3 text-base text-white outline-none tnum min-h-[52px]" />
                            ) : f.type === "text" ? (
                              <>
                                <input type="text" list={`field-list-${f.field}`} value={vals[f.field] ?? ""} onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value }))} aria-label={f.label}
                                  placeholder="เช่น เป, เนียน"
                                  className="focusable w-full glass-card rounded-xl px-4 py-3 text-base text-white outline-none min-h-[52px] placeholder-white/35" />
                                <datalist id={`field-list-${f.field}`}>
                                  <option value="เป" />
                                  <option value="เนียน" />
                                </datalist>
                              </>
                            ) : (
                              <DateField value={vals[f.field] ?? ""} onChange={(iso) => setVals(v => ({ ...v, [f.field]: iso }))} aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-4 py-3 text-base text-white outline-none min-h-[52px]" />
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

                {/* undo — กันกดผิด: ย้อนกลับไป "กำลังผลิต" (บล็อกอัตโนมัติถ้าเริ่มติดตั้งแล้ว) */}
                {!undoReadyOpen ? (
                  <button
                    onClick={() => { setUndoReadyOpen(true); setErr(null); }}
                    disabled={saving}
                    className="focusable pressable mt-3 text-[12px] text-white/60 hover:text-white/90 underline underline-offset-2 disabled:opacity-60"
                  >
                    กดผิด? ย้อนกลับไป “กำลังผลิต”
                  </button>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-500/12 p-3 text-left space-y-2">
                    <p className="text-[12px] text-amber-100">
                      ย้อนกลับไปขั้น <b>กำลังผลิต</b>? ระบบจะดึงงานออกจากคิวติดตั้ง (ทำได้เฉพาะงานที่ <b>ยังไม่เริ่มติดตั้ง/ยังไม่นัด</b>)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => patch({ status: "MANUFACTURING" }, { close: true })}
                        disabled={saving}
                        className="focusable pressable flex-1 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-[12px] font-semibold disabled:opacity-60"
                      >
                        {saving ? "กำลังย้อน…" : "ยืนยันย้อนกลับ"}
                      </button>
                      <button
                        onClick={() => setUndoReadyOpen(false)}
                        disabled={saving}
                        className="focusable pressable flex-1 min-h-[40px] rounded-xl glass-card border border-white/15 text-white/80 text-[12px]"
                      >
                        ไม่ย้อน
                      </button>
                    </div>
                  </div>
                )}
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
                    <DateField value={sched} onChange={(iso) => setSched(iso)} aria-label="วันนัดวัด"
                      className="focusable w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none min-h-[48px]" />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>เวลา</label>
                    <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value.slice(0, 5))} aria-label="เวลานัดวัด"
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

                {/* P0-1A: Clash warning — แสดงเมื่อกรอกครบ (วัน+ช่าง) และมีนัดชน */}
                {clashes.length > 0 && sched && measurerName.trim() && (
                  <div className="rounded-2xl border border-yellow-300/35 bg-yellow-500/15 p-3.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <TriangleAlert size={15} className="shrink-0 mt-0.5 text-yellow-300" />
                      <div className="text-[13px] text-yellow-100 font-semibold">
                        นัดอาจชน — {measurerName.trim()} มีนัดใกล้กัน
                        {sched !== new Date().toISOString().slice(0, 10) && (
                          <span className="font-normal"> วัน {thDate(sched)}</span>
                        )}
                      </div>
                    </div>
                    <ul className="space-y-1 pl-1">
                      {clashes.slice(0, 3).map((c) => (
                        <li key={c.entry.production_id} className="text-[12px] text-yellow-200/90">
                          {c.entry.measure_time
                            ? <span className="tnum font-semibold">{normalizeTime(c.entry.measure_time).slice(0, 5)}</span>
                            : null
                          }{c.entry.measure_time ? " " : ""}
                          {c.entry.customer_name ?? "—"}
                          {c.entry.customer_area ? <span className="text-yellow-200/60 ml-1">({c.entry.customer_area})</span> : null}
                          {" — "}
                          {c.diffMin !== null
                            ? <span className="tnum">ห่าง {c.diffMin} นาที</span>
                            : <span>ไม่ระบุเวลา</span>
                          }
                        </li>
                      ))}
                      {clashes.length > 3 && (
                        <li className="text-[12px] text-yellow-200/60">และอีก {clashes.length - 3} งาน</li>
                      )}
                    </ul>
                    <p className="text-[11px] text-yellow-200/55">ไม่บล็อก — บันทึกได้ถ้าจัดเวลาเองไหว</p>
                  </div>
                )}

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
                  <DateField value={installDate} onChange={(iso) => setInstallDate(iso)} aria-label="วันติดตั้งที่กำหนด"
                    className="focusable flex-1 glass-card rounded-xl px-4 py-3 text-base text-white outline-none min-h-[52px]" />
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

            {/* วันกำหนดผลิตเสร็จ (เดดไลน์ช่าง) — บังคับก่อนเริ่มผลิต · ใช้เป็นหัววันในตารางผลิตช่าง */}
            {prod.status !== "READY" && (
              <div className="mt-3 glass-card rounded-2xl p-4 border border-orange-300/25">
                <label className="block text-[13px] mb-1.5 font-medium text-orange-100">วันกำหนดผลิตเสร็จ (เดดไลน์ช่าง)</label>
                <div className="flex gap-2">
                  <DateField value={dueDate} onChange={(iso) => setDueDate(iso)} aria-label="วันกำหนดผลิตเสร็จ"
                    className="focusable flex-1 glass-card rounded-xl px-4 py-3 text-base text-white outline-none min-h-[52px]" />
                  <button
                    onClick={() => patch({ production_due_date: dueDate || null }, { close: false, feedbackKey: "due" })}
                    disabled={saving}
                    className={`focusable pressable px-4 rounded-xl text-white text-sm font-semibold min-h-[52px] disabled:opacity-60 transition-colors ${
                      savedField === "due" ? "bg-orange-400" : "bg-orange-500 hover:bg-orange-400"
                    }`}
                  >
                    {savedField === "due" ? <Check size={16} /> : "บันทึกวัน"}
                  </button>
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--t-low)" }}>ช่างเห็นเป็นเดดไลน์ในตารางผลิต แล้วจัดวันเริ่มผลิตเอง · บังคับกรอกก่อน "เริ่มผลิต"</p>
              </div>
            )}

            {/* ── รายละเอียดผลิต (ชุดงาน) — แทน Excel ทีมผลิต ── */}
            {prod.job_id && <ProductionSetsSection jobId={prod.job_id} canWrite={canWrite} />}
            {/* ใบตัดอลูของงานนี้ — ออฟฟิศเปิด/สร้างจากในโมดัลได้เลย */}
            {prod.job_id && <JobCutlists jobId={prod.job_id} canWrite={canWrite} />}

            {/* ── ข้อ 8: ประวัติการทำงาน — collapsible ล่างสุด ── */}
            {(row.measure_scheduled || row.measure_actual || row.measure_actual_time || row.measured_by_name || row.measurer_name || row.planned_install_date || row.production_queued || row.production_done || row.qc_result) && (
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
                    {row.measure_actual && (
                      <div>วัดจริง:{" "}
                        <span className="tnum text-white/80">{thDate(row.measure_actual)}</span>
                        {row.measure_actual_time && <span className="tnum text-white/70 ml-1">{normalizeTime(row.measure_actual_time)}</span>}
                        {row.measured_by_name && <span className="text-white/70 ml-1">โดย {row.measured_by_name}</span>}
                      </div>
                    )}
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

            {/* ── เครื่องมือแอดมิน: แก้เฟส / ถอยมัดจำ (กรณีใส่ผิด) ── */}
            {(canAdmin || canUndeposit) && (
              <div className="mt-4">
                <button onClick={() => setAdminOpen((v) => !v)} aria-expanded={adminOpen}
                  className="focusable pressable w-full flex items-center justify-between gap-2 text-[12px] px-3 py-2 rounded-xl glass-card border border-white/10 text-white/55 hover:text-white/80">
                  <span>🔧 เครื่องมือแอดมิน (แก้กรณีใส่ผิด)</span>
                  <ChevronRight size={14} className={`transition-transform ${adminOpen ? "rotate-90" : ""}`} />
                </button>
                {adminOpen && (
                  <div className="mt-2 space-y-3">
                    {/* แก้เฟส */}
                    {canAdmin && (
                      <div className="glass-card rounded-2xl p-4 border border-white/10">
                        <div className="text-[13px] font-semibold text-white mb-2">ย้ายเฟสงาน (แก้กรณีกดผิด)</div>
                        <p className="text-[11px] mb-2" style={{ color: "var(--t-low)" }}>ข้ามลำดับปกติได้ เช่น ย้ายจาก "รอติดตั้ง" กลับ "รอวัดจริง"</p>
                        <div className="flex gap-2">
                          <select value={ovStatus} onChange={(e) => setOvStatus(e.target.value as ProdStatus)}
                            aria-label="เลือกเฟสใหม่"
                            className="flex-1 min-w-0 rounded-xl bg-white text-gray-900 border border-white/15 px-3 py-2.5 text-sm min-h-[44px]">
                            {ALL_PROD_STATUSES.map((s) => (
                              <option key={s} value={s}>{PROD_STATUS[s]}{s === prod.status ? " (ปัจจุบัน)" : ""}</option>
                            ))}
                          </select>
                          <button onClick={doOverride} disabled={ovBusy || ovStatus === prod.status}
                            className="focusable pressable shrink-0 rounded-xl px-4 text-sm font-semibold text-white bg-sky-500 min-h-[44px] disabled:opacity-40">
                            {ovBusy ? "…" : "ย้ายเฟส"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ถอยมัดจำ */}
                    {canUndeposit && (
                      <div className="glass-card rounded-2xl p-4 border border-rose-300/25">
                        <div className="text-[13px] font-semibold text-rose-100 mb-1">ถอยมัดจำ · ลบออกจากงานผลิต</div>
                        <p className="text-[11px] mb-2 text-rose-200/80">
                          ดึงงานออกจากผลิต + ยกเลิกมัดจำ (void ไม่ลบทิ้ง) → กลับเป็น "ส่งใบเสนอแล้ว" ·
                          บล็อกอัตโนมัติถ้ามีใบเสร็จ/ใบวางบิล/รับเงินงวดอื่น/ตัดสต๊อกแล้ว
                        </p>
                        {!undepOpen ? (
                          <button onClick={() => { setUndepOpen(true); setAdminErr(null); }}
                            className="focusable pressable w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-100 bg-rose-500/20 border border-rose-300/30 min-h-[44px]">
                            ถอยมัดจำงานนี้…
                          </button>
                        ) : (
                          <div className="space-y-2">
                            {prod.status !== "PENDING_MEASURE" && (
                              <div className="text-[11px] text-amber-200 bg-amber-500/12 border border-amber-300/25 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                                <TriangleAlert size={13} className="shrink-0 mt-0.5" /> งานนี้เข้าเฟสผลิตแล้ว ({PROD_STATUS[prod.status]}) — แน่ใจว่าจะถอย?
                              </div>
                            )}
                            <textarea value={undepReason} onChange={(e) => setUndepReason(e.target.value)} rows={2}
                              placeholder="เหตุผล (บังคับ) เช่น ลงงานผิด / ลูกค้ายกเลิกมัดจำ"
                              className="w-full rounded-xl bg-white text-gray-900 border border-rose-200 px-3 py-2 text-sm outline-none" />
                            <div className="flex gap-2">
                              <button onClick={() => { setUndepOpen(false); setUndepReason(""); }} disabled={undepBusy}
                                className="focusable pressable flex-1 rounded-xl glass-card border border-white/15 text-white/80 text-sm min-h-[44px]">ยกเลิก</button>
                              <button onClick={doUndeposit} disabled={undepBusy || !undepReason.trim()}
                                className="focusable pressable flex-1 rounded-xl bg-rose-600 text-white text-sm font-semibold min-h-[44px] disabled:opacity-40">
                                {undepBusy ? "กำลังถอย…" : "ยืนยันถอยมัดจำ"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {adminErr && <p role="alert" className="text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{adminErr}</p>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>,
    document.body,
  );
}
