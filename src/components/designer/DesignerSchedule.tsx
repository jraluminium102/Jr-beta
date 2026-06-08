"use client";

/**
 * DesignerSchedule — per-person schedule view (light theme, matches the board).
 *   1. Workload summary — jobs-in-hand + overdue + load bar per designer.
 *   2. Schedule grid — columns = designers, rows = work-days; cells = jobs by due date.
 *   3. Click a job (canWrite) → inline date picker to reschedule.
 * NOTE: /designer renders on a LIGHT background → use dark text (text-ink*) not text-white.
 */

import { useMemo, useState } from "react";
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

// ─── State colours (LIGHT theme: tinted bg + dark text) ─────────────────────────
const STATE_COLOR: Record<DesignState, { bg: string; text: string; dot: string }> = {
  NOT_STARTED:      { bg: "bg-slate-100",  text: "text-slate-600",   dot: "#94a3b8" },
  DRAWING:          { bg: "bg-blue-50",    text: "text-blue-700",    dot: "#2563eb" },
  PENDING_CUSTOMER: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "#d97706" },
  REVISING:         { bg: "bg-red-50",     text: "text-red-700",     dot: "#B3151D" },
  DONE:             { bg: "bg-emerald-50", text: "text-emerald-700", dot: "#059669" },
};
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED: "ยังไม่เริ่ม", DRAWING: "กำลังเขียนแบบ", PENDING_CUSTOMER: "รอลูกค้า",
  REVISING: "กำลังแก้ไข", DONE: "เสร็จแล้ว",
};

// ─── Date helpers ───────────────────────────────────────────────────────────────
function isoToday(): string {
  const d = new Date();
  // local date (not UTC) so "today" matches the user's calendar
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function workingDays(fromIso: string, count: number): string[] {
  const days: string[] = [];
  const d = new Date(fromIso + "T00:00:00");
  while (days.length < count) {
    if (d.getDay() !== 0) days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}
const MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function thShortDate(iso: string): string { const [, m, d] = iso.split("-"); return `${Number(d)} ${MONTH_SHORT[Number(m) - 1]}`; }
const DOW_TH = ["อา","จ","อ","พ","พฤ","ศ","ส"];
function thDow(iso: string): string { return DOW_TH[new Date(iso + "T00:00:00").getDay()]; }

function loadBarColor(f: number): string { return f >= 0.75 ? "bg-brand" : f >= 0.4 ? "bg-amber-400" : "bg-emerald-500"; }
function loadTextColor(f: number): string { return f >= 0.75 ? "text-brand" : f >= 0.4 ? "text-amber-600" : "text-emerald-600"; }

// ─── Job pill ───────────────────────────────────────────────────────────────────
function JobPill({ job, canWrite, onReschedule }: { job: Job; canWrite: boolean; onReschedule: (job: Job, d: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = STATE_COLOR[job.design_state];
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    setBusy(true); await onReschedule(job, e.target.value); setBusy(false); setEditing(false);
  }
  return (
    <div className={`rounded-lg px-2 py-1.5 text-[12px] border border-gray-200/80 ${c.bg} ${c.text} ${busy ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="font-semibold truncate" title={job.job_code ?? ""}>{job.job_code ?? "—"}</span>
        {job.design_revise_count > 0 && (
          <span className="shrink-0 text-[10px] font-bold bg-brand text-white rounded-full px-1.5 py-0.5 leading-none">แก้ {job.design_revise_count}</span>
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
            <input type="date" defaultValue={job.design_due_date ?? ""} disabled={busy} autoFocus
              onChange={onChange} onBlur={() => setEditing(false)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 text-[11px] text-ink outline-none focus:ring-2 focus:ring-brand/40 tnum"
              aria-label="เปลี่ยนวันกำหนดส่งแบบ" />
          ) : (
            <button onClick={() => setEditing(true)}
              className="press inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-brand rounded px-1 py-0.5 min-h-[26px]"
              aria-label="แก้ไขวันกำหนด">
              <Icon name="calendar" size={10} /> เปลี่ยนวัน
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Workload summary ───────────────────────────────────────────────────────────
function WorkloadBar({ designers, jobs, designerFilter, today }: { designers: DesignerOption[]; jobs: Job[]; designerFilter: string; today: string }) {
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
              <div><span className={`text-2xl font-bold tnum ${loadTextColor(f)}`}>{s.active}</span><span className="text-[11px] text-ink-3 ml-1">งานในมือ</span></div>
              {s.overdue > 0 && <div><span className="text-base font-bold tnum text-brand">{s.overdue}</span><span className="text-[11px] text-ink-3 ml-1">เลยกำหนด</span></div>}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${loadBarColor(f)}`} style={{ width: `${Math.max(f * 100, s.active > 0 ? 8 : 0)}%` }} />
            </div>
            <div className="text-[10px] text-ink-3 mt-1">{f >= 0.75 ? "งานเยอะ" : f >= 0.4 ? "พอดี" : s.active === 0 ? "ว่าง" : "งานน้อย"}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────────
export default function DesignerSchedule({ jobs, designers, canWrite, designerFilter, onRefresh }: Props) {
  const today = isoToday();
  const visibleDesigners = useMemo(() => designerFilter ? designers.filter((d) => String(d.id) === designerFilter) : designers, [designers, designerFilter]);
  const days = useMemo(() => workingDays(today, 15), [today]);
  const activeJobs = useMemo(() => jobs.filter((j) => j.design_state !== "DONE"), [jobs]);

  const byDesignerDate = useMemo(() => {
    const map: Record<string, Record<string, Job[]>> = {};
    for (const d of visibleDesigners) map[String(d.id)] = { __overflow__: [] };
    for (const j of activeJobs) {
      const key = j.designer_ref != null ? String(j.designer_ref) : null;
      if (!key || !map[key]) continue;
      const due = j.design_due_date;
      if (!due || due < today) map[key]["__overflow__"].push(j);
      else { (map[key][due] ??= []).push(j); }
    }
    return map;
  }, [activeJobs, visibleDesigners, today]);

  async function reschedule(job: Job, newDate: string) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design_due_date: newDate }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); console.error("reschedule failed:", j.error); }
      await onRefresh();
    } catch (e) { console.error("reschedule error:", e); }
  }

  if (visibleDesigners.length === 0)
    return <div className="glass-card rounded-2xl p-10 text-center text-ink-3 text-sm">ยังไม่มีช่างเขียนแบบในระบบ</div>;

  const totalActive = activeJobs.filter((j) => j.designer_ref != null).length;
  const hasOverflow = visibleDesigners.some((d) => (byDesignerDate[String(d.id)]?.["__overflow__"] ?? []).length > 0);

  return (
    <div className="space-y-5">
      <WorkloadBar designers={visibleDesigners} jobs={activeJobs} designerFilter={designerFilter} today={today} />

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse text-[13px] w-full" style={{ minWidth: `${120 + visibleDesigners.length * 170}px` }}>
            <colgroup>
              <col style={{ width: "92px" }} />
              {visibleDesigners.map((d) => <col key={d.id} style={{ width: "170px" }} />)}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-3 py-3 text-left text-[11px] font-medium text-ink-3 sticky left-0 bg-white/80 backdrop-blur z-10">วัน / ผู้ออกแบบ</th>
                {visibleDesigners.map((d) => (
                  <th key={d.id} className="px-3 py-3 text-left text-sm font-semibold text-brand-dark border-l border-gray-200">{d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* overflow row */}
              {hasOverflow && (
                <tr className="border-t border-brand/30 bg-red-50/60">
                  <td className="px-3 py-2 align-top sticky left-0 bg-red-50 backdrop-blur z-10">
                    <div className="inline-flex items-start gap-1.5">
                      <Icon name="warn" size={12} className="text-brand mt-0.5" />
                      <span className="text-[11px] font-semibold text-brand leading-tight">เลยกำหนด<br />/ ยังไม่กำหนด</span>
                    </div>
                  </td>
                  {visibleDesigners.map((d) => {
                    const ov = byDesignerDate[String(d.id)]?.["__overflow__"] ?? [];
                    return (
                      <td key={d.id} className="px-2 py-2 align-top border-l border-gray-200">
                        {ov.length === 0 ? <span className="text-[10px] text-ink-3/50">—</span> :
                          <div className="space-y-1.5">{ov.map((j) => <JobPill key={j.id} job={j} canWrite={canWrite} onReschedule={reschedule} />)}</div>}
                      </td>
                    );
                  })}
                </tr>
              )}
              {/* day rows */}
              {days.map((day) => {
                const isToday = day === today;
                return (
                  <tr key={day} className={`border-t border-gray-200/70 ${isToday ? "bg-brand/5" : "hover:bg-gray-50/60"}`}>
                    <td className={`px-3 py-2 align-top sticky left-0 backdrop-blur z-10 ${isToday ? "bg-brand/15" : "bg-white/80"}`}>
                      <div className={`text-[11px] font-medium ${isToday ? "text-brand" : "text-ink-3"}`}>{thDow(day)}</div>
                      <div className={`font-semibold tnum ${isToday ? "text-brand-dark" : "text-ink-2"}`}>{thShortDate(day)}</div>
                      {isToday && <div className="text-[9px] text-brand font-bold mt-0.5">วันนี้</div>}
                    </td>
                    {visibleDesigners.map((d) => {
                      const cellJobs = byDesignerDate[String(d.id)]?.[day] ?? [];
                      return (
                        <td key={d.id} className="px-2 py-2 align-top border-l border-gray-200/70">
                          {cellJobs.length === 0 ? <div className="h-6" /> :
                            <div className="space-y-1.5">{cellJobs.map((j) => <JobPill key={j.id} job={j} canWrite={canWrite} onReschedule={reschedule} />)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalActive === 0 && <div className="py-12 text-center text-ink-3 text-sm">ยังไม่มีงานในมือ — ทุกคนว่าง</div>}
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-3 px-1">
        {([["NOT_STARTED","ยังไม่เริ่ม"],["DRAWING","กำลังเขียนแบบ"],["PENDING_CUSTOMER","รอลูกค้า"],["REVISING","กำลังแก้ไข"]] as [DesignState, string][]).map(([st, label]) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATE_COLOR[st].dot }} />{label}
          </span>
        ))}
        <span className="text-ink-3/70">· คลิก “เปลี่ยนวัน” บนการ์ดเพื่อจัดตารางเอง</span>
      </div>
    </div>
  );
}
