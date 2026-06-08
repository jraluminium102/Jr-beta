"use client";

/**
 * DesignerSchedule v3 — Kanban-by-day planner with HTML5 drag & drop.
 *
 * Layout (7 columns, horizontal scroll):
 *   [ยังไม่กำหนด/แก้แทรก] | จันทร์ | อังคาร | พุธ | พฤหัส | ศุกร์ | เสาร์
 *
 * Features:
 *   - WorkloadBar + WeekNavigator (reused from v2)
 *   - HTML5 drag: drag card → drop on day column → PATCH design_due_date
 *   - Drop on "ยังไม่กำหนด" column → design_due_date: null
 *   - Mobile fallback: date-input on each card ("ย้ายวัน")
 *   - Show ALL cards per column (no +N collapse), max-h + overflow-y-auto
 *   - Light theme only: text-ink / text-ink-2 / text-ink-3 / text-brand-dark
 *     NO text-white on light background.
 * NOTE: /designer renders on LIGHT background — never use text-white on cards.
 */

import { useMemo, useState, useRef, useCallback } from "react";
import Icon from "@/components/Icon";
import type { DesignerOption } from "@/app/(app)/designer/page";
import type { DesignState } from "@/lib/database.types";

type Job = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_ref: number | null;
  designer_name: string | null;
  design_state: DesignState;
  design_due_date: string | null;
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

// ─── State colours (LIGHT theme: tinted bg + dark text, NO white text) ───────
const STATE_COLOR: Record<DesignState, { bg: string; text: string; dot: string; border: string }> = {
  NOT_STARTED:      { bg: "bg-slate-50",   text: "text-slate-700",   dot: "#94a3b8", border: "border-slate-200" },
  DRAWING:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "#2563eb", border: "border-blue-200"  },
  PENDING_CUSTOMER: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "#d97706", border: "border-amber-200" },
  REVISING:         { bg: "bg-red-50",     text: "text-red-700",     dot: "#B3151D", border: "border-red-200"   },
  DONE:             { bg: "bg-emerald-50", text: "text-emerald-700", dot: "#059669", border: "border-emerald-200"},
};
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  DRAWING: "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอลูกค้า",
  REVISING: "กำลังแก้ไข",
  DONE: "เสร็จแล้ว",
};

// ─── Date helpers (reused from v2) ────────────────────────────────────────────
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
/** จันทร์ของสัปดาห์ที่ iso อยู่ (อาทิตย์ = ปลายสัปดาห์ก่อนหน้า) */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}
/** 6 วันทำงาน จ–ส */
function weekDays(mondayIso: string): string[] {
  const days: string[] = [];
  for (let i = 0; i < 6; i++) days.push(addDays(mondayIso, i));
  return days;
}

const MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function thShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_SHORT[Number(m) - 1]}`;
}
const DOW_FULL_TH = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
function thDow(iso: string): string {
  return DOW_FULL_TH[new Date(iso + "T00:00:00").getDay()];
}
function weekRangeLabel(mondayIso: string): string {
  const end = addDays(mondayIso, 5);
  const [, sm, sd] = mondayIso.split("-");
  const [, em, ed] = end.split("-");
  const startLabel = sm === em ? `${Number(sd)}` : `${Number(sd)} ${MONTH_SHORT[Number(sm) - 1]}`;
  return `${startLabel} – ${Number(ed)} ${MONTH_SHORT[Number(em) - 1]}`;
}

function loadBarColor(f: number): string { return f >= 0.75 ? "bg-brand" : f >= 0.4 ? "bg-amber-400" : "bg-emerald-500"; }
function loadTextColor(f: number): string { return f >= 0.75 ? "text-brand" : f >= 0.4 ? "text-amber-600" : "text-emerald-600"; }

// ─── WorkloadBar (reused) ─────────────────────────────────────────────────────
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

// ─── WeekNavigator (reused) ───────────────────────────────────────────────────
function WeekNavigator({
  weekStart, today, onPrev, onNext, onToday,
}: {
  weekStart: string;
  today: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const isCurrentWeek = weekStart === mondayOf(today);
  const label = weekRangeLabel(weekStart);
  return (
    <div className="glass-soft rounded-xl px-3 py-2 flex items-center justify-between gap-2">
      <button
        onClick={onPrev}
        className="press inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-brand rounded-lg px-3 py-2 min-h-[44px] min-w-[44px] justify-center"
        aria-label="สัปดาห์ก่อนหน้า"
      >
        <Icon name="arrowLeft" size={16} />
        <span className="hidden sm:inline text-[13px]">ก่อนหน้า</span>
      </button>
      <div className="flex items-center gap-2 flex-1 justify-center">
        <span className="text-sm font-semibold text-brand-dark tnum">{label}</span>
        {isCurrentWeek ? (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand">
            สัปดาห์นี้
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
        aria-label="สัปดาห์ถัดไป"
      >
        <span className="hidden sm:inline text-[13px]">ถัดไป</span>
        <Icon name="arrowLeft" size={16} className="rotate-180" />
      </button>
    </div>
  );
}

// ─── JobCard (draggable planner card) ────────────────────────────────────────
/**
 * Draggable card used inside day columns.
 * Light theme: card bg = state tinted bg, all text uses dark tokens.
 * "แก้ N" badge: bg-red-100 text-red-700 (NOT text-white on light surface).
 * Mobile fallback: date input visible on small screens.
 */
function JobCard({
  job,
  canWrite,
  showDesigner,
  draggingId,
  onDragStart,
  onDragEnd,
  onReschedule,
}: {
  job: Job;
  canWrite: boolean;
  showDesigner: boolean;
  draggingId: string | null;
  onDragStart: (jobId: string) => void;
  onDragEnd: () => void;
  onReschedule: (job: Job, isoDate: string | null) => Promise<void>;
}) {
  const [dateBusy, setDateBusy] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);
  const c = STATE_COLOR[job.design_state];
  const isDragging = draggingId === job.id;

  async function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value || null;
    setDateBusy(true);
    await onReschedule(job, val);
    setDateBusy(false);
    setShowDateInput(false);
  }

  return (
    <div
      draggable={canWrite}
      onDragStart={(e) => {
        e.dataTransfer.setData("jobId", job.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(job.id);
      }}
      onDragEnd={onDragEnd}
      className={[
        "rounded-xl border p-2.5 select-none transition-opacity",
        c.bg, c.border,
        canWrite ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "opacity-40" : "opacity-100",
      ].join(" ")}
      aria-label={`งาน ${job.job_code ?? ""} ${job.customer_name}`}
    >
      {/* Row 1: customer name (prominent) */}
      <div className="font-semibold text-[13px] text-ink truncate" title={job.customer_name}>
        {job.customer_name}
      </div>

      {/* Row 2: job_code + revise badge */}
      <div className="flex items-center justify-between gap-1 mt-0.5 min-w-0">
        <span className="text-[11px] text-ink-3 font-medium tnum truncate">
          {job.job_code ?? "—"}
        </span>
        {job.design_revise_count > 0 && (
          /* bg-red-100 text-red-700: safe on light surface */
          <span className="shrink-0 text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 leading-none">
            แก้ {job.design_revise_count}
          </span>
        )}
      </div>

      {/* Row 3: state dot + label */}
      <div className="flex items-center gap-1 mt-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
        <span className={`text-[11px] font-medium ${c.text}`}>{STATE_TH[job.design_state]}</span>
      </div>

      {/* Row 4: designer badge (only in "ทุกคน" mode) */}
      {showDesigner && job.designer_name && (
        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 border border-gray-200">
          <span className="text-[10px] text-ink-2 font-medium truncate max-w-[90px]">
            {job.designer_name}
          </span>
        </div>
      )}

      {/* Row 5: mobile "ย้ายวัน" fallback (canWrite only) */}
      {canWrite && (
        <div className="mt-2">
          {showDateInput ? (
            <input
              type="date"
              defaultValue={job.design_due_date ?? ""}
              disabled={dateBusy}
              autoFocus
              onChange={handleDateChange}
              onBlur={() => setShowDateInput(false)}
              className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1 text-[11px] text-ink outline-none focus:ring-2 focus:ring-brand/40 tnum"
              aria-label="เลือกวันที่ส่งแบบ"
            />
          ) : (
            <button
              onClick={() => setShowDateInput(true)}
              disabled={dateBusy}
              className="press inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-brand rounded-lg px-1.5 py-1 min-h-[28px] border border-transparent hover:border-gray-200 hover:bg-white/60 transition-colors"
              aria-label="ย้ายวัน"
            >
              <Icon name="calendar" size={10} />
              ย้ายวัน
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DayColumn ────────────────────────────────────────────────────────────────
/**
 * A droppable column for a specific day (or the "ยังไม่กำหนด" overflow column).
 * Highlights when a drag is hovering over it.
 */
function DayColumn({
  colId,
  headerLabel,
  headerSub,
  isToday,
  isOverflow,
  jobs,
  canWrite,
  showDesigner,
  draggingId,
  onDragStart,
  onDragEnd,
  onDrop,
  onReschedule,
}: {
  colId: string; // ISO date string or "__overflow__"
  headerLabel: string;
  headerSub?: string;
  isToday: boolean;
  isOverflow: boolean;
  jobs: Job[];
  canWrite: boolean;
  showDesigner: boolean;
  draggingId: string | null;
  onDragStart: (jobId: string) => void;
  onDragEnd: () => void;
  onDrop: (jobId: string, targetColId: string) => Promise<void>;
  onReschedule: (job: Job, isoDate: string | null) => Promise<void>;
}) {
  const [over, setOver] = useState(false);
  const dragCounter = useRef(0); // track enter/leave for nested children

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    setOver(true);
  }
  function handleDragLeave() {
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setOver(false);
    }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setOver(false);
    const jobId = e.dataTransfer.getData("jobId");
    if (jobId) onDrop(jobId, colId);
  }

  // Column header colours
  const headerBg = isToday
    ? "bg-brand/10 border-brand/30"
    : isOverflow
    ? "bg-red-50 border-red-200/60"
    : "bg-gray-50 border-gray-200/60";
  const headerText = isToday ? "text-brand-dark" : isOverflow ? "text-red-700" : "text-ink-2";
  const badgeBg = isToday
    ? "bg-brand/20 text-brand-dark"
    : isOverflow
    ? "bg-red-100 text-red-700"
    : "bg-gray-200 text-ink-3";

  // Drop zone highlight
  const dropBg = over
    ? "bg-brand/5 border-brand/40 ring-2 ring-brand/20"
    : "bg-white/60 border-gray-200/70";

  return (
    <div
      className="flex flex-col min-w-[200px] w-[220px] shrink-0"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className={`rounded-t-xl border px-3 py-2 ${headerBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={`text-[12px] font-bold truncate ${headerText}`}>{headerLabel}</div>
            {headerSub && (
              <div className={`text-[11px] font-medium tnum ${isToday ? "text-brand" : "text-ink-3"}`}>
                {headerSub}
                {isToday && <span className="ml-1 text-[10px] font-bold text-brand">(วันนี้)</span>}
              </div>
            )}
          </div>
          <span className={`shrink-0 text-[11px] font-bold tnum rounded-full px-1.5 py-0.5 ${badgeBg}`}>
            {jobs.length}
          </span>
        </div>
      </div>

      {/* Cards area (scrollable) */}
      <div
        className={[
          "flex-1 rounded-b-xl border-x border-b p-2 max-h-[60vh] overflow-y-auto space-y-2 transition-colors",
          dropBg,
        ].join(" ")}
      >
        {jobs.length === 0 ? (
          /* Empty hint — visible but muted */
          <div className="flex flex-col items-center justify-center py-8 gap-1.5 pointer-events-none select-none">
            <Icon name="calendar" size={18} className="text-gray-300" />
            <span className="text-[11px] text-gray-300 text-center leading-tight">
              ลากงานมาวางที่นี่
            </span>
          </div>
        ) : (
          jobs.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              canWrite={canWrite}
              showDesigner={showDesigner}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onReschedule={onReschedule}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DesignerSchedule({
  jobs, designers, canWrite, designerFilter, onRefresh,
}: Props) {
  const today = isoToday();
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(today));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 6 working days of the current week (Mon–Sat)
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  // Filter by designer when designerFilter is set
  const activeJobs = useMemo(() => {
    const base = jobs.filter((j) => j.design_state !== "DONE");
    if (!designerFilter) return base;
    return base.filter((j) => String(j.designer_ref) === designerFilter);
  }, [jobs, designerFilter]);

  // Show designer badge only in "all designers" mode
  const showDesigner = !designerFilter;

  /**
   * Group jobs into columns:
   *   "__overflow__" = no due date OR due date in the past (relative to today)
   *   YYYY-MM-DD    = future/today due dates
   */
  const byCol = useMemo(() => {
    const map: Record<string, Job[]> = { __overflow__: [] };
    for (const d of days) map[d] = [];
    for (const j of activeJobs) {
      const due = j.design_due_date;
      if (!due || due < today) {
        map["__overflow__"].push(j);
      } else if (due in map) {
        map[due].push(j);
      } else {
        // due date exists but is NOT in this week → overflow
        map["__overflow__"].push(j);
      }
    }
    return map;
  }, [activeJobs, days, today]);

  // PATCH design_due_date via BFF (null = clear date)
  const reschedule = useCallback(async (job: Job, isoDate: string | null) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design_due_date: isoDate }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error("reschedule failed:", json.error);
      }
      await onRefresh();
    } catch (e) {
      console.error("reschedule error:", e);
    }
  }, [onRefresh]);

  // Called when a card is dropped onto a column
  const handleDrop = useCallback(async (jobId: string, targetColId: string) => {
    const job = activeJobs.find((j) => j.id === jobId);
    if (!job) return;
    const newDate = targetColId === "__overflow__" ? null : targetColId;
    // Skip if no change
    if (newDate === (job.design_due_date ?? null)) return;
    await reschedule(job, newDate);
  }, [activeJobs, reschedule]);

  if (designers.length === 0)
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-ink-3 text-sm">
        ยังไม่มีช่างเขียนแบบในระบบ
      </div>
    );

  return (
    <div className="space-y-5">
      {/* 1. Workload summary per designer */}
      <WorkloadBar
        designers={designers}
        jobs={activeJobs}
        designerFilter={designerFilter}
        today={today}
      />

      {/* 2. Week navigator */}
      <WeekNavigator
        weekStart={weekStart}
        today={today}
        onPrev={() => setWeekStart((ws) => addDays(ws, -7))}
        onNext={() => setWeekStart((ws) => addDays(ws, 7))}
        onToday={() => setWeekStart(mondayOf(today))}
      />

      {/* 3. Kanban board — horizontal scroll, 7 columns */}
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {/* Column 0: ยังไม่กำหนด / แก้แทรก (overflow) */}
          <DayColumn
            colId="__overflow__"
            headerLabel="ยังไม่กำหนด / แก้แทรก"
            isToday={false}
            isOverflow={true}
            jobs={byCol["__overflow__"] ?? []}
            canWrite={canWrite}
            showDesigner={showDesigner}
            draggingId={draggingId}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onDrop={handleDrop}
            onReschedule={reschedule}
          />

          {/* Columns 1–6: Mon–Sat of current week */}
          {days.map((day) => (
            <DayColumn
              key={day}
              colId={day}
              headerLabel={thDow(day)}
              headerSub={thShortDate(day)}
              isToday={day === today}
              isOverflow={false}
              jobs={byCol[day] ?? []}
              canWrite={canWrite}
              showDesigner={showDesigner}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
              onDrop={handleDrop}
              onReschedule={reschedule}
            />
          ))}
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
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATE_COLOR[st].dot }} />
            {label}
          </span>
        ))}
        {canWrite && (
          <span className="text-ink-3/70">
            · ลากการ์ดไปวางคอลัมน์วันที่ต้องการ · กดปุ่ม "ย้ายวัน" บนการ์ดเพื่อระบุวัน (มือถือ)
          </span>
        )}
      </div>
    </div>
  );
}
