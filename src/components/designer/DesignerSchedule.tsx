"use client";

/**
 * DesignerSchedule — per-person schedule view replacing the read-only Gantt tab.
 *
 * Layout:
 *   1. Workload summary bar — one card per designer showing jobs-in-hand count,
 *      overdue count, and a colour-coded load bar (red=heavy, yellow=mid, green=light).
 *   2. Schedule grid — columns = designers, rows = work-days (today + ~14 working days).
 *      Special first row collects overdue / undated active jobs.
 *   3. Clicking a job card (canWrite) opens an inline date picker to reschedule it.
 */

import { useMemo, useState } from "react";
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
  design_revise_count: number;
  overdue: boolean;
};

interface Props {
  jobs: Job[];
  designers: DesignerOption[];
  canWrite: boolean;
  designerFilter: string; // "" = all, else designer id string
  onRefresh: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATE_COLOR: Record<DesignState, { bg: string; text: string; dot: string }> = {
  NOT_STARTED:      { bg: "bg-white/10",      text: "text-white/80",   dot: "#94a3b8" },
  DRAWING:          { bg: "bg-blue-500/20",    text: "text-blue-100",   dot: "#3b82f6" },
  PENDING_CUSTOMER: { bg: "bg-amber-500/20",   text: "text-amber-100",  dot: "#f59e0b" },
  REVISING:         { bg: "bg-brand/25",       text: "text-red-100",    dot: "#B3151D" },
  DONE:             { bg: "bg-emerald-500/20", text: "text-emerald-100",dot: "#10b981" },
};
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED:      "ยังไม่เริ่ม",
  DRAWING:          "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอลูกค้า",
  REVISING:         "กำลังแก้ไข",
  DONE:             "เสร็จแล้ว",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Return next N working days (Mon–Sat, skip Sunday) starting from today (inclusive). */
function workingDays(fromIso: string, count: number): string[] {
  const days: string[] = [];
  const d = new Date(fromIso + "T00:00:00");
  while (days.length < count) {
    if (d.getDay() !== 0) days.push(d.toISOString().slice(0, 10)); // skip Sunday
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Thai short date: "8 มิ.ย." */
const MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                     "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_SHORT[Number(m) - 1]}`;
}
/** Thai day of week short */
const DOW_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
function thDow(iso: string): string {
  return DOW_TH[new Date(iso + "T00:00:00").getDay()];
}

// ─── Workload card colours ────────────────────────────────────────────────────
/** Returns tailwind class based on normalised load fraction (0–1). */
function loadBarColor(fraction: number): string {
  if (fraction >= 0.75) return "bg-brand";
  if (fraction >= 0.4)  return "bg-amber-400";
  return "bg-emerald-400";
}
function loadTextColor(fraction: number): string {
  if (fraction >= 0.75) return "text-brand";
  if (fraction >= 0.4)  return "text-amber-300";
  return "text-emerald-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single job pill inside a schedule cell. */
function JobPill({
  job,
  canWrite,
  onReschedule,
}: {
  job: Job;
  canWrite: boolean;
  onReschedule: (job: Job, newDate: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = STATE_COLOR[job.design_state];

  async function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (!v) return;
    setBusy(true);
    await onReschedule(job, v);
    setBusy(false);
    setEditing(false);
  }

  return (
    <div
      className={`rounded-lg px-2 py-1.5 text-[12px] border border-white/10 ${c.bg} ${c.text} ${
        busy ? "opacity-50" : ""
      }`}
    >
      {/* Job code + revise badge */}
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="font-semibold truncate" title={job.job_code ?? ""}>
          {job.job_code ?? "—"}
        </span>
        {job.design_revise_count > 0 && (
          <span className="shrink-0 text-[10px] font-bold bg-brand text-white rounded-full px-1.5 py-0.5 leading-none">
            แก้ {job.design_revise_count}
          </span>
        )}
      </div>

      {/* Customer name */}
      <div className="truncate mt-0.5 opacity-80" title={job.customer_name}>
        {job.customer_name}
      </div>

      {/* State dot */}
      <div className="flex items-center gap-1 mt-1 opacity-70">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: c.dot }}
        />
        <span className="text-[10px]">{STATE_TH[job.design_state]}</span>
      </div>

      {/* Reschedule (canWrite) */}
      {canWrite && (
        <div className="mt-1.5">
          {editing ? (
            <input
              type="date"
              defaultValue={job.design_due_date ?? ""}
              disabled={busy}
              autoFocus
              onChange={handleDateChange}
              onBlur={() => setEditing(false)}
              className="w-full glass-soft rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:ring-2 focus:ring-brand/50 tnum"
              aria-label="เปลี่ยนวันกำหนดส่งแบบ"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="press inline-flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 rounded px-1 py-0.5 min-h-[28px] focus:ring-2 focus:ring-brand/50"
              aria-label="แก้ไขวันกำหนด"
            >
              <Icon name="calendar" size={10} />
              เปลี่ยนวัน
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Workload summary cards across the top. */
function WorkloadBar({
  designers,
  jobs,
  designerFilter,
  today,
}: {
  designers: DesignerOption[];
  jobs: Job[];
  designerFilter: string;
  today: string;
}) {
  // Build per-designer stats from active (non-DONE) jobs
  const stats = useMemo(() => {
    const map: Record<
      string,
      { designer: DesignerOption; active: number; overdue: number }
    > = {};
    for (const d of designers) {
      map[d.id] = { designer: d, active: 0, overdue: 0 };
    }
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
        const fraction = s.active / maxActive;
        return (
          <div
            key={s.designer.id}
            className="glass-card rounded-2xl p-4 flex-1 min-w-[150px] max-w-[240px]"
          >
            <div className="font-semibold text-sm text-white/90 truncate">
              {s.designer.name}
            </div>

            {/* Active / overdue counts */}
            <div className="flex items-baseline gap-3 mt-1.5">
              <div>
                <span className={`text-2xl font-bold tnum ${loadTextColor(fraction)}`}>
                  {s.active}
                </span>
                <span className="text-[11px] text-white/50 ml-1">งานในมือ</span>
              </div>
              {s.overdue > 0 && (
                <div>
                  <span className="text-base font-bold tnum text-brand">
                    {s.overdue}
                  </span>
                  <span className="text-[11px] text-white/50 ml-1">เลยกำหนด</span>
                </div>
              )}
            </div>

            {/* Load bar */}
            <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${loadBarColor(fraction)}`}
                style={{ width: `${Math.max(fraction * 100, s.active > 0 ? 8 : 0)}%` }}
              />
            </div>
            <div className="text-[10px] text-white/40 mt-1">
              {fraction >= 0.75
                ? "งานเยอะ"
                : fraction >= 0.4
                ? "พอดี"
                : s.active === 0
                ? "ว่าง"
                : "งานน้อย"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DesignerSchedule({
  jobs,
  designers,
  canWrite,
  designerFilter,
  onRefresh,
}: Props) {
  const today = isoToday();

  // Visible designers (respect filter)
  const visibleDesigners = useMemo(
    () =>
      designerFilter
        ? designers.filter((d) => String(d.id) === designerFilter)
        : designers,
    [designers, designerFilter]
  );

  // Working day rows: today + 14 working days
  const days = useMemo(() => workingDays(today, 15), [today]);

  // Active jobs only (exclude DONE for schedule view)
  const activeJobs = useMemo(
    () => jobs.filter((j) => j.design_state !== "DONE"),
    [jobs]
  );

  // Group jobs: by designer_ref → by due date (or "overdue"/"none")
  const byDesignerDate = useMemo(() => {
    const map: Record<string, Record<string, Job[]>> = {};
    for (const d of visibleDesigners) {
      map[d.id] = { __overflow__: [] };
    }
    for (const j of activeJobs) {
      const key = j.designer_ref != null ? String(j.designer_ref) : null;
      if (!key || !map[key]) continue;
      const due = j.design_due_date;
      if (!due || due < today) {
        // Overdue or no date → overflow row
        map[key]["__overflow__"].push(j);
      } else {
        if (!map[key][due]) map[key][due] = [];
        map[key][due].push(j);
      }
    }
    return map;
  }, [activeJobs, visibleDesigners, today]);

  // Reschedule: PATCH /api/jobs/[id] { design_due_date }
  async function reschedule(job: Job, newDate: string) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design_due_date: newDate }),
      });
      if (!res.ok) {
        const j = await res.json();
        console.error("reschedule failed:", j.error);
      }
      await onRefresh();
    } catch (e) {
      console.error("reschedule error:", e);
    }
  }

  if (visibleDesigners.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-white/50 text-sm">
        ยังไม่มีช่างเขียนแบบในระบบ
      </div>
    );
  }

  // Check if every designer has no active jobs
  const totalActive = activeJobs.filter(
    (j) => j.designer_ref != null
  ).length;

  return (
    <div className="space-y-5">
      {/* ── 1. Workload summary ── */}
      <WorkloadBar
        designers={visibleDesigners}
        jobs={activeJobs}
        designerFilter={designerFilter}
        today={today}
      />

      {/* ── 2. Schedule grid ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Horizontal scroll wrapper */}
        <div className="overflow-x-auto">
          <table
            className="border-collapse text-[13px]"
            style={{ minWidth: `${220 + visibleDesigners.length * 180}px` }}
          >
            <colgroup>
              {/* Date label column */}
              <col style={{ width: "100px" }} />
              {visibleDesigners.map((d) => (
                <col key={d.id} style={{ width: "180px" }} />
              ))}
            </colgroup>

            {/* Header row: designer names */}
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-3 py-3 text-left text-[11px] font-medium text-white/40 sticky left-0 bg-white/5 backdrop-blur z-10">
                  วัน / ผู้ออกแบบ
                </th>
                {visibleDesigners.map((d) => (
                  <th
                    key={d.id}
                    className="px-3 py-3 text-left text-sm font-semibold text-white/90 border-l border-white/10"
                  >
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* ── Special overflow row: overdue / no-date ── */}
              <OverflowRow
                designers={visibleDesigners}
                byDesignerDate={byDesignerDate}
                canWrite={canWrite}
                onReschedule={reschedule}
              />

              {/* ── Regular working-day rows ── */}
              {days.map((day) => {
                const isToday = day === today;
                return (
                  <tr
                    key={day}
                    className={`border-t border-white/8 ${
                      isToday ? "bg-brand/10" : "hover:bg-white/3"
                    }`}
                  >
                    {/* Date label cell */}
                    <td
                      className={`px-3 py-2 align-top sticky left-0 backdrop-blur z-10 ${
                        isToday
                          ? "bg-brand/20"
                          : "bg-black/10"
                      }`}
                    >
                      <div
                        className={`text-[11px] font-medium ${
                          isToday ? "text-brand" : "text-white/40"
                        }`}
                      >
                        {thDow(day)}
                      </div>
                      <div
                        className={`font-semibold tnum ${
                          isToday ? "text-white" : "text-white/70"
                        }`}
                      >
                        {thShortDate(day)}
                      </div>
                      {isToday && (
                        <div className="text-[9px] text-brand font-bold mt-0.5">
                          วันนี้
                        </div>
                      )}
                    </td>

                    {/* Per-designer cells */}
                    {visibleDesigners.map((d) => {
                      const cellJobs = byDesignerDate[d.id]?.[day] ?? [];
                      return (
                        <td
                          key={d.id}
                          className={`px-2 py-2 align-top border-l border-white/8 min-h-[56px] ${
                            isToday ? "bg-brand/5" : ""
                          }`}
                        >
                          {cellJobs.length === 0 ? (
                            /* Empty slot — visually quiet but communicates availability */
                            <div className="h-10 flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="text-[10px] text-white/20">—</span>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {cellJobs.map((j) => (
                                <JobPill
                                  key={j.id}
                                  job={j}
                                  canWrite={canWrite}
                                  onReschedule={reschedule}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state when no active jobs at all */}
        {totalActive === 0 && (
          <div className="py-12 text-center text-white/50 text-sm">
            ยังไม่มีงานในมือ — ทุกคนว่าง
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/50 px-1">
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
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: STATE_COLOR[st].dot, opacity: 0.9 }}
            />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-brand/60" />
          แก้ไข
        </span>
      </div>
    </div>
  );
}

// ─── Overflow row (overdue / no date) ─────────────────────────────────────────
function OverflowRow({
  designers,
  byDesignerDate,
  canWrite,
  onReschedule,
}: {
  designers: DesignerOption[];
  byDesignerDate: Record<string, Record<string, Job[]>>;
  canWrite: boolean;
  onReschedule: (job: Job, newDate: string) => void;
}) {
  // Count total overflow jobs to decide whether to render row at all
  const hasOverflow = designers.some(
    (d) => (byDesignerDate[d.id]?.["__overflow__"] ?? []).length > 0
  );

  if (!hasOverflow) return null;

  return (
    <tr className="border-t border-brand/30 bg-brand/8">
      {/* Label cell */}
      <td className="px-3 py-2 align-top sticky left-0 bg-brand/15 backdrop-blur z-10">
        <div className="inline-flex items-center gap-1.5">
          <Icon name="warn" size={12} className="text-brand" />
          <span className="text-[11px] font-semibold text-brand leading-tight">
            เลยกำหนด
            <br />/ ยังไม่กำหนดวัน
          </span>
        </div>
      </td>

      {/* Per-designer overflow cells */}
      {designers.map((d) => {
        const overflowJobs = byDesignerDate[d.id]?.["__overflow__"] ?? [];
        return (
          <td
            key={d.id}
            className="px-2 py-2 align-top border-l border-white/8"
          >
            {overflowJobs.length === 0 ? (
              <span className="text-[10px] text-white/20">—</span>
            ) : (
              <div className="space-y-1.5">
                {overflowJobs.map((j) => (
                  <JobPill
                    key={j.id}
                    job={j}
                    canWrite={canWrite}
                    onReschedule={onReschedule}
                  />
                ))}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}
