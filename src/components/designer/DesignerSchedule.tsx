"use client";

/**
 * DesignerSchedule v2 — per-person schedule view (light theme, matches the board).
 *   1. Workload summary — jobs-in-hand + overdue + load bar per designer.
 *   2. Week navigator — เลื่อนทีละสัปดาห์ (จ–ส) แทนการรันยาว 15 วัน.
 *   3. Schedule grid — sticky thead + count badge; columns = designers, rows = work-days.
 *   4. CellStack — แสดงสูงสุด 3 การ์ด/ช่อง; "+N งานอื่น" เปิด popover.
 *   5. JobPill — คลิกเปลี่ยนวัน (PATCH /api/jobs/[id] { design_due_date }).
 * NOTE: /designer renders on a LIGHT background → use dark text (text-ink*), NOT text-white.
 */

import { useMemo, useState, useRef, useEffect } from "react";
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

// ─── State colours (LIGHT theme: tinted bg + dark text) ─────────────────────
const STATE_COLOR: Record<DesignState, { bg: string; text: string; dot: string }> = {
  NOT_STARTED:      { bg: "bg-slate-100",  text: "text-slate-600",   dot: "#94a3b8" },
  DRAWING:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "#2563eb" },
  PENDING_CUSTOMER: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "#d97706" },
  REVISING:         { bg: "bg-red-50",     text: "text-red-700",     dot: "#B3151D" },
  DONE:             { bg: "bg-emerald-50", text: "text-emerald-700", dot: "#059669" },
};
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED: "ยังไม่เริ่ม", DRAWING: "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอลูกค้า", REVISING: "กำลังแก้ไข", DONE: "เสร็จแล้ว",
};

// ─── Date helpers ────────────────────────────────────────────────────────────
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
/** จันทร์ของสัปดาห์ที่ iso อยู่ (อาทิตย์นับเป็นปลายสัปดาห์ก่อนหน้า) */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay(); // 0=อา..6=ส
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}
/** 6 วันทำงาน จ–ส จากวันจันทร์ที่กำหนด */
function weekDays(mondayIso: string): string[] {
  const days: string[] = [];
  for (let i = 0; i < 6; i++) {
    days.push(addDays(mondayIso, i));
  }
  return days;
}

const MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function thShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_SHORT[Number(m) - 1]}`;
}
const DOW_TH = ["อา","จ","อ","พ","พฤ","ศ","ส"];
function thDow(iso: string): string { return DOW_TH[new Date(iso + "T00:00:00").getDay()]; }

/** label ช่วงสัปดาห์: "10 – 15 มิ.ย." หรือ "29 พ.ค. – 3 มิ.ย." ถ้าข้ามเดือน */
function weekRangeLabel(mondayIso: string): string {
  const start = mondayIso;
  const end = addDays(mondayIso, 5);
  const [, sm, sd] = start.split("-");
  const [, em, ed] = end.split("-");
  const startLabel = sm === em
    ? `${Number(sd)}`
    : `${Number(sd)} ${MONTH_SHORT[Number(sm) - 1]}`;
  return `${startLabel} – ${Number(ed)} ${MONTH_SHORT[Number(em) - 1]}`;
}

function loadBarColor(f: number): string { return f >= 0.75 ? "bg-brand" : f >= 0.4 ? "bg-amber-400" : "bg-emerald-500"; }
function loadTextColor(f: number): string { return f >= 0.75 ? "text-brand" : f >= 0.4 ? "text-amber-600" : "text-emerald-600"; }

// ─── Job Pill ────────────────────────────────────────────────────────────────
function JobPill({
  job, canWrite, onReschedule,
}: {
  job: Job;
  canWrite: boolean;
  onReschedule: (job: Job, d: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = STATE_COLOR[job.design_state];

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    setBusy(true);
    await onReschedule(job, e.target.value);
    setBusy(false);
    setEditing(false);
  }

  return (
    <div className={`rounded-lg px-2 py-1.5 text-[12px] border border-gray-200/80 ${c.bg} ${c.text} ${busy ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="font-semibold truncate" title={job.job_code ?? ""}>{job.job_code ?? "—"}</span>
        {job.design_revise_count > 0 && (
          <span className="shrink-0 text-[10px] font-bold bg-brand text-white rounded-full px-1.5 py-0.5 leading-none">
            แก้ {job.design_revise_count}
          </span>
        )}
      </div>
      <div className="truncate mt-0.5" title={job.customer_name}>{job.customer_name}</div>
      <div className="flex items-center gap-1 mt-1 opacity-80">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
        <span className="text-[10px]">{STATE_TH[job.design_state]}</span>
      </div>
      {canWrite && (
        <div className="mt-1.5">
          {editing ? (
            <input
              type="date"
              defaultValue={job.design_due_date ?? ""}
              disabled={busy}
              autoFocus
              onChange={onChange}
              onBlur={() => setEditing(false)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 text-[11px] text-ink outline-none focus:ring-2 focus:ring-brand/40 tnum"
              aria-label="เปลี่ยนวันกำหนดส่งแบบ"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="press inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-brand rounded px-1 py-0.5 min-h-[26px]"
              aria-label="แก้ไขวันกำหนด"
            >
              <Icon name="calendar" size={10} /> เปลี่ยนวัน
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Popover ─────────────────────────────────────────────────────────────────
function Popover({
  jobs, canWrite, onReschedule, onClose,
}: {
  jobs: Job[];
  canWrite: boolean;
  onReschedule: (job: Job, d: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <>
      {/* overlay โปร่งกัน click-through ก่อนถึง ref */}
      <div className="fixed inset-0 z-30" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-xl shadow-lg p-2 max-h-[55vh] overflow-y-auto min-w-[220px] w-full"
        role="dialog"
        aria-label="งานทั้งหมดในช่องนี้"
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-semibold text-ink-2">ทั้งหมด {jobs.length} งาน</span>
          <button
            onClick={onClose}
            className="press p-1 rounded-lg text-ink-3 hover:text-brand min-h-[28px] min-w-[28px] flex items-center justify-center"
            aria-label="ปิด"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="space-y-1.5">
          {jobs.map((j) => (
            <JobPill key={j.id} job={j} canWrite={canWrite} onReschedule={onReschedule} />
          ))}
        </div>
      </div>
    </>
  );
}

// ─── CellStack ───────────────────────────────────────────────────────────────
const MAX_VISIBLE = 3;

function CellStack({
  jobs, canWrite, onReschedule,
}: {
  jobs: Job[];
  canWrite: boolean;
  onReschedule: (job: Job, d: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (jobs.length === 0) return <div className="h-6" />;

  const head = jobs.slice(0, MAX_VISIBLE);
  const rest = jobs.length - MAX_VISIBLE;

  return (
    <div className="space-y-1.5 relative">
      {head.map((j) => (
        <JobPill key={j.id} job={j} canWrite={canWrite} onReschedule={onReschedule} />
      ))}
      {rest > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="press w-full text-[11px] font-medium text-brand hover:bg-brand/5 rounded-lg py-1 min-h-[28px] border border-brand/20"
        >
          +{rest} งานอื่น
        </button>
      )}
      {open && (
        <Popover
          jobs={jobs}
          canWrite={canWrite}
          onReschedule={onReschedule}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─── WorkloadBar ─────────────────────────────────────────────────────────────
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

// ─── WeekNavigator ───────────────────────────────────────────────────────────
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
      {/* ซ้าย: ปุ่มก่อนหน้า */}
      <button
        onClick={onPrev}
        className="press inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-brand rounded-lg px-3 py-2 min-h-[44px] min-w-[44px] justify-center"
        aria-label="สัปดาห์ก่อนหน้า"
      >
        <Icon name="arrowLeft" size={16} />
        <span className="hidden sm:inline text-[13px]">ก่อนหน้า</span>
      </button>

      {/* กลาง: ช่วงสัปดาห์ */}
      <div className="flex items-center gap-2 flex-1 justify-center">
        <span className="text-sm font-semibold text-brand-dark tnum">{label}</span>
        {isCurrentWeek && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand">
            สัปดาห์นี้
          </span>
        )}
        {!isCurrentWeek && (
          <button
            onClick={onToday}
            className="press text-[12px] font-medium text-brand hover:bg-brand/5 rounded-lg px-2 py-1 min-h-[32px]"
          >
            วันนี้
          </button>
        )}
      </div>

      {/* ขวา: ปุ่มถัดไป */}
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

// ─── Main ────────────────────────────────────────────────────────────────────
export default function DesignerSchedule({
  jobs, designers, canWrite, designerFilter, onRefresh,
}: Props) {
  const today = isoToday();
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(today));

  const visibleDesigners = useMemo(
    () => designerFilter ? designers.filter((d) => String(d.id) === designerFilter) : designers,
    [designers, designerFilter],
  );

  // วัน 6 วันของสัปดาห์ที่กำลังดู (จ–ส)
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.design_state !== "DONE"),
    [jobs],
  );

  // นับงานในมือต่อคน (ทุกสัปดาห์ — ตรงกับ WorkloadBar)
  const activeCountByDesigner = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of visibleDesigners) counts[String(d.id)] = 0;
    for (const j of activeJobs) {
      const key = j.designer_ref != null ? String(j.designer_ref) : null;
      if (!key || !(key in counts)) continue;
      counts[key] += 1;
    }
    return counts;
  }, [activeJobs, visibleDesigners]);

  // จัดกลุ่ม: byDesignerDate[designerId][isoDate | "__overflow__"] = Job[]
  // __overflow__ = เลยกำหนด (due < today) หรือยังไม่กำหนด
  const byDesignerDate = useMemo(() => {
    const map: Record<string, Record<string, Job[]>> = {};
    for (const d of visibleDesigners) map[String(d.id)] = { __overflow__: [] };
    for (const j of activeJobs) {
      const key = j.designer_ref != null ? String(j.designer_ref) : null;
      if (!key || !map[key]) continue;
      const due = j.design_due_date;
      if (!due || due < today) {
        map[key]["__overflow__"].push(j);
      } else {
        (map[key][due] ??= []).push(j);
      }
    }
    return map;
  }, [activeJobs, visibleDesigners, today]);

  async function reschedule(job: Job, newDate: string) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design_due_date: newDate }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.error("reschedule failed:", j.error);
      }
      await onRefresh();
    } catch (e) {
      console.error("reschedule error:", e);
    }
  }

  if (visibleDesigners.length === 0)
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-ink-3 text-sm">
        ยังไม่มีช่างเขียนแบบในระบบ
      </div>
    );

  const totalActive = activeJobs.filter((j) => j.designer_ref != null).length;
  const hasOverflow = visibleDesigners.some(
    (d) => (byDesignerDate[String(d.id)]?.["__overflow__"] ?? []).length > 0,
  );

  return (
    <div className="space-y-5">
      {/* 1. Workload bar — เดิม ไม่แก้ */}
      <WorkloadBar
        designers={visibleDesigners}
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

      {/* 3. Schedule table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="border-collapse text-[13px] w-full"
            style={{ minWidth: `${120 + visibleDesigners.length * 180}px` }}
          >
            <colgroup>
              <col style={{ width: "100px" }} />
              {visibleDesigners.map((d) => <col key={d.id} style={{ width: "180px" }} />)}
            </colgroup>

            {/* sticky thead */}
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-200">
                {/* มุมซ้ายบน — sticky ทั้ง x และ y (z สูงสุด) */}
                <th className="px-3 py-3 text-left text-[11px] font-medium text-ink-3 sticky left-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
                  วันกำหนดส่ง
                </th>
                {visibleDesigners.map((d) => (
                  <th
                    key={d.id}
                    className="px-3 py-3 text-left border-l border-gray-200 bg-white/95 backdrop-blur"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-sm font-semibold text-brand-dark truncate">{d.name}</span>
                      <span className="shrink-0 text-[11px] font-bold tnum rounded-full px-1.5 py-0.5 bg-brand/10 text-brand">
                        {activeCountByDesigner[String(d.id)] ?? 0}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* overflow row — แสดงทุกสัปดาห์ ไม่ผูกกับ weekStart */}
              {hasOverflow && (
                <tr className="border-t border-brand/30 bg-red-50/60">
                  <td className="px-3 py-2 align-top sticky left-0 z-10 bg-red-50 backdrop-blur">
                    <div className="inline-flex items-start gap-1.5">
                      <Icon name="warn" size={12} className="text-brand mt-0.5 shrink-0" />
                      <span className="text-[11px] font-semibold text-brand leading-tight">
                        เลยกำหนด<br />/ ยังไม่กำหนด
                      </span>
                    </div>
                  </td>
                  {visibleDesigners.map((d) => {
                    const ov = byDesignerDate[String(d.id)]?.["__overflow__"] ?? [];
                    return (
                      <td key={d.id} className="px-2 py-2 align-top border-l border-gray-200">
                        {ov.length === 0 ? (
                          <span className="text-[10px] text-ink-3/50">—</span>
                        ) : (
                          <CellStack jobs={ov} canWrite={canWrite} onReschedule={reschedule} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* day rows — 6 วัน จ–ส ของสัปดาห์ที่กำลังดู */}
              {days.map((day) => {
                const isToday = day === today;
                return (
                  <tr
                    key={day}
                    className={`border-t border-gray-200/70 ${isToday ? "bg-brand/5" : "hover:bg-gray-50/60"}`}
                  >
                    {/* เซลซ้าย sticky */}
                    <td
                      className={`px-3 py-2 align-top sticky left-0 z-10 backdrop-blur ${isToday ? "bg-brand/15" : "bg-white/80"}`}
                    >
                      <div className={`text-[11px] font-medium ${isToday ? "text-brand" : "text-ink-3"}`}>
                        {thDow(day)}
                      </div>
                      <div className={`font-semibold tnum ${isToday ? "text-brand-dark" : "text-ink-2"}`}>
                        {thShortDate(day)}
                      </div>
                      {isToday && (
                        <div className="text-[9px] text-brand font-bold mt-0.5">วันนี้</div>
                      )}
                    </td>

                    {/* เซลแต่ละช่าง */}
                    {visibleDesigners.map((d) => {
                      const cellJobs = byDesignerDate[String(d.id)]?.[day] ?? [];
                      return (
                        <td key={d.id} className="px-2 py-2 align-top border-l border-gray-200/70">
                          <CellStack jobs={cellJobs} canWrite={canWrite} onReschedule={reschedule} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalActive === 0 && (
          <div className="py-12 text-center text-ink-3 text-sm">ยังไม่มีงานในมือ — ทุกคนว่าง</div>
        )}
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
        <span className="text-ink-3/70">
          · ใช้ ← → เลื่อนสัปดาห์ · คลิก "เปลี่ยนวัน" บนการ์ดเพื่อจัดตารางเอง · "+N งานอื่น" เปิดรายการเต็ม
        </span>
      </div>
    </div>
  );
}
