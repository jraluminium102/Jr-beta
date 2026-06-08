"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { PHASE_META, PHASE_ORDER, type PhaseKey } from "@/lib/followup";
import { Spinner, StatCard, EmptyState } from "@/components/ui/primitives";
import { Search, ChevronRight, TriangleAlert, Clock } from "@/components/ui/icons";
import { JobDrawer } from "@/components/jobs/JobDrawer";

type Row = {
  id: string; job_code: string; customer_name: string; customer_tel: string | null;
  customer_area: string | null; status: string; estimator: string | null;
  phase: PhaseKey; days_in_phase: number; overdue: boolean; on_hold: boolean;
  open_issues: number; high_issue: boolean; planned_install_date: string | null;
  has_billed: boolean;
};

function PhaseChip({ phase }: { phase: PhaseKey }) {
  const m = PHASE_META[phase];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border whitespace-nowrap", m.chip)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} /> {m.th}
    </span>
  );
}

export default function FollowUpPage() {
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState("ALL");
  const [onlyIssue, setOnlyIssue] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["followup", q, phase, onlyIssue, onlyOverdue],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (phase !== "ALL") p.set("phase", phase);
      if (onlyIssue) p.set("issue", "1");
      if (onlyOverdue) p.set("overdue", "1");
      return api.get<Row[]>(`/followup?${p}`);
    },
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="mb-4 sm:mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">ติดตามงานลูกค้า</h1>
        <p className="text-sm" style={{ color: "var(--t-low)" }}>ลูกค้าแต่ละรายอยู่เฟสไหน ค้างนานไหม ติดปัญหาอะไร</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="งานทั้งหมด" value={(meta.total as number) ?? rows.length} />
        <StatCard label="ค้างนาน (เกินกำหนด)" value={(meta.overdue as number) ?? 0} accent="text-amber-300" />
        <StatCard label="มีปัญหาค้าง" value={(meta.with_issues as number) ?? 0} accent="text-rose-300" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 flex-1 min-h-[44px] focusable" style={{ color: "var(--t-mid)" }}>
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อลูกค้า / Job ID" aria-label="ค้นหา"
            className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full" />
        </label>
        <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="กรองตามเฟส"
          className="focusable glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] [&>option]:text-gray-800">
          <option value="ALL">ทุกเฟส</option>
          {PHASE_ORDER.map((k) => <option key={k} value={k}>{PHASE_META[k].th}</option>)}
          <option value="CANCELLED">ยกเลิก</option>
        </select>
        <button onClick={() => setOnlyOverdue((v) => !v)}
          className={cn("focusable pressable rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] inline-flex items-center gap-1.5 border",
            onlyOverdue ? "bg-amber-400 text-amber-950 border-amber-300" : "glass-card text-white border-white/15")}>
          <Clock size={16} /> ค้างนาน
        </button>
        <button onClick={() => setOnlyIssue((v) => !v)}
          className={cn("focusable pressable rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] inline-flex items-center gap-1.5 border",
            onlyIssue ? "bg-rose-400 text-rose-950 border-rose-300" : "glass-card text-white border-white/15")}>
          <TriangleAlert size={16} /> มีปัญหา
        </button>
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="ไม่พบงานตามเงื่อนไข" /> : (
        <>
          {/* Desktop */}
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                    <th className="text-left font-medium px-4 py-3">Job / ลูกค้า</th>
                    <th className="text-left font-medium px-4 py-3">เฟสปัจจุบัน</th>
                    <th className="text-left font-medium px-4 py-3">ค้างในเฟส</th>
                    <th className="text-center font-medium px-4 py-3">ปัญหา</th>
                    <th className="text-left font-medium px-4 py-3">ผู้รับผิดชอบ</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} tabIndex={0} role="button" onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}
                      className="focusable border-b border-white/6 hover:bg-white/10 cursor-pointer group">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium tnum">{r.job_code ?? "—"}</div>
                        <div className="text-white/90">{r.customer_name}</div>
                        <div className="text-[12px]" style={{ color: "var(--t-low)" }}>{r.customer_area ?? r.customer_tel ?? ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <PhaseChip phase={r.phase} />
                        {r.on_hold && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-white/15 text-white/80">⏸ พัก</span>}
                        {r.has_billed && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-100 border border-emerald-300/30">วางบิลแล้ว</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("tnum", r.overdue ? "text-amber-300 font-semibold" : "text-white/80")}>{r.days_in_phase} วัน</span>
                        {r.overdue && <span className="ml-1 text-[11px] text-amber-300">⚠ เกิน</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.open_issues > 0
                          ? <span className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-semibold tnum", r.high_issue ? "bg-rose-500" : "bg-amber-500/90")}>{r.open_issues}</span>
                          : <span style={{ color: "var(--t-low)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{r.estimator ?? "—"}</td>
                      <td className="px-2 text-white/30 group-hover:text-white/70"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2.5">
            {rows.map((r) => (
              <button key={r.id} onClick={() => setOpenId(r.id)} className="focusable pressable w-full text-left glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white font-semibold text-sm">{r.customer_name}</span>
                  <PhaseChip phase={r.phase} />
                </div>
                <div className="text-[12px] mt-1" style={{ color: "var(--t-low)" }}>
                  {r.job_code ?? "—"} · {r.customer_area ?? r.customer_tel ?? ""}
                </div>
                <div className="flex items-center gap-3 mt-2 text-[12px]">
                  <span className={cn("tnum", r.overdue ? "text-amber-300 font-semibold" : "text-white/70")}>ค้าง {r.days_in_phase} วัน{r.overdue ? " ⚠" : ""}</span>
                  {r.open_issues > 0 && <span className={cn(r.high_issue ? "text-rose-300" : "text-amber-300")}>● {r.open_issues} ปัญหา</span>}
                  {r.has_billed && <span className="text-emerald-300">· วางบิลแล้ว</span>}
                  {r.estimator && <span style={{ color: "var(--t-mid)" }}>· {r.estimator}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {openId && <JobDrawer jobId={openId} canFinance={false} onClose={() => setOpenId(null)} onChanged={refetch} />}
    </div>
  );
}
