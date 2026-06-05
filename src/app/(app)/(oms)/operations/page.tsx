"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { JOB_STATUS } from "@/lib/constants";
import { cn } from "@/lib/format";
import { Chip, StatCard, Spinner } from "@/components/ui/primitives";
import { Clock, TriangleAlert } from "@/components/ui/icons";
import type { JobStatus } from "@/lib/database.types";

// ─── Response shape (mirrors /api/dashboard) ──────────────────────────────────
type StaleJob = { jobCode: string; customerName: string; status: string; days: number };
type OverdueJob = {
  jobCode: string; customerName: string;
  type: "design" | "install"; dueDate: string; days: number;
};
type TopIssue = {
  id: string; phase: string; severity: string;
  detail: string; dueDate: string | null; overdue: boolean;
};

type Dash = {
  totalActive: number; onHoldCount: number;
  jobsByStatus: Record<string, number>;
  jobsByStageGroup: Record<string, number>;
  staleJobs: StaleJob[]; staleTotal: number;
  overdueJobs: OverdueJob[]; overdueTotal: number;
  openIssuesCount: number; closedIssuesCount: number;
  issuesBySeverity: Record<string, number>; issuesOverdue: number;
  topIssues: TopIssue[];
};

// Stage-group display order + colors
const STAGE_GROUPS: { key: string; label: string; color: string; bar: string }[] = [
  { key: "ขาย",     label: "ฝ่ายขาย",  color: "text-sky-300",     bar: "bg-sky-400" },
  { key: "มัดจำ",   label: "มัดจำ",    color: "text-emerald-300", bar: "bg-emerald-400" },
  { key: "ผลิต",    label: "ผลิต",     color: "text-orange-300",  bar: "bg-orange-400" },
  { key: "ติดตั้ง", label: "ติดตั้ง",  color: "text-violet-300",  bar: "bg-violet-400" },
];

// Severity badge
const SEV_CHIP: Record<string, string> = {
  HIGH:   "bg-rose-500/25   text-rose-100   border-rose-300/30",
  MEDIUM: "bg-amber-500/25  text-amber-100  border-amber-300/30",
  LOW:    "bg-slate-500/25  text-slate-100  border-slate-300/30",
};
const SEV_TH: Record<string, string> = { HIGH: "สูง", MEDIUM: "กลาง", LOW: "ต่ำ" };

// Phase (issue phase) Thai
const PHASE_TH: Record<string, string> = {
  SALES: "ขาย", MEASUREMENT: "วัดจริง", PRODUCTION: "ผลิต",
  INSTALLATION: "ติดตั้ง", POST_SALE: "หลังส่งงาน",
};

function fmtDate(iso: string | null) {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
}

export default function OperationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["ops-dashboard"],
    queryFn: () => api.get<Dash>("/dashboard").then((r) => r.data),
    staleTime: 60_000, // refresh every minute
  });

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <Spinner label="กำลังโหลดข้อมูลงาน…" />
      </div>
    );
  }

  const totalJobs = Object.values(data.jobsByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 sm:p-6 fade-in space-y-4 sm:space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">ภาพรวมงาน</h1>
        <p className="text-sm" style={{ color: "var(--t-low)" }}>
          ติดตามสถานะงาน ค้างงาน เลยกำหนด และปัญหาเปิดอยู่
        </p>
      </div>

      {/* ── Top stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="งานทั้งระบบ"    value={totalJobs}           sub="ทุก status" />
        <StatCard label="งาน Active"     value={data.totalActive}    sub="ไม่รวมจบ/ยกเลิก" />
        <StatCard label="ค้างเกิน 7 วัน" value={data.staleTotal}     accent="text-amber-300" sub="ไม่มีความเคลื่อนไหว" />
        <StatCard label="Issues เปิดอยู่" value={data.openIssuesCount} accent="text-rose-300" sub={`เลยกำหนด ${data.issuesOverdue} รายการ`} />
      </div>

      {/* ── Stage group + Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Stage groups */}
        <div className="glass-card rounded-2xl p-5">
          <div className="text-white font-semibold mb-4">งานตามกลุ่มขั้นตอน</div>
          <div className="space-y-3">
            {STAGE_GROUPS.map(({ key, label, color, bar }) => {
              const count = data.jobsByStageGroup[key] ?? 0;
              const pct = data.totalActive ? Math.round((count / data.totalActive) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-sm font-medium", color)}>{label}</span>
                    <span className="text-white font-semibold text-sm tnum">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {data.onHoldCount > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-sm" style={{ color: "var(--t-low)" }}>พักงาน (on hold)</span>
                <span className="text-amber-200 font-semibold text-sm tnum">{data.onHoldCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Status breakdown */}
        <div className="glass-card rounded-2xl p-5">
          <div className="text-white font-semibold mb-4">งานตามสถานะ</div>
          <div className="space-y-2.5">
            {(Object.keys(JOB_STATUS) as JobStatus[]).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <Chip status={k} />
                <span className="text-white font-semibold text-sm tnum">
                  {data.jobsByStatus[k] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stale + Overdue ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* งานค้างเกิน 7 วัน */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <span className="text-amber-300"><Clock size={18} /></span>
              งานค้างเกิน 7 วัน
            </div>
            <span className="text-amber-200 text-[12px] font-semibold tnum">
              {data.staleTotal} งาน
            </span>
          </div>
          <div className="space-y-2">
            {data.staleJobs.length === 0 && (
              <div className="text-[12px]" style={{ color: "var(--t-low)" }}>
                ไม่มีงานค้าง — ดีมาก
              </div>
            )}
            {data.staleJobs.map((o) => (
              <div
                key={o.jobCode}
                className="flex items-center justify-between bg-white/8 rounded-xl px-3 py-2.5 border border-white/10"
              >
                <div>
                  <span className="text-white text-sm font-medium tnum">{o.jobCode}</span>
                  <span className="text-[12px] ml-2" style={{ color: "var(--t-low)" }}>
                    {o.customerName}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Chip status={o.status as JobStatus} />
                  <span className="text-amber-200 text-[12px] tnum">{o.days} วัน</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* เลยกำหนด */}
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <span className="text-rose-300"><TriangleAlert size={18} /></span>
              เลยกำหนด
            </div>
            <span className="text-rose-200 text-[12px] font-semibold tnum">
              {data.overdueTotal} งาน
            </span>
          </div>
          <div className="space-y-2">
            {data.overdueJobs.length === 0 && (
              <div className="text-[12px]" style={{ color: "var(--t-low)" }}>
                ไม่มีงานเลยกำหนด
              </div>
            )}
            {data.overdueJobs.map((o) => (
              <div
                key={o.jobCode}
                className="flex items-center justify-between bg-white/8 rounded-xl px-3 py-2.5 border border-white/10"
              >
                <div>
                  <span className="text-white text-sm font-medium tnum">{o.jobCode}</span>
                  <span className="text-[12px] ml-2" style={{ color: "var(--t-low)" }}>
                    {o.customerName}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-rose-200 text-[11px] tnum">
                    {o.type === "design" ? "กำหนดแบบ" : "กำหนดติดตั้ง"} {fmtDate(o.dueDate)}
                  </div>
                  <div className="text-rose-300 text-[11px] tnum">เลย {o.days} วัน</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Issues open ── */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-white font-semibold">Issues เปิดอยู่</div>
          <div className="flex items-center gap-3 text-[12px]">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((sev) => (
              <span key={sev} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border", SEV_CHIP[sev])}>
                <span className="font-semibold tnum">{data.issuesBySeverity[sev] ?? 0}</span>
                {SEV_TH[sev]}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.topIssues.length === 0 && (
            <div className="col-span-2 text-[12px]" style={{ color: "var(--t-low)" }}>
              ไม่มี Issue เปิดอยู่
            </div>
          )}
          {data.topIssues.map((issue) => (
            <div
              key={issue.id}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2.5 border",
                issue.overdue
                  ? "bg-rose-500/10 border-rose-300/25"
                  : "bg-white/8 border-white/10"
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border shrink-0 mt-0.5",
                  SEV_CHIP[issue.severity]
                )}
              >
                {SEV_TH[issue.severity]}
              </span>
              <div className="min-w-0">
                <div className="text-white text-[13px] leading-snug truncate">
                  {issue.detail}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px]" style={{ color: "var(--t-low)" }}>
                    {PHASE_TH[issue.phase] ?? issue.phase}
                  </span>
                  {issue.dueDate && (
                    <span className={cn("text-[11px] tnum", issue.overdue ? "text-rose-300" : "text-white/50")}>
                      ครบ {fmtDate(issue.dueDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {data.openIssuesCount > 8 && (
          <div className="mt-3 text-center text-[12px]" style={{ color: "var(--t-low)" }}>
            แสดง 8 จาก {data.openIssuesCount} รายการ — ดูทั้งหมดที่เมนู Issues
          </div>
        )}
      </div>
    </div>
  );
}
