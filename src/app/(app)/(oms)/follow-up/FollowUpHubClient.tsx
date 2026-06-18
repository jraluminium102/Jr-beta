"use client";
/**
 * FollowUpHubClient — หน้า "ติดตามงาน" รวม 4 แท็บ
 *   1. ปิดการขาย (default)  — 3 closure_stage → /api/sales-closure
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
import { Spinner, StatCard, EmptyState } from "@/components/ui/primitives";
import { Search, Clock, TriangleAlert, ChevronRight, Phone, Plus } from "@/components/ui/icons";
import { JobDrawer } from "@/components/jobs/JobDrawer";
import { ClosureActions } from "@/components/sales-closure/ClosureActions";
import { IssueTrackTable, type IssueTrackRow } from "@/components/issues/IssueTrackTable";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
import { HoldModal } from "@/components/jobs/HoldModal";
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
type ClosureStage = "await" | "sent" | "revising" | "hold";

// ────────────────────────────────────────────────────────────────────────────
// design_state badge — mapping ตรงกับ DesignerBoard COLUMNS
// ────────────────────────────────────────────────────────────────────────────
const DESIGN_CHIP: Record<string, string> = {
  NOT_STARTED:      "bg-slate-500/20 text-slate-100 border-slate-300/25",
  DRAWING:          "bg-sky-500/20 text-sky-100 border-sky-300/25",
  PENDING_CUSTOMER: "bg-teal-500/20 text-teal-100 border-teal-300/25",
  REVISING:         "bg-amber-500/20 text-amber-100 border-amber-300/25",
  DONE:             "bg-emerald-500/20 text-emerald-100 border-emerald-300/25",
};
const DESIGN_TH: Record<string, string> = {
  NOT_STARTED:      "ยังไม่เริ่ม",
  DRAWING:          "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอเซลล์ตรวจแบบ",
  REVISING:         "กำลังแก้ไข",
  DONE:             "เสร็จแล้ว",
};

function DesignBadge({ state, reviseCount }: { state: string; reviseCount?: number }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
      DESIGN_CHIP[state] ?? "bg-white/10 text-white/80 border-white/20"
    )}>
      {DESIGN_TH[state] ?? state}
      {reviseCount != null && reviseCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400/30 text-amber-200 text-[10px] font-semibold tnum">
          แก้ {reviseCount}
        </span>
      )}
    </span>
  );
}

// quotation_status badge สำหรับแท็บ await
const QUOTE_STATUS_CHIP: Record<string, { cls: string; label: string }> = {
  draft:    { cls: "bg-sky-400/20 text-sky-100 border-sky-300/25",     label: "ร่างแล้ว" },
  sent:     { cls: "bg-violet-400/20 text-violet-100 border-violet-300/25", label: "ส่งแล้ว" },
  approved: { cls: "bg-emerald-400/20 text-emerald-100 border-emerald-300/25", label: "อนุมัติ" },
};

function QuoteBadge({ hasQuotation, quotationStatus }: { hasQuotation: boolean; quotationStatus: string | null }) {
  if (!hasQuotation) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-white/8 text-white/50 border-white/15 whitespace-nowrap">
        ยังไม่ทำ
      </span>
    );
  }
  if (quotationStatus && QUOTE_STATUS_CHIP[quotationStatus]) {
    const { cls, label } = QUOTE_STATUS_CHIP[quotationStatus];
    return (
      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap", cls)}>
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-white/12 text-white/70 border-white/20 whitespace-nowrap">
      มีใบเสนอ
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
// Filter bar (shared — ไม่มี stage dropdown สำหรับ closure แล้ว)
// ────────────────────────────────────────────────────────────────────────────
type FilterState = {
  q: string;
  onlyOverdue: boolean;
  onlyIssue: boolean;
  my: boolean;
  stageFilter: ClosureStage; // 'await'|'sent'|'revising'
};

function FilterBar({
  state, onChange, isSales,
}: {
  state: FilterState;
  onChange: (s: Partial<FilterState>) => void;
  isSales: boolean;
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
// SegmentedChips — sub-filter 3 สเตจใน ClosureTab
// ────────────────────────────────────────────────────────────────────────────
const CLOSURE_STAGE_META: Record<ClosureStage, { label: string; chip: string; activeChip: string }> = {
  await: {
    label: "รอส่งแบบและใบเสนอราคา",
    chip: "glass-card text-white/75 border-white/15 hover:bg-white/12",
    activeChip: "bg-slate-400/30 text-white border-slate-300/40",
  },
  sent: {
    label: "ส่งแบบแล้ว",
    chip: "glass-card text-white/75 border-white/15 hover:bg-white/12",
    activeChip: "bg-violet-400/30 text-violet-100 border-violet-300/40",
  },
  revising: {
    label: "แก้แบบ",
    chip: "glass-card text-white/75 border-white/15 hover:bg-white/12",
    activeChip: "bg-amber-400/30 text-amber-100 border-amber-300/40",
  },
  hold: {
    label: "พัก (HOLD)",
    chip: "glass-card text-white/75 border-white/15 hover:bg-white/12",
    activeChip: "bg-amber-600/30 text-amber-200 border-amber-500/40",
  },
};

function SegmentedChips({
  active,
  counts,
  onChange,
}: {
  active: ClosureStage;
  counts: Record<ClosureStage, number>;
  onChange: (s: ClosureStage) => void;
}) {
  const stages: ClosureStage[] = ["await", "sent", "revising", "hold"];
  return (
    <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="กรองสเตจปิดการขาย">
      {stages.map((s) => {
        const meta = CLOSURE_STAGE_META[s];
        const isActive = active === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            aria-pressed={isActive}
            className={cn(
              "focusable pressable inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] border transition-all whitespace-nowrap",
              isActive ? meta.activeChip : meta.chip
            )}
          >
            {meta.label}
            <span className={cn(
              "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold tnum",
              isActive ? "bg-white/25 text-white" : "bg-white/15 text-white/70"
            )}>
              {counts[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ClosureTab helpers: row tables per stage
// ────────────────────────────────────────────────────────────────────────────

// Job/ลูกค้า cell (ใช้ร่วมทุก stage)
function JobCell({ row }: { row: ClosureRow }) {
  return (
    <div className="flex items-center gap-2">
      {row.customer_tel && (
        <a
          href={`tel:${row.customer_tel}`}
          aria-label={`โทร ${row.customer_tel}`}
          className="focusable inline-flex items-center justify-center w-9 h-9 rounded-xl bg-sky-400/15 text-sky-200 hover:bg-sky-400/30 shrink-0 min-h-[44px] min-w-[36px]"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone size={15} />
        </a>
      )}
      <div className="min-w-0">
        <div className="text-white font-medium tnum">{row.job_code ?? "—"}</div>
        <div className="text-white/90">{row.customer_name}</div>
      </div>
    </div>
  );
}

// ─── await table ─────────────────────────────────────────────────────────────
function AwaitTable({ rows, canWrite, onRefetch, onHold }: { rows: ClosureRow[]; canWrite: boolean; onRefetch: () => void; onHold?: (row: ClosureRow) => void }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="ไม่มีงานรอส่งแบบ"
        sub="เมื่องานมีใบเสนอพร้อมส่ง หรือยังอยู่ระหว่างวาดแบบ จะปรากฏที่นี่"
      />
    );
  }
  return (
    <>
      <p className="text-[12px] mb-3" style={{ color: "var(--t-low)" }}>
        เช็คสถานะเผื่อลูกค้าทวงงาน — ยืนยันกับช่างแล้วค่อยส่งใบเสนอให้ลูกค้า
      </p>
      {/* Desktop */}
      <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                <th className="text-left font-medium px-4 py-3">เฟสแบบ</th>
                <th className="text-left font-medium px-4 py-3">ใบเสนอในระบบ</th>
                <th className="text-left font-medium px-4 py-3">ผู้ดูแล</th>
                {canWrite && <th className="text-center font-medium px-4 py-3">ดำเนินการ</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/6 hover:bg-white/8 transition-colors">
                  <td className="px-4 py-3"><JobCell row={row} /></td>
                  <td className="px-4 py-3">
                    <DesignBadge state={row.design_state} />
                  </td>
                  <td className="px-4 py-3">
                    <QuoteBadge hasQuotation={row.has_quotation} quotationStatus={row.quotation_status} />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{row.estimator_name ?? "—"}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-col gap-1 items-center">
                        <ClosureActions job={row} onRevised={onRefetch} />
                        {onHold && (
                          <button type="button" onClick={() => onHold(row)}
                            className="focusable pressable inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[36px] transition">
                            พักงาน
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="glass-card rounded-2xl p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</div>
                <div className="text-white/80 text-sm mt-0.5">{row.customer_name}</div>
              </div>
              <DesignBadge state={row.design_state} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {row.customer_tel && (
                <a href={`tel:${row.customer_tel}`}
                  className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-400/15 text-sky-200 border border-sky-300/20 text-[12px] min-h-[40px]">
                  <Phone size={14} /> {row.customer_tel}
                </a>
              )}
              <QuoteBadge hasQuotation={row.has_quotation} quotationStatus={row.quotation_status} />
            </div>
            <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ผู้ดูแล: {row.estimator_name ?? "—"}</div>
            {row.remark && (
              <div className="text-[12px] italic" style={{ color: "var(--t-mid)" }}>{row.remark}</div>
            )}
            {canWrite && (
              <div className="space-y-1.5">
                <ClosureActions job={row} onRevised={onRefetch} />
                {onHold && (
                  <button type="button" onClick={() => onHold(row)}
                    className="focusable pressable w-full rounded-xl py-2.5 text-sm font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[44px]">
                    พักงาน
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── ติดตามฟีดแบค 3 ครั้ง (0048) — ติ๊ก=ลงวันนี้ · กดซ้ำ=ยกเลิก ──
function fuDone(r: ClosureRow): boolean {
  return !!(r.followup_1 && r.followup_2 && r.followup_3); // ครบ 3 = เลิกตาม
}
function FollowupCells({ row, canWrite, onRefetch }: { row: ClosureRow; canWrite: boolean; onRefetch: () => void }) {
  const [busy, setBusy] = useState(false);
  const dates = [row.followup_1, row.followup_2, row.followup_3];
  async function toggle(slot: number, isSet: boolean) {
    if (!canWrite || busy) return;
    setBusy(true);
    try { await api.post(`/jobs/${row.id}/followup`, { slot, set: !isSet }); onRefetch(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }
  return (
    <div className="inline-flex gap-1">
      {dates.map((d, i) => {
        const slot = i + 1;
        const isSet = !!d;
        return (
          <button key={slot} type="button" disabled={!canWrite || busy}
            onClick={() => toggle(slot, isSet)}
            title={isSet ? `ตามครั้งที่ ${slot}: ${thDate(d!)} — กดเพื่อยกเลิก` : `ติ๊กว่าตามครั้งที่ ${slot} แล้ว (ลงวันนี้)`}
            className={cn(
              "min-w-[42px] px-1.5 py-1 rounded-lg text-[11px] tnum border transition focusable",
              isSet
                ? "bg-emerald-500/20 text-emerald-100 border-emerald-300/35 font-semibold"
                : "bg-white/5 text-white/45 border-white/15 hover:bg-white/10",
              (!canWrite || busy) && "opacity-60 cursor-default"
            )}>
            {isSet ? `${d!.slice(8, 10)}/${d!.slice(5, 7)}` : `ครั้ง${slot}`}
          </button>
        );
      })}
    </div>
  );
}

// ─── sent table ───────────────────────────────────────────────────────────────
function SentTable({ rows, canWrite, onRefetch, onHold }: { rows: ClosureRow[]; canWrite: boolean; onRefetch: () => void; onHold?: (row: ClosureRow) => void }) {
  // ครบ 3 ครั้ง → เด้งไปบรรทัดล่างสุด (ไม่เอาออกจากเฟส) · ที่เหลือคงลำดับเดิม
  const sorted = [...rows].sort((a, b) => (fuDone(a) ? 1 : 0) - (fuDone(b) ? 1 : 0));
  if (rows.length === 0) {
    return (
      <EmptyState
        title="ไม่มีงานที่ส่งแบบแล้ว"
        sub="เมื่องานส่งใบเสนอราคาให้ลูกค้าแล้ว จะปรากฏที่นี่"
      />
    );
  }
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                <th className="text-right font-medium px-4 py-3">ยอดสุทธิ</th>
                <th className="text-left font-medium px-4 py-3">รอ / โน้ต</th>
                <th className="text-left font-medium px-4 py-3">ผู้ดูแล</th>
                <th className="text-center font-medium px-4 py-3">ติดตามฟีดแบค</th>
                {canWrite && <th className="text-center font-medium px-4 py-3">ดำเนินการ</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const overdue7 = (row.days_waiting ?? 0) > 7;
                return (
                  <tr key={row.id} className={cn(
                    "border-b border-white/6 hover:bg-white/8 transition-colors",
                    overdue7 && "border-l-2 border-l-rose-400"
                  )}>
                    <td className="px-4 py-3"><JobCell row={row} /></td>
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
                    <td className="px-4 py-3 text-center">
                      <FollowupCells row={row} canWrite={canWrite} onRefetch={onRefetch} />
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex flex-col gap-1 items-center">
                          <ClosureActions job={row} onRevised={onRefetch} />
                          {onHold && (
                            <button type="button" onClick={() => onHold(row)}
                              className="focusable pressable inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[36px] transition">
                              พักงาน
                            </button>
                          )}
                        </div>
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
        {sorted.map((row) => {
          const overdue7 = (row.days_waiting ?? 0) > 7;
          return (
            <div key={row.id} className={cn(
              "glass-card rounded-2xl p-4 space-y-2.5",
              overdue7 && "border-l-2 border-l-rose-400"
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</div>
                  <div className="text-white/80 text-sm mt-0.5">{row.customer_name}</div>
                </div>
                {row.net != null && (
                  <span className="text-[13px] tnum text-white/90 shrink-0">{baht(row.net)} ฿</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {row.customer_tel && (
                  <a href={`tel:${row.customer_tel}`}
                    className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-400/15 text-sky-200 border border-sky-300/20 text-[12px] min-h-[40px]">
                    <Phone size={14} /> {row.customer_tel}
                  </a>
                )}
                {row.days_waiting != null && (
                  <span className={cn("text-[12px] tnum", overdue7 ? "text-rose-300 font-semibold" : "text-white/60")}>
                    รอ {row.days_waiting} วัน
                  </span>
                )}
              </div>
              {row.remark && (
                <div className="text-[12px] italic" style={{ color: "var(--t-mid)" }}>{row.remark}</div>
              )}
              <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ผู้ดูแล: {row.estimator_name ?? "—"}</div>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: "var(--t-low)" }}>ติดตามฟีดแบค:</span>
                <FollowupCells row={row} canWrite={canWrite} onRefetch={onRefetch} />
              </div>
              {canWrite && (
                <div className="space-y-1.5">
                  <ClosureActions job={row} onRevised={onRefetch} />
                  {onHold && (
                    <button type="button" onClick={() => onHold(row)}
                      className="focusable pressable w-full rounded-xl py-2.5 text-sm font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[44px]">
                      พักงาน
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── revising table ───────────────────────────────────────────────────────────
function RevisingTable({ rows, canWrite, onRefetch, onHold }: { rows: ClosureRow[]; canWrite: boolean; onRefetch: () => void; onHold?: (row: ClosureRow) => void }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="ไม่มีงานที่อยู่ระหว่างแก้แบบ"
        sub="เมื่อเซลล์ส่งแก้แบบ งานจะปรากฏที่นี่จนกว่าช่างจะกดเสร็จ"
      />
    );
  }
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                <th className="text-left font-medium px-4 py-3">เฟสแบบ</th>
                <th className="text-left font-medium px-4 py-3">ผู้ดูแล</th>
                {canWrite && <th className="text-center font-medium px-4 py-3">ดำเนินการ</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/6 hover:bg-white/8 transition-colors">
                  <td className="px-4 py-3"><JobCell row={row} /></td>
                  <td className="px-4 py-3">
                    <DesignBadge state={row.design_state} reviseCount={row.design_revise_count} />
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{row.estimator_name ?? "—"}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-col gap-1 items-center">
                        <ClosureActions job={row} onRevised={onRefetch} />
                        {onHold && (
                          <button type="button" onClick={() => onHold(row)}
                            className="focusable pressable inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[36px] transition">
                            พักงาน
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="glass-card rounded-2xl p-4 space-y-2.5 border-l-2 border-l-amber-400">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</div>
                <div className="text-white/80 text-sm mt-0.5">{row.customer_name}</div>
              </div>
              <DesignBadge state={row.design_state} reviseCount={row.design_revise_count} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {row.customer_tel && (
                <a href={`tel:${row.customer_tel}`}
                  className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-400/15 text-sky-200 border border-sky-300/20 text-[12px] min-h-[40px]">
                  <Phone size={14} /> {row.customer_tel}
                </a>
              )}
            </div>
            <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ผู้ดูแล: {row.estimator_name ?? "—"}</div>
            {row.remark && (
              <div className="text-[12px] italic" style={{ color: "var(--t-mid)" }}>{row.remark}</div>
            )}
            {canWrite && (
              <div className="space-y-1.5">
                <ClosureActions job={row} onRevised={onRefetch} />
                {onHold && (
                  <button type="button" onClick={() => onHold(row)}
                    className="focusable pressable w-full rounded-xl py-2.5 text-sm font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[44px]">
                    พักงาน
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// แท็บ "ปิดการขาย" — 4 closure_stage, segmented chips
// ────────────────────────────────────────────────────────────────────────────
// ─── hold table ───────────────────────────────────────────────────────────────
function HoldTable({ rows, canWrite, onRefetch }: { rows: ClosureRow[]; canWrite: boolean; onRefetch: () => void }) {
  const [unholdBusy, setUnholdBusy] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function doUnhold(row: ClosureRow) {
    setUnholdBusy(row.id);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/jobs/${row.id}/unhold`, { method: "POST" });
      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "ดึงงานกลับไม่สำเร็จ");
      onRefetch();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "ดึงงานกลับไม่สำเร็จ");
      setUnholdBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="ไม่มีงานที่พักอยู่"
        sub="เมื่อพักงานจากหน้าใดก็ตาม งานจะปรากฏที่นี่"
      />
    );
  }

  return (
    <>
      {errMsg && (
        <div className="mb-3 rounded-xl bg-rose-500/20 border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200">
          {errMsg}
        </div>
      )}
      <p className="text-[12px] mb-3" style={{ color: "var(--t-low)" }}>
        งานพักชั่วคราว — ข้อมูลและใบเสนอครบถ้วน กด "เอากลับมาทำ" เพื่อคืนงานเข้า active
      </p>
      {/* Desktop */}
      <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                <th className="text-left font-medium px-4 py-3">เหตุผลพัก</th>
                <th className="text-left font-medium px-4 py-3">ผู้ดูแล</th>
                {canWrite && <th className="text-center font-medium px-4 py-3">ดำเนินการ</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/6 hover:bg-white/8 transition-colors">
                  <td className="px-4 py-3"><JobCell row={row} /></td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "var(--t-mid)" }}>
                    {row.on_hold_reason ?? "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{row.estimator_name ?? "—"}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => doUnhold(row)}
                        disabled={unholdBusy === row.id}
                        className="focusable pressable inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold bg-brand text-white hover:bg-brand/90 min-h-[36px] disabled:opacity-60"
                        aria-label={`เอางาน ${row.job_code ?? ""} กลับมาทำ`}
                      >
                        {unholdBusy === row.id ? "กำลังดึงกลับ…" : "เอากลับมาทำ"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="glass-card rounded-2xl p-4 space-y-2.5 border-l-2 border-l-amber-400">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</div>
                <div className="text-white/80 text-sm mt-0.5">{row.customer_name}</div>
              </div>
            </div>
            <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>
              เหตุผล: {row.on_hold_reason ?? "—"}
            </div>
            <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ผู้ดูแล: {row.estimator_name ?? "—"}</div>
            {canWrite && (
              <button
                type="button"
                onClick={() => doUnhold(row)}
                disabled={unholdBusy === row.id}
                className="focusable pressable w-full rounded-xl py-2.5 text-sm font-semibold bg-brand text-white hover:bg-brand/90 min-h-[44px] disabled:opacity-60"
              >
                {unholdBusy === row.id ? "กำลังดึงกลับ…" : "เอากลับมาทำ"}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function ClosureTab({ isSales, filters, onFilterChange }: {
  isSales: boolean;
  filters: FilterState;
  onFilterChange: (s: Partial<FilterState>) => void;
}) {
  const [holdModal, setHoldModal] = useState<ClosureRow | null>(null);

  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  // ส่ง ?stage= ไปที่ API เพื่อให้ filter server-side
  if (filters.stageFilter) params.set("stage", filters.stageFilter);
  if (filters.my || isSales) params.set("my", "1");

  // queryKey รวม stageFilter → เปลี่ยน chip แล้ว refetch อัตโนมัติ
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sales-closure-hub", filters.q, filters.stageFilter, filters.my, isSales],
    queryFn: () => api.get<ClosureRow[]>(`/sales-closure?${params}`),
    refetchOnWindowFocus: true,
  });

  const allRows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const metaCounts = data?.meta?.counts as Record<ClosureStage, number> | undefined;
  const netSum = (data?.meta?.net_sum as number) ?? 0;
  const waiting7 = (data?.meta?.waiting_7 as number) ?? 0;

  // counts จาก meta (นับก่อนกรอง — server ส่งมาจาก rows ทั้งหมด)
  // ถ้า meta ไม่มี (กรณี loading/error) fallback เป็น 0
  const counts: Record<ClosureStage, number> = metaCounts ?? { await: 0, sent: 0, revising: 0, hold: 0 };

  // client-side overdue+issue filter
  let rows = allRows;
  if (filters.onlyOverdue) rows = rows.filter((r) => (r.days_waiting ?? 0) > 7);
  if (filters.onlyIssue) rows = rows.filter((r) => r.remark != null && r.remark !== "");

  const activeStage = filters.stageFilter;

  return (
    <>
      {/* stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="รอส่งแบบ" value={counts.await} sub="ยังไม่ส่งใบเสนอ" />
        <StatCard label="ส่งแบบแล้ว" value={counts.sent} sub="รอลูกค้าตัดสินใจ" accent="text-violet-200" />
        <StatCard label="แก้แบบ" value={counts.revising} sub="อยู่บอร์ดช่าง" accent="text-amber-300" />
        <StatCard label="รอ >7 วัน" value={waiting7} sub="จากวันส่งใบเสนอ" accent="text-rose-300" />
      </div>

      {/* segmented chips */}
      <SegmentedChips
        active={activeStage}
        counts={counts}
        onChange={(s) => onFilterChange({ stageFilter: s })}
      />

      {/* ยอดรวม (เฉพาะ sent) */}
      {activeStage === "sent" && netSum > 0 && (
        <p className="text-[12px] mb-3 tnum" style={{ color: "var(--t-low)" }}>
          ยอดรวมใบเสนอราคา: <span className="text-sky-200 font-semibold">{baht(netSum)} ฿</span>
        </p>
      )}

      {isLoading ? <Spinner /> : (
        <>
          {activeStage === "await" && (
            <AwaitTable
              rows={rows}
              canWrite={canWrite}
              onRefetch={refetch}
              onHold={canWrite ? (row) => setHoldModal(row) : undefined}
            />
          )}
          {activeStage === "sent" && (
            <SentTable
              rows={rows}
              canWrite={canWrite}
              onRefetch={refetch}
              onHold={canWrite ? (row) => setHoldModal(row) : undefined}
            />
          )}
          {activeStage === "revising" && (
            <RevisingTable
              rows={rows}
              canWrite={canWrite}
              onRefetch={refetch}
              onHold={canWrite ? (row) => setHoldModal(row) : undefined}
            />
          )}
          {activeStage === "hold" && <HoldTable rows={rows} canWrite={canWrite} onRefetch={refetch} />}
        </>
      )}

      {/* HoldModal */}
      {holdModal && (
        <HoldModal
          jobId={holdModal.id}
          jobCode={holdModal.job_code}
          customerName={holdModal.customer_name}
          zone="dark"
          onDone={() => { setHoldModal(null); refetch(); }}
          onClose={() => setHoldModal(null)}
        />
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
  if (filters.q) params.set("q", filters.q);
  if (filters.onlyOverdue) params.set("overdue", "1");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["issues-hub", filters.q, filters.onlyOverdue],
    queryFn: () => api.get<IssueTrackRow[]>(`/issues${params.toString() ? `?${params}` : ""}`),
  });

  const rows = data?.data ?? [];
  const agg = data?.meta?.aggregate as { total: number; open: number; overdue: number; urgent: number; oldest_days: number } | undefined;

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
    q: "",
    onlyOverdue: false,
    onlyIssue: false,
    my: isSales,
    stageFilter: "sent", // ดีฟอลต์เลือก 'sent' (ส่งแบบแล้ว)
  });

  const patchFilter = (s: Partial<FilterState>) =>
    setFilters((prev) => ({ ...prev, ...s }));

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

      {/* Filter bar (ร่วมทุกแท็บ — ไม่มี stage dropdown แล้ว) */}
      <FilterBar
        state={filters}
        onChange={patchFilter}
        isSales={isSales}
      />

      {/* Tab content */}
      {activeTab === "closure" && (
        <ClosureTab
          isSales={isSales}
          filters={filters}
          onFilterChange={patchFilter}
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
