"use client";
/**
 * FollowUpHubClient — หน้า "ติดตามงาน" รวม 4 แท็บ
 *   1. ปิดการขาย (default)  — stage 3-8  → /api/sales-closure
 *   2. ผลิต                  — stage 9-19 → /api/followup?group=production
 *   3. ติดตั้ง               — stage 20-24→ /api/followup?group=install
 *   4. ปัญหา                 — open_issues>0 ทุก stage 3-24 → /api/issues
 *
 * reuse: ClosureActions, IssueTrackTable, PhaseChip, StatCard, EmptyState, Spinner, JobDrawer
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn, baht, thDate } from "@/lib/format";
import { PHASE_META, type PhaseKey } from "@/lib/followup";
import { STAGE_NAMES } from "@/lib/stages";
import { Spinner, StatCard, EmptyState } from "@/components/ui/primitives";
import { Search, Clock, TriangleAlert, ChevronRight, Phone, Plus } from "@/components/ui/icons";
import { JobDrawer } from "@/components/jobs/JobDrawer";
import { ClosureActions } from "@/components/sales-closure/ClosureActions";
import { IssueTrackTable, type IssueTrackRow } from "@/components/issues/IssueTrackTable";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
import type { ClosureRow } from "@/app/api/sales-closure/route";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
type TrackRow = {
  id: string; job_code: string; customer_name: string; customer_tel: string | null;
  customer_area: string | null; status: string; current_stage: number;
  estimator: string | null; remark: string | null;
  phase: PhaseKey; days_in_phase: number; overdue: boolean; on_hold: boolean;
  open_issues: number; high_issue: boolean; planned_install_date: string | null;
  net: number | null; has_billed: boolean;
};

type Tab = "closure" | "production" | "install" | "issues";

// ────────────────────────────────────────────────────────────────────────────
// stage chip colours — ขยายจาก StageBadge ใน sales-closure/page.tsx
// ────────────────────────────────────────────────────────────────────────────
const STAGE_CHIP: Record<number, string> = {
  3: "bg-slate-500/20 text-slate-100 border-slate-300/25",
  4: "bg-sky-400/20 text-sky-100 border-sky-300/25",
  5: "bg-sky-500/20 text-sky-100 border-sky-300/25",
  6: "bg-amber-500/20 text-amber-100 border-amber-300/25",
  7: "bg-violet-500/20 text-violet-100 border-violet-300/25",
  8: "bg-emerald-500/20 text-emerald-100 border-emerald-300/25",
};

function StageBadge({ stage }: { stage: number }) {
  const name = STAGE_NAMES[stage] ?? `ขั้น ${stage}`;
  const cls = STAGE_CHIP[stage] ?? "bg-white/10 text-white/80 border-white/20";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border tnum whitespace-nowrap", cls)}>
      {stage} · {name}
    </span>
  );
}

function PhaseChip({ phase }: { phase: PhaseKey }) {
  const m = PHASE_META[phase];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border whitespace-nowrap", m.chip)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} /> {m.th}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TabBar
// ────────────────────────────────────────────────────────────────────────────
type TabMeta = {
  key: Tab;
  label: string;
  count?: number;
  highIssue?: boolean;
};

function TabBar({ active, tabs, onChange }: { active: Tab; tabs: TabMeta[]; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 mb-4 no-scrollbar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "focusable pressable inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] whitespace-nowrap border transition-all shrink-0",
            active === t.key
              ? "bg-white text-brand-dark border-white shadow-md"
              : "glass-card text-white/85 border-white/15 hover:bg-white/12"
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold tnum",
              t.key === "issues"
                ? t.highIssue ? "bg-rose-500 text-white" : "bg-amber-500/90 text-white"
                : active === t.key ? "bg-brand-dark/15 text-brand-dark" : "bg-white/20 text-white"
            )}>
              {t.count}
            </span>
          )}
          {t.key === "issues" && t.highIssue && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-label="มีปัญหา HIGH" />
          )}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Filter bar (shared)
// ────────────────────────────────────────────────────────────────────────────
type FilterState = {
  q: string; onlyOverdue: boolean; onlyIssue: boolean; my: boolean;
  stageFilter: string; // เฉพาะแท็บ closure
};

function FilterBar({
  state, onChange, isSales, showStageFilter,
}: {
  state: FilterState;
  onChange: (s: Partial<FilterState>) => void;
  isSales: boolean;
  showStageFilter: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {/* ค้นหา */}
      <label className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 flex-1 min-w-[180px] min-h-[44px] focusable" style={{ color: "var(--t-mid)" }}>
        <Search size={18} />
        <input
          value={state.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="ค้นหาชื่อลูกค้า / Job ID"
          aria-label="ค้นหา"
          className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full"
        />
      </label>

      {/* sub-filter stage dropdown เฉพาะแท็บปิดการขาย */}
      {showStageFilter && (
        <select
          value={state.stageFilter}
          onChange={(e) => onChange({ stageFilter: e.target.value })}
          aria-label="กรองตามขั้น"
          className="focusable glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] [&>option]:text-gray-800"
        >
          <option value="">ทุกขั้น (3-8)</option>
          {[3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={String(s)}>{s} · {STAGE_NAMES[s]}</option>
          ))}
        </select>
      )}

      {/* toggle ค้างนาน */}
      <button
        onClick={() => onChange({ onlyOverdue: !state.onlyOverdue })}
        aria-pressed={state.onlyOverdue}
        className={cn(
          "focusable pressable rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] inline-flex items-center gap-1.5 border",
          state.onlyOverdue ? "bg-amber-400 text-amber-950 border-amber-300" : "glass-card text-white border-white/15"
        )}
      >
        <Clock size={16} /> ค้างนาน
      </button>

      {/* toggle มีปัญหา */}
      <button
        onClick={() => onChange({ onlyIssue: !state.onlyIssue })}
        aria-pressed={state.onlyIssue}
        className={cn(
          "focusable pressable rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] inline-flex items-center gap-1.5 border",
          state.onlyIssue ? "bg-rose-400 text-rose-950 border-rose-300" : "glass-card text-white border-white/15"
        )}
      >
        <TriangleAlert size={16} /> มีปัญหา
      </button>

      {/* toggle ของฉัน — SALES บังคับ my=1 ซ่อนปุ่ม */}
      {!isSales && (
        <button
          onClick={() => onChange({ my: !state.my })}
          aria-pressed={state.my}
          className={cn(
            "focusable pressable rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] inline-flex items-center gap-1.5 border",
            state.my ? "bg-sky-400 text-sky-950 border-sky-300" : "glass-card text-white border-white/15"
          )}
        >
          ของฉัน
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// แท็บ "ปิดการขาย" — reuse ClosureActions
// ────────────────────────────────────────────────────────────────────────────
function ClosureTab({ isSales, filters }: {
  isSales: boolean;
  filters: FilterState;
}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.stageFilter) params.set("stage", filters.stageFilter);
  if (filters.my || isSales) params.set("my", "1");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sales-closure-hub", filters.q, filters.stageFilter, filters.my, isSales],
    queryFn: () => api.get<ClosureRow[]>(`/sales-closure?${params}`),
    refetchOnWindowFocus: true,
  });

  const allRows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const netSum = (data?.meta?.net_sum as number) ?? allRows.reduce((s, r) => s + (r.net ?? 0), 0);
  const waiting7 = (data?.meta?.waiting_7 as number) ?? allRows.filter((r) => (r.days_waiting ?? 0) > 7).length;

  // client-side overdue+issue filter (closure API ไม่มี param เหล่านี้)
  let rows = allRows;
  if (filters.onlyOverdue) rows = rows.filter((r) => (r.days_waiting ?? 0) > 7);
  if (filters.onlyIssue) rows = rows.filter((r) => r.remark != null && r.remark !== "");

  // Stats
  const total = allRows.length;

  return (
    <>
      {/* stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="รอปิดการขาย" value={total} sub="ขั้น 3-8" />
        <StatCard label="ค้างนาน >7 วัน" value={waiting7} accent="text-amber-300" />
        <StatCard label="ยอดรวมใบเสนอ" value={`${baht(netSum)} ฿`} accent="text-sky-200" />
        <StatCard label="รอ >7 วัน" value={allRows.filter((r) => (r.days_waiting ?? 0) > 7).length} sub="จากวันส่งใบเสนอ" accent="text-rose-300" />
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title="ไม่มีงานรอปิดการขาย" sub="เมื่องานเข้าขั้น 3-8 จะปรากฏที่นี่" />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                    <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                    <th className="text-left font-medium px-4 py-3">ขั้น</th>
                    <th className="text-right font-medium px-4 py-3">ยอดสุทธิ</th>
                    <th className="text-left font-medium px-4 py-3">รอ / โน้ต</th>
                    <th className="text-left font-medium px-4 py-3">ผู้ดูแล</th>
                    {canWrite && <th className="text-center font-medium px-4 py-3">ดำเนินการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const overdue7 = (row.days_waiting ?? 0) > 7;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-white/6 hover:bg-white/8 transition-colors",
                          row.current_stage === 8 && "border-l-2 border-l-emerald-400"
                        )}
                      >
                        {/* Job / ลูกค้า */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {row.customer_tel && (
                              <a href={`tel:${row.customer_tel}`}
                                aria-label={`โทร ${row.customer_tel}`}
                                className="focusable inline-flex items-center justify-center w-9 h-9 rounded-xl bg-sky-400/15 text-sky-200 hover:bg-sky-400/30 shrink-0 min-h-[44px] min-w-[36px]"
                                onClick={(e) => e.stopPropagation()}>
                                <Phone size={15} />
                              </a>
                            )}
                            <div className="min-w-0">
                              <div className="text-white font-medium tnum">{row.job_code ?? "—"}</div>
                              <div className="text-white/90">{row.customer_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StageBadge stage={row.current_stage} />
                          {/* stage 8: ปุ่มรับมัดจำ */}
                          {row.current_stage === 8 && (
                            <a href={`/jobs?open=${row.id}`}
                              className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-500/20 text-emerald-100 border border-emerald-300/30 hover:bg-emerald-500/35 transition">
                              รับมัดจำ
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tnum text-white/90">
                          {row.net != null ? `${baht(row.net)} ฿` : <span style={{ color: "var(--t-low)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {row.days_waiting != null && (
                            <div className={cn("text-[12px] tnum mb-1", overdue7 ? "text-rose-300 font-semibold" : "text-white/60")}>
                              รอ {row.days_waiting} วัน
                            </div>
                          )}
                          {row.remark && (
                            <div className="text-[11px] italic max-w-[200px] truncate" style={{ color: "var(--t-mid)" }}>
                              {row.remark}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{row.estimator_name ?? "—"}</td>
                        {canWrite && (
                          <td className="px-4 py-3 text-center">
                            <ClosureActions job={row} onRevised={refetch} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => {
              const overdue7 = (row.days_waiting ?? 0) > 7;
              return (
                <div key={row.id} className={cn(
                  "glass-card rounded-2xl p-4 space-y-2.5",
                  row.current_stage === 8 && "border-l-2 border-emerald-400"
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</div>
                      <div className="text-white/80 text-sm mt-0.5">{row.customer_name}</div>
                    </div>
                    <StageBadge stage={row.current_stage} />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {row.customer_tel && (
                      <a href={`tel:${row.customer_tel}`}
                        className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-400/15 text-sky-200 border border-sky-300/20 text-[12px] min-h-[40px]">
                        <Phone size={14} /> {row.customer_tel}
                      </a>
                    )}
                    {row.net != null && (
                      <span className="text-[12px] tnum ml-auto" style={{ color: "var(--t-mid)" }}>{baht(row.net)} ฿</span>
                    )}
                  </div>

                  {(row.days_waiting != null || row.remark) && (
                    <div className="text-[12px] space-y-0.5">
                      {row.days_waiting != null && (
                        <div className={cn("tnum", overdue7 ? "text-rose-300 font-semibold" : "text-white/60")}>
                          รอ {row.days_waiting} วัน
                        </div>
                      )}
                      {row.remark && <div className="italic" style={{ color: "var(--t-mid)" }}>{row.remark}</div>}
                    </div>
                  )}

                  {row.current_stage === 8 && (
                    <a href={`/jobs?open=${row.id}`}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold bg-emerald-500/20 text-emerald-100 border border-emerald-300/30">
                      รับมัดจำ
                    </a>
                  )}

                  {canWrite && <ClosureActions job={row} onRevised={refetch} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TrackCard — ใช้ร่วมกันแท็บ "ผลิต" และ "ติดตั้ง"
// ────────────────────────────────────────────────────────────────────────────
function TrackCard({ row, variant, onClick }: {
  row: TrackRow;
  variant: "production" | "install";
  onClick: () => void;
}) {
  const leftBorder = row.high_issue
    ? "border-l-rose-500"
    : row.overdue
    ? "border-l-amber-400"
    : row.on_hold
    ? "opacity-60"
    : "";

  return (
    <button
      onClick={onClick}
      className={cn("focusable pressable w-full text-left glass-card rounded-2xl p-4 border-l-2 border-l-transparent", leftBorder)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</span>
            <span className="text-white/80 text-sm">{row.customer_name}</span>
            {row.on_hold && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/15 text-white/80">พัก</span>
            )}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--t-low)" }}>
            {row.customer_area ?? row.customer_tel ?? ""}
            {row.estimator && ` · ${row.estimator}`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <PhaseChip phase={row.phase} />
          {row.open_issues > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-semibold tnum",
              row.high_issue ? "bg-rose-500" : "bg-amber-500/90"
            )}>
              {row.open_issues}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 text-[12px] flex-wrap">
        <span className={cn("tnum", row.overdue ? "text-amber-300 font-semibold" : "text-white/70")}>
          ค้าง {row.days_in_phase} วัน{row.overdue ? " (เกิน)" : ""}
        </span>
        {row.planned_install_date && (
          <span style={{ color: "var(--t-mid)" }}>
            นัด {thDate(row.planned_install_date)}
          </span>
        )}
        {row.remark && (
          <span className="italic truncate max-w-[160px]" style={{ color: "var(--t-low)" }}>{row.remark}</span>
        )}
      </div>

      <div className="flex items-center justify-end mt-2">
        <a
          href={variant === "production" ? "/production" : "/installation"}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[12px] text-sky-300 hover:underline"
        >
          {variant === "production" ? "ไปผลิต" : "ไปติดตั้ง"} <ChevronRight size={14} />
        </a>
      </div>
    </button>
  );
}

// Desktop row สำหรับ production/install
function TrackTableRow({ row, onClick }: { row: TrackRow; onClick: () => void }) {
  const rowCls = row.high_issue
    ? "border-l-2 border-l-rose-500"
    : row.overdue
    ? "border-l-2 border-l-amber-400"
    : row.on_hold
    ? "opacity-60"
    : "";

  return (
    <tr
      key={row.id}
      tabIndex={0}
      role="button"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn("focusable border-b border-white/6 hover:bg-white/10 cursor-pointer group", rowCls)}
    >
      <td className="px-4 py-3">
        <div className="text-white font-medium tnum">{row.job_code ?? "—"}</div>
        <div className="text-white/90">{row.customer_name}</div>
        <div className="text-[12px]" style={{ color: "var(--t-low)" }}>{row.customer_area ?? row.customer_tel ?? ""}</div>
      </td>
      <td className="px-4 py-3">
        <PhaseChip phase={row.phase} />
        {row.on_hold && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-white/15 text-white/80">พัก</span>}
      </td>
      <td className="px-4 py-3">
        <span className={cn("tnum", row.overdue ? "text-amber-300 font-semibold" : "text-white/80")}>{row.days_in_phase} วัน</span>
        {row.overdue && <span className="ml-1 text-[11px] text-amber-300">เกิน</span>}
      </td>
      <td className="px-4 py-3 text-center">
        {row.open_issues > 0
          ? <span className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-semibold tnum", row.high_issue ? "bg-rose-500" : "bg-amber-500/90")}>{row.open_issues}</span>
          : <span style={{ color: "var(--t-low)" }}>—</span>}
      </td>
      <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>
        {row.planned_install_date ? thDate(row.planned_install_date) : "—"}
      </td>
      <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{row.estimator ?? "—"}</td>
      <td className="px-2 text-white/30 group-hover:text-white/70"><ChevronRight size={16} /></td>
    </tr>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// แท็บ "ผลิต" และ "ติดตั้ง" (shared component)
// ────────────────────────────────────────────────────────────────────────────
function TrackTab({ group, filters, isSales }: {
  group: "production" | "install";
  filters: FilterState;
  isSales: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const params = new URLSearchParams();
  params.set("group", group);
  if (filters.q) params.set("q", filters.q);
  if (filters.onlyIssue) params.set("issue", "1");
  if (filters.onlyOverdue) params.set("overdue", "1");
  if (filters.my || isSales) params.set("my", "1");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["followup-hub", group, filters.q, filters.onlyIssue, filters.onlyOverdue, filters.my, isSales],
    queryFn: () => api.get<TrackRow[]>(`/followup?${params}`),
    enabled: true,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};
  const total = (meta.total as number) ?? rows.length;
  const overdue = (meta.overdue as number) ?? 0;
  const withIssues = (meta.with_issues as number) ?? 0;
  const maxDays = (meta.max_days as number) ?? 0;
  const isProd = group === "production";

  const emptyTitle = isProd ? "ไม่มีงานในสายผลิต" : "ไม่มีงานรอติดตั้ง";
  const emptyStage = isProd ? "ขั้น 9-19" : "ขั้น 20-24";

  return (
    <>
      {/* stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label={isProd ? "งานในผลิต" : "งานรอติดตั้ง"} value={total} />
        <StatCard label="ค้างนาน" value={overdue} accent="text-amber-300" />
        <StatCard label="มีปัญหา" value={withIssues} accent="text-rose-300" />
        <StatCard label="ค้างนานสุด" value={`${maxDays} วัน`} sub="max days_in_phase" />
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title={emptyTitle} sub={`เมื่องานเข้า ${emptyStage} จะปรากฏที่นี่`} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                    <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                    <th className="text-left font-medium px-4 py-3">เฟส</th>
                    <th className="text-left font-medium px-4 py-3">ค้างในเฟส</th>
                    <th className="text-center font-medium px-4 py-3">ปัญหา</th>
                    <th className="text-left font-medium px-4 py-3">นัดติดตั้ง</th>
                    <th className="text-left font-medium px-4 py-3">ผู้รับผิดชอบ</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <TrackTableRow key={r.id} row={r} onClick={() => setOpenId(r.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {rows.map((r) => (
              <TrackCard key={r.id} row={r} variant={isProd ? "production" : "install"} onClick={() => setOpenId(r.id)} />
            ))}
          </div>
        </>
      )}

      {openId && <JobDrawer jobId={openId} canFinance={false} readOnly onClose={() => setOpenId(null)} onChanged={refetch} />}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// แท็บ "ปัญหา" — reuse IssueTrackTable + CreateIssueModal
// ────────────────────────────────────────────────────────────────────────────
function IssuesTab({ filters, canWrite }: { filters: FilterState; canWrite: boolean }) {
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams();
  // ดึงเฉพาะที่ยังไม่ปิด (OPEN + IN_PROGRESS)
  if (filters.q) params.set("q", filters.q);
  if (filters.onlyOverdue) params.set("overdue", "1");
  // ค่า default: ไม่ดึง CLOSED (แสดงเฉพาะ open)
  // ไม่กรอง status ให้ IssuesPage ทำหน้าที่เต็มแทน — ที่นี่แสดง open เป็นหลัก

  // ใช้ /api/issues (ไม่กรอง closed = แสดงทั้งหมด แต่ sort ด้วย priority)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["issues-hub", filters.q, filters.onlyOverdue],
    queryFn: () => api.get<IssueTrackRow[]>(`/issues${params.toString() ? `?${params}` : ""}`),
  });

  const rows = data?.data ?? [];
  const agg = data?.meta?.aggregate as { total: number; open: number; overdue: number; urgent: number; oldest_days: number } | undefined;
  const hasHigh = rows.some((r) => r.severity === "HIGH" && r.status !== "CLOSED");

  // client-side filter: ซ่อน CLOSED
  const openRows = rows.filter((r) => r.status !== "CLOSED");

  return (
    <>
      {/* stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="เปิดอยู่" value={agg?.open ?? openRows.length} sub={`ทั้งหมด ${agg?.total ?? rows.length}`} />
        <StatCard label="เลยกำหนด" value={agg?.overdue ?? 0} accent="text-rose-300" />
        <StatCard label="ด่วน (HIGH)" value={agg ? rows.filter((r) => r.severity === "HIGH" && r.status !== "CLOSED").length : 0} accent="text-rose-300" />
        <StatCard label="ค้างนานสุด" value={agg ? `${agg.oldest_days} วัน` : "—"} />
      </div>

      {/* ปุ่ม "แจ้งปัญหาใหม่" มุมขวาบน — เฉพาะแท็บปัญหา */}
      {canWrite && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setCreating(true)}
            className="focusable pressable flex items-center gap-2 bg-white text-[#B3151D] rounded-xl px-3.5 py-2.5 text-sm font-semibold hover:bg-white/90 shadow-lg min-h-[44px]"
          >
            <Plus size={18} /> แจ้งปัญหาใหม่
          </button>
        </div>
      )}

      {isLoading ? <Spinner /> : openRows.length === 0 ? (
        <EmptyState title="ไม่มีปัญหาค้าง" sub="งานทุกชิ้นเรียบร้อยดี" />
      ) : (
        <IssueTrackTable rows={openRows} />
      )}

      {creating && (
        <CreateIssueModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refetch(); }}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestrator: FollowUpHubClient
// ────────────────────────────────────────────────────────────────────────────
export default function FollowUpHubClient({
  isSales,
  canIssueWrite,
}: {
  isSales: boolean;
  canIssueWrite: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("closure");
  const [filters, setFilters] = useState<FilterState>({
    q: "", onlyOverdue: false, onlyIssue: false, my: isSales, stageFilter: "",
  });

  const patchFilter = (s: Partial<FilterState>) =>
    setFilters((prev) => ({ ...prev, ...s }));

  // Badge counts: โหลด lazy ผ่านแต่ละแท็บ query — ค่า count จาก meta
  // (ใช้ queries ที่แต่ละแท็บโหลดแล้ว ไม่โหลดซ้ำ)

  const tabs: TabMeta[] = [
    { key: "closure", label: "ปิดการขาย" },
    { key: "production", label: "ผลิต" },
    { key: "install", label: "ติดตั้ง" },
    { key: "issues", label: "ปัญหา" },
  ];

  return (
    <div className="p-4 sm:p-6 fade-in">
      {/* Header */}
      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">ติดตามงาน</h1>
        <p className="text-sm" style={{ color: "var(--t-low)" }}>
          {isSales
            ? "งานของคุณ — ปิดการขาย, สายผลิต, ติดตั้ง, ปัญหา"
            : "ภาพรวมงานทุกขั้น — ปิดการขาย, สายผลิต, ติดตั้ง, ปัญหา"}
        </p>
      </div>

      {/* TabBar */}
      <TabBar active={activeTab} tabs={tabs} onChange={(t) => setActiveTab(t)} />

      {/* Filter bar (ร่วมทุกแท็บ) */}
      <FilterBar
        state={filters}
        onChange={patchFilter}
        isSales={isSales}
        showStageFilter={activeTab === "closure"}
      />

      {/* Tab content */}
      {activeTab === "closure" && (
        <ClosureTab
          isSales={isSales}
          filters={filters}
        />
      )}
      {activeTab === "production" && (
        <TrackTab
          group="production"
          filters={filters}
          isSales={isSales}
        />
      )}
      {activeTab === "install" && (
        <TrackTab
          group="install"
          filters={filters}
          isSales={isSales}
        />
      )}
      {activeTab === "issues" && (
        <IssuesTab filters={filters} canWrite={canIssueWrite} />
      )}
    </div>
  );
}
