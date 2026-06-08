"use client";

/**
 * DesignerSchedule v4 — Gantt timeline (Google Calendar style)
 *
 * Layout (top → bottom):
 *   1. WorkloadBar  — สรุปงานในมือรายคน (คงเดิม)
 *   2. WeekNavigator — เลื่อน ±สัปดาห์ + "วันนี้"
 *   3. Gantt grid   — lane รายช่าง × แกน X = วัน (21 วัน, scroll แนวนอน)
 *      - แถบงาน = ช่วง [start..end], ซ้อนทับ → sub-row (greedy)
 *      - ลาก Pointer Events: เลื่อนทั้งงาน | resize ขอบซ้าย/ขวา
 *      - mobile fallback: คลิกแถบ → popover date picker
 *   4. Legend
 *
 * Light theme: text-ink / text-ink-2 / text-ink-3 / text-brand-dark
 * NO text-white on light backgrounds (only on bg-brand elements like badges).
 */

import {
  useMemo, useState, useRef, useCallback,
} from "react";
import Icon from "@/components/Icon";
import type { DesignerOption } from "@/app/(app)/designer/page";
import type { DesignState } from "@/lib/database.types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Job = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_ref: number | null;
  designer_name: string | null;
  design_state: DesignState;
  design_due_date: string | null;
  design_start: string | null;
  design_revise_count: number;
  overdue: boolean;
};

interface Props {
  jobs: Job[];
  designers: DesignerOption[];
  canWrite: boolean;
  designerFilter: string;
  onRefresh: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_WIDTH = 44;       // px per day column
const LANE_NAME_WIDTH = 140; // px for sticky designer name column
const BAR_HEIGHT = 28;      // px per bar
const ROW_PAD = 6;          // px padding top+bottom per sub-row
const TOTAL_DAYS = 21;      // days shown

// ─── State colours (LIGHT theme: tinted bg + dark text, NO white text) ────────
const STATE_COLOR: Record<DesignState, {
  bg: string; text: string; dot: string; border: string; barBg: string;
}> = {
  NOT_STARTED:      { bg: "bg-slate-50",   text: "text-slate-700",   dot: "#94a3b8", border: "border-slate-300",  barBg: "bg-slate-100"  },
  DRAWING:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "#2563eb", border: "border-blue-300",   barBg: "bg-blue-100"   },
  PENDING_CUSTOMER: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "#d97706", border: "border-amber-300",  barBg: "bg-amber-100"  },
  REVISING:         { bg: "bg-red-50",     text: "text-red-700",     dot: "#B3151D", border: "border-red-300",    barBg: "bg-red-100"    },
  DONE:             { bg: "bg-emerald-50", text: "text-emerald-700", dot: "#059669", border: "border-emerald-300", barBg: "bg-emerald-100" },
};
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  DRAWING: "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอลูกค้า",
  REVISING: "กำลังแก้ไข",
  DONE: "เสร็จแล้ว",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toIso(d);
}
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}
/** diff in whole days (b − a). Positive = b is after a. */
function dayDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

const MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function thShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_SHORT[Number(m) - 1]}`;
}
function weekRangeLabel(startIso: string): string {
  const end = addDays(startIso, TOTAL_DAYS - 1);
  const [, sm, sd] = startIso.split("-");
  const [, em, ed] = end.split("-");
  const startLabel = sm === em ? `${Number(sd)}` : `${Number(sd)} ${MONTH_SHORT[Number(sm) - 1]}`;
  return `${startLabel} – ${Number(ed)} ${MONTH_SHORT[Number(em) - 1]}`;
}
function isWeekend(iso: string): boolean {
  const dow = new Date(iso + "T00:00:00").getDay();
  return dow === 0 || dow === 6;
}

function loadBarColor(f: number): string { return f >= 0.75 ? "bg-brand" : f >= 0.4 ? "bg-amber-400" : "bg-emerald-500"; }
function loadTextColor(f: number): string { return f >= 0.75 ? "text-brand" : f >= 0.4 ? "text-amber-600" : "text-emerald-600"; }

// ─── WorkloadBar (reused from v3) ─────────────────────────────────────────────
function WorkloadBar({
  designers, jobs, designerFilter, today,
}: {
  designers: DesignerOption[];
  jobs: Job[];
  designerFilter: string;
  today: string;
}) {
  const stats = useMemo(() => {
    const map: Record<string, { designer: DesignerOption; active: number; overdue: number }> = {};
    for (const d of designers) map[String(d.id)] = { designer: d, active: 0, overdue: 0 };
    for (const j of jobs) {
      if (j.design_state === "DONE") continue;
      const key = j.designer_ref != null ? String(j.designer_ref) : null;
      if (!key || !map[key]) continue;
      map[key].active += 1;
      if (j.design_due_date && j.design_due_date < today) map[key].overdue += 1;
    }
    return Object.values(map)
      .filter((s) => !designerFilter || String(s.designer.id) === designerFilter)
      .sort((a, b) => b.active - a.active);
  }, [designers, jobs, designerFilter, today]);

  const maxActive = Math.max(1, ...stats.map((s) => s.active));

  return (
    <div className="flex gap-3 flex-wrap">
      {stats.map((s) => {
        const f = s.active / maxActive;
        return (
          <div key={s.designer.id} className="glass-card rounded-2xl p-4 flex-1 min-w-[150px] max-w-[240px]">
            <div className="font-semibold text-sm text-brand-dark truncate">{s.designer.name}</div>
            <div className="flex items-baseline gap-3 mt-1.5">
              <div>
                <span className={`text-2xl font-bold tnum ${loadTextColor(f)}`}>{s.active}</span>
                <span className="text-[11px] text-ink-3 ml-1">งานในมือ</span>
              </div>
              {s.overdue > 0 && (
                <div>
                  <span className="text-base font-bold tnum text-brand">{s.overdue}</span>
                  <span className="text-[11px] text-ink-3 ml-1">เลยกำหนด</span>
                </div>
              )}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${loadBarColor(f)}`}
                style={{ width: `${Math.max(f * 100, s.active > 0 ? 8 : 0)}%` }}
              />
            </div>
            <div className="text-[10px] text-ink-3 mt-1">
              {f >= 0.75 ? "งานเยอะ" : f >= 0.4 ? "พอดี" : s.active === 0 ? "ว่าง" : "งานน้อย"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── WeekNavigator (reused from v3) ───────────────────────────────────────────
function WeekNavigator({
  weekStart, today, onPrev, onNext, onToday,
}: {
  weekStart: string;
  today: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const isCurrentRange = weekStart === mondayOf(today);
  const label = weekRangeLabel(weekStart);
  return (
    <div className="glass-soft rounded-xl px-3 py-2 flex items-center justify-between gap-2">
      <button
        onClick={onPrev}
        className="press inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-brand rounded-lg px-3 py-2 min-h-[44px] min-w-[44px] justify-center"
        aria-label="ช่วงก่อนหน้า"
      >
        <Icon name="arrowLeft" size={16} />
        <span className="hidden sm:inline text-[13px]">ก่อนหน้า</span>
      </button>
      <div className="flex items-center gap-2 flex-1 justify-center">
        <span className="text-sm font-semibold text-brand-dark tnum">{label}</span>
        {isCurrentRange ? (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand">
            ช่วงนี้
          </span>
        ) : (
          <button
            onClick={onToday}
            className="press text-[12px] font-medium text-brand hover:bg-brand/5 rounded-lg px-2 py-1 min-h-[32px]"
          >
            วันนี้
          </button>
        )}
      </div>
      <button
        onClick={onNext}
        className="press inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-brand rounded-lg px-3 py-2 min-h-[44px] min-w-[44px] justify-center"
        aria-label="ช่วงถัดไป"
      >
        <span className="hidden sm:inline text-[13px]">ถัดไป</span>
        <Icon name="arrowLeft" size={16} className="rotate-180" />
      </button>
    </div>
  );
}

// ─── Bar placement (overlap → sub-row via greedy algorithm) ───────────────────
type PlacedBar = {
  job: Job;
  startOffset: number; // days from rangeStart (can be < 0 if bar starts before view)
  endOffset: number;   // days from rangeStart (inclusive), can exceed TOTAL_DAYS
  subRow: number;
};

function placeJobs(jobs: Job[], rangeStart: string, today: string): PlacedBar[] {
  const placed: PlacedBar[] = [];
  // Track end-offset per sub-row to detect overlap
  const subRowEnd: number[] = [];

  for (const job of jobs) {
    // Determine bar start & end ISO dates
    // DONE ใช้ design_end เป็นวันสิ้นสุดจริง (ช่วงเวลาที่ทำจริง) — เก็บเป็นประวัติ
    const rawStart = job.design_start ?? job.design_due_date ?? job.design_end ?? today;
    const rawEnd = (job.design_state === "DONE" ? (job.design_end ?? job.design_due_date) : job.design_due_date) ?? job.design_start ?? today;
    const startIso = rawStart;
    const endIso = rawEnd < rawStart ? rawStart : rawEnd;

    const startOffset = dayDiff(rangeStart, startIso);
    const endOffset = dayDiff(rangeStart, endIso);

    // Only show if bar overlaps with [0, TOTAL_DAYS-1]
    if (endOffset < 0 || startOffset >= TOTAL_DAYS) continue;

    // Greedy sub-row assignment
    let subRow = 0;
    while (subRowEnd[subRow] !== undefined && subRowEnd[subRow] >= startOffset) {
      subRow++;
    }
    subRowEnd[subRow] = endOffset;

    placed.push({ job, startOffset, endOffset, subRow });
  }
  return placed;
}

// ─── DragBar — single Gantt bar with pointer-event drag/resize ─────────────
type DragMode = "move" | "resize-start" | "resize-end" | null;

interface DragBarProps {
  bar: PlacedBar;
  rangeStart: string;
  today: string;
  canWrite: boolean;
  onSave: (jobId: string, newStart: string, newEnd: string) => Promise<void>;
  onClickBar: (bar: PlacedBar) => void;
}

function DragBar({ bar, rangeStart, today, canWrite, onSave, onClickBar }: DragBarProps) {
  const { job, startOffset, endOffset, subRow } = bar;
  const c = STATE_COLOR[job.design_state];
  // งานเสร็จ (DONE) = ประวัติ: แสดงบนไทม์ไลน์แต่ลาก/ขยายไม่ได้
  const editable = canWrite && job.design_state !== "DONE";

  // Local drag state
  const [dragDelta, setDragDelta] = useState(0);
  const [resizeDelta, setResizeDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragMode = useRef<DragMode>(null);
  const startX = useRef(0);
  const hasMoved = useRef(false);

  // Clamp offsets to visible range for display
  const visStart = Math.max(startOffset, 0);
  const visEnd = Math.min(endOffset, TOTAL_DAYS - 1);
  const barDays = endOffset - startOffset + 1;

  // Preview during drag
  let previewLeft = visStart;
  let previewWidth = visEnd - visStart + 1;

  if (isDragging) {
    if (dragMode.current === "move") {
      const newStart = startOffset + dragDelta;
      const newEnd = endOffset + dragDelta;
      previewLeft = Math.max(newStart, 0);
      previewWidth = Math.min(newEnd, TOTAL_DAYS - 1) - previewLeft + 1;
    } else if (dragMode.current === "resize-end") {
      const newEnd = endOffset + resizeDelta;
      const clampedEnd = Math.min(Math.max(newEnd, startOffset), TOTAL_DAYS - 1);
      previewLeft = visStart;
      previewWidth = clampedEnd - previewLeft + 1;
    } else if (dragMode.current === "resize-start") {
      const newStart = startOffset + resizeDelta;
      const clampedStart = Math.max(Math.min(newStart, endOffset), 0);
      previewLeft = clampedStart;
      previewWidth = Math.min(visEnd, TOTAL_DAYS - 1) - previewLeft + 1;
    }
  }

  const top = subRow * (BAR_HEIGHT + ROW_PAD) + ROW_PAD;
  const left = previewLeft * DAY_WIDTH;
  const width = Math.max(previewWidth, 1) * DAY_WIDTH - 2; // -2 px gap

  const isOverdue = job.overdue;
  const barBgClass = isDragging ? "opacity-80 shadow-lg ring-2 ring-brand/40" : "";

  // ── Pointer handlers ──────────────────────────────────────────────────────
  function onPointerDownBar(e: React.PointerEvent) {
    if (!editable) {
      // อ่านอย่างเดียว/งานเสร็จแล้ว — ลากไม่ได้
      return;
    }
    e.stopPropagation();
    dragMode.current = "move";
    startX.current = e.clientX;
    hasMoved.current = false;
    setDragDelta(0);
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerDownResizeEnd(e: React.PointerEvent) {
    e.stopPropagation();
    dragMode.current = "resize-end";
    startX.current = e.clientX;
    hasMoved.current = false;
    setResizeDelta(0);
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerDownResizeStart(e: React.PointerEvent) {
    e.stopPropagation();
    dragMode.current = "resize-start";
    startX.current = e.clientX;
    hasMoved.current = false;
    setResizeDelta(0);
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    const rawDelta = Math.round((e.clientX - startX.current) / DAY_WIDTH);
    if (rawDelta !== 0) hasMoved.current = true;
    if (dragMode.current === "move") {
      setDragDelta(rawDelta);
    } else {
      setResizeDelta(rawDelta);
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    if (!isDragging) return;
    setIsDragging(false);
    const mode = dragMode.current;
    dragMode.current = null;

    const moved = hasMoved.current;
    hasMoved.current = false;

    if (!moved) {
      // Treat as click
      setDragDelta(0);
      setResizeDelta(0);
      onClickBar(bar);
      return;
    }

    // Compute new ISO dates
    let newStartIso = job.design_start ?? job.design_due_date ?? today;
    let newEndIso = job.design_due_date ?? job.design_start ?? today;
    if (newEndIso < newStartIso) newEndIso = newStartIso;

    if (mode === "move") {
      const delta = Math.round((e.clientX - startX.current) / DAY_WIDTH);
      newStartIso = addDays(newStartIso, delta);
      newEndIso = addDays(newEndIso, delta);
      setDragDelta(0);
    } else if (mode === "resize-end") {
      const delta = Math.round((e.clientX - startX.current) / DAY_WIDTH);
      newEndIso = addDays(newEndIso, delta);
      if (newEndIso < newStartIso) newEndIso = newStartIso;
      setResizeDelta(0);
    } else if (mode === "resize-start") {
      const delta = Math.round((e.clientX - startX.current) / DAY_WIDTH);
      newStartIso = addDays(newStartIso, delta);
      if (newStartIso > newEndIso) newStartIso = newEndIso;
      setResizeDelta(0);
    }

    await onSave(job.id, newStartIso, newEndIso);
  }

  // Tooltip text
  const startLabel = thShortDate(job.design_start ?? job.design_due_date ?? job.design_end ?? today);
  const endLabel = thShortDate((job.design_state === "DONE" ? (job.design_end ?? job.design_due_date) : job.design_due_date) ?? job.design_start ?? today);
  const tooltip = `${job.job_code ?? "—"}  |  ${startLabel} – ${endLabel}`;

  return (
    <div
      className={[
        "absolute rounded-md border select-none transition-shadow",
        c.barBg, c.border,
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        job.design_state === "DONE" ? "opacity-60" : "",
        barBgClass,
      ].join(" ")}
      style={{
        top,
        left,
        width,
        height: BAR_HEIGHT,
        zIndex: isDragging ? 30 : 10,
      }}
      title={tooltip}
      onPointerDown={onPointerDownBar}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label={`งาน ${job.job_code ?? ""} ${job.customer_name} (${tooltip})`}
    >
      {/* Resize handle — left edge */}
      {editable && (
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 rounded-l-md"
          onPointerDown={(e) => { e.stopPropagation(); onPointerDownResizeStart(e); }}
          aria-hidden="true"
        />
      )}

      {/* Bar content */}
      <div className="flex items-center gap-1 px-2 h-full overflow-hidden pointer-events-none">
        {isOverdue && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-brand" />
        )}
        <span className={`text-[11px] font-semibold truncate ${c.text}`}>
          {job.customer_name}
        </span>
        {job.design_revise_count > 0 && (
          /* bg-red-100 text-red-800: safe light surface */
          <span className="shrink-0 text-[9px] font-bold bg-red-100 text-red-800 rounded-full px-1 py-0 leading-4 ml-auto">
            แก้{job.design_revise_count}
          </span>
        )}
        {/* Show span only if bar is wide enough */}
        {barDays >= 3 && (
          <span className={`shrink-0 text-[10px] ${c.text} opacity-70 ml-auto`}>
            {barDays}ว
          </span>
        )}
      </div>

      {/* Resize handle — right edge */}
      {editable && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 rounded-r-md"
          onPointerDown={(e) => { e.stopPropagation(); onPointerDownResizeEnd(e); }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ─── BarPopover — mobile/click fallback: edit dates ──────────────────────────
function BarPopover({
  bar,
  today,
  onClose,
  onSave,
}: {
  bar: PlacedBar;
  today: string;
  onClose: () => void;
  onSave: (jobId: string, newStart: string, newEnd: string) => Promise<void>;
}) {
  const { job } = bar;
  const c = STATE_COLOR[job.design_state];
  const [startVal, setStartVal] = useState(
    job.design_start ?? job.design_due_date ?? today
  );
  const [endVal, setEndVal] = useState(
    job.design_due_date ?? job.design_start ?? today
  );
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const s = startVal;
    const e = endVal < startVal ? startVal : endVal;
    await onSave(job.id, s, e);
    setBusy(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Sheet */}
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-gray-200 p-5 w-full max-w-sm mx-3 mb-4 sm:mb-0 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-ink text-sm">{job.customer_name}</div>
            <div className="text-[11px] text-ink-3 mt-0.5">{job.job_code ?? "—"}</div>
          </div>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
            {STATE_TH[job.design_state]}
          </span>
        </div>

        {/* Date inputs */}
        <div className="space-y-2">
          <label className="block">
            <span className="text-[12px] text-ink-2 font-medium">วันเริ่ม</span>
            <input
              type="date"
              value={startVal}
              onChange={(e) => setStartVal(e.target.value)}
              disabled={busy}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/40 tnum disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-2 font-medium">วันกำหนดส่ง</span>
            <input
              type="date"
              value={endVal}
              onChange={(e) => setEndVal(e.target.value)}
              disabled={busy}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/40 tnum disabled:opacity-60"
            />
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={busy}
            className="press flex-1 rounded-xl border border-gray-300 py-2.5 text-sm text-ink-2 font-medium min-h-[44px] hover:bg-gray-50 disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !startVal}
            className="press flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white min-h-[44px] hover:bg-brand/90 disabled:opacity-60 shadow-sm"
          >
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── GanttLane — one designer row ─────────────────────────────────────────────
interface GanttLaneProps {
  designer: DesignerOption;
  jobs: Job[];
  rangeStart: string;
  today: string;
  days: string[];
  canWrite: boolean;
  onSave: (jobId: string, newStart: string, newEnd: string) => Promise<void>;
}

function GanttLane({
  designer, jobs, rangeStart, today, days, canWrite, onSave,
}: GanttLaneProps) {
  const [popoverBar, setPopoverBar] = useState<PlacedBar | null>(null);

  const placed = useMemo(
    () => placeJobs(jobs, rangeStart, today),
    [jobs, rangeStart, today]
  );

  const numSubRows = placed.length === 0
    ? 1
    : Math.max(...placed.map((b) => b.subRow)) + 1;

  const laneHeight = numSubRows * (BAR_HEIGHT + ROW_PAD) + ROW_PAD;

  const totalWidth = days.length * DAY_WIDTH;

  return (
    <>
      <div className="flex border-b border-gray-200" style={{ minHeight: laneHeight }}>
        {/* Sticky name column */}
        <div
          className="sticky left-0 z-20 bg-white border-r border-gray-200 flex flex-col justify-center px-3 shrink-0"
          style={{ width: LANE_NAME_WIDTH }}
        >
          <div className="font-semibold text-[12px] text-brand-dark truncate">{designer.name}</div>
          <div className="text-[10px] text-ink-3 mt-0.5 tnum">
            {jobs.length} งาน
          </div>
        </div>

        {/* Timeline area */}
        <div
          className="relative flex-1 shrink-0"
          style={{ width: totalWidth, minWidth: totalWidth }}
        >
          {/* Day column backgrounds */}
          {days.map((day, i) => (
            <div
              key={day}
              className={[
                "absolute top-0 bottom-0 border-r border-gray-100",
                isWeekend(day) ? "bg-gray-50/70" : "",
                day === today ? "bg-brand/5" : "",
              ].join(" ")}
              style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
            />
          ))}

          {/* Today line */}
          {days.includes(today) && (() => {
            const todayIdx = days.indexOf(today);
            return (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-brand/40 z-10 pointer-events-none"
                style={{ left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2 }}
              />
            );
          })()}

          {/* Bars */}
          {placed.map((b) => (
            <DragBar
              key={b.job.id}
              bar={b}
              rangeStart={rangeStart}
              today={today}
              canWrite={canWrite}
              onSave={onSave}
              onClickBar={setPopoverBar}
            />
          ))}

          {/* Empty lane hint */}
          {placed.length === 0 && (
            <div className="absolute inset-0 flex items-center px-3 pointer-events-none select-none">
              <span className="text-[11px] text-gray-300">— ไม่มีงานในช่วงนี้ —</span>
            </div>
          )}
        </div>
      </div>

      {/* Popover (mobile/click fallback) */}
      {popoverBar && (
        <BarPopover
          bar={popoverBar}
          today={today}
          onClose={() => setPopoverBar(null)}
          onSave={onSave}
        />
      )}
    </>
  );
}

// ─── GanttHeader — fixed day header row ───────────────────────────────────────
function GanttHeader({ days, today }: { days: string[]; today: string }) {
  // Group consecutive days by month for compact month label
  const monthGroups: { label: string; startIdx: number; count: number }[] = [];
  let curMonth = "";
  let curStart = 0;
  for (let i = 0; i < days.length; i++) {
    const [, m] = days[i].split("-");
    const monthLabel = MONTH_SHORT[Number(m) - 1];
    if (monthLabel !== curMonth) {
      if (i > 0) monthGroups.push({ label: curMonth, startIdx: curStart, count: i - curStart });
      curMonth = monthLabel;
      curStart = i;
    }
  }
  monthGroups.push({ label: curMonth, startIdx: curStart, count: days.length - curStart });

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 flex shadow-sm">
      {/* Corner cell */}
      <div
        className="sticky left-0 z-40 bg-white border-r border-gray-200 shrink-0 flex items-center px-3"
        style={{ width: LANE_NAME_WIDTH }}
      >
        <span className="text-[11px] font-semibold text-ink-3">ช่างเขียนแบบ</span>
      </div>

      {/* Day headers */}
      <div className="relative" style={{ width: days.length * DAY_WIDTH, minWidth: days.length * DAY_WIDTH }}>
        {/* Month label row */}
        <div className="flex h-5 border-b border-gray-100">
          {monthGroups.map((g) => (
            <div
              key={g.label + g.startIdx}
              className="flex items-center px-1.5 shrink-0 overflow-hidden"
              style={{ width: g.count * DAY_WIDTH }}
            >
              <span className="text-[10px] font-semibold text-ink-3 truncate">{g.label}</span>
            </div>
          ))}
        </div>

        {/* Day number row */}
        <div className="flex h-7">
          {days.map((day, i) => {
            const [,, d] = day.split("-");
            const isToday = day === today;
            const weekend = isWeekend(day);
            return (
              <div
                key={day}
                className={[
                  "flex items-center justify-center shrink-0 text-[11px] tnum font-medium border-r border-gray-100",
                  isToday
                    ? "bg-brand text-white font-bold rounded-t-sm"
                    : weekend
                    ? "text-gray-400"
                    : "text-ink-2",
                ].join(" ")}
                style={{ width: DAY_WIDTH }}
              >
                {Number(d)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DesignerSchedule({
  jobs, designers, canWrite, designerFilter, onRefresh,
}: Props) {
  const today = isoToday();
  const [rangeStart, setRangeStart] = useState<string>(() => mondayOf(today));

  // 21 days from rangeStart
  const days = useMemo<string[]>(() => {
    const arr: string[] = [];
    for (let i = 0; i < TOTAL_DAYS; i++) arr.push(addDays(rangeStart, i));
    return arr;
  }, [rangeStart]);

  // Active jobs only (exclude DONE)
  const activeJobs = useMemo(
    () => jobs.filter((j) => j.design_state !== "DONE"),
    [jobs]
  );

  // Lanes แสดงงานทั้งหมดรวม DONE (เก็บเป็นประวัติบนไทม์ไลน์) — กรองตามช่าง
  const filteredJobs = useMemo(() => {
    if (!designerFilter) return jobs;
    return jobs.filter((j) => String(j.designer_ref) === designerFilter);
  }, [jobs, designerFilter]);

  // Visible designers (respecting filter)
  const visibleDesigners = useMemo(() => {
    if (designerFilter) return designers.filter((d) => String(d.id) === designerFilter);
    return designers;
  }, [designers, designerFilter]);

  // Jobs per designer (keyed by designer id string)
  const jobsByDesigner = useMemo(() => {
    const map: Record<string, Job[]> = {};
    for (const d of visibleDesigners) map[String(d.id)] = [];
    for (const j of filteredJobs) {
      const key = j.designer_ref != null ? String(j.designer_ref) : null;
      if (key && map[key]) map[key].push(j);
    }
    return map;
  }, [filteredJobs, visibleDesigners]);

  // PATCH design_start + design_due_date
  const handleSave = useCallback(async (
    jobId: string,
    newStart: string,
    newEnd: string,
  ) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          design_start: newStart,
          design_due_date: newEnd,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        console.error("gantt save failed:", json.error);
      }
      await onRefresh();
    } catch (e) {
      console.error("gantt save error:", e);
    }
  }, [onRefresh]);

  if (designers.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-ink-3 text-sm">
        ยังไม่มีช่างเขียนแบบในระบบ
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Workload summary */}
      <WorkloadBar
        designers={designers}
        jobs={activeJobs}
        designerFilter={designerFilter}
        today={today}
      />

      {/* 2. Range navigator */}
      <WeekNavigator
        weekStart={rangeStart}
        today={today}
        onPrev={() => setRangeStart((s) => addDays(s, -7))}
        onNext={() => setRangeStart((s) => addDays(s, 7))}
        onToday={() => setRangeStart(mondayOf(today))}
      />

      {/* 3. Gantt timeline */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div style={{ minWidth: LANE_NAME_WIDTH + TOTAL_DAYS * DAY_WIDTH }}>
            {/* Header */}
            <GanttHeader days={days} today={today} />

            {/* Lanes */}
            {visibleDesigners.length === 0 ? (
              <div className="py-10 text-center text-ink-3 text-sm">
                ไม่มีช่างเขียนแบบที่ตรงกับตัวกรอง
              </div>
            ) : (
              visibleDesigners.map((d) => (
                <GanttLane
                  key={d.id}
                  designer={d}
                  jobs={jobsByDesigner[String(d.id)] ?? []}
                  rangeStart={rangeStart}
                  today={today}
                  days={days}
                  canWrite={canWrite}
                  onSave={handleSave}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-3 px-1">
        {(
          [
            ["NOT_STARTED", "ยังไม่เริ่ม"],
            ["DRAWING", "กำลังเขียนแบบ"],
            ["PENDING_CUSTOMER", "รอลูกค้า"],
            ["REVISING", "กำลังแก้ไข"],
          ] as [DesignState, string][]
        ).map(([st, label]) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm border"
              style={{ background: STATE_COLOR[st].dot + "33", borderColor: STATE_COLOR[st].dot + "66" }}
            />
            {label}
          </span>
        ))}
        {canWrite && (
          <span className="text-ink-3/70">
            · ลากแถบเพื่อเลื่อนงาน · ลากขอบซ้าย/ขวาเพื่อขยายช่วงเวลา · คลิกแถบเพื่อแก้วันบนมือถือ
          </span>
        )}
      </div>
    </div>
  );
}
