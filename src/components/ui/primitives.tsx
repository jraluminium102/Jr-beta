import { JOB_STATUS } from "@/lib/constants";
import type { JobStatus } from "@/lib/database.types";
import { cn } from "@/lib/format";

export function Chip({ status, children }: { status?: JobStatus; children?: React.ReactNode }) {
  const s = status ? JOB_STATUS[status] : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border",
      s?.chip ?? "bg-white/15 text-white/90 border-white/20")}>
      {s && <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />}
      {children ?? s?.th}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "sky" }) {
  const tones = { neutral: "bg-white/12 text-white/85 border-white/15", sky: "bg-sky-400/20 text-sky-100 border-sky-300/25" };
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border", tones[tone])}>{children}</span>;
}

export function StatCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="text-[12px] font-medium" style={{ color: "var(--t-low)" }}>{label}</div>
      <div className={cn("text-xl sm:text-2xl font-bold mt-1.5 tnum", accent ?? "text-white")}>{value}</div>
      {sub && <div className="text-[12px] mt-1.5" style={{ color: "var(--t-low)" }}>{sub}</div>}
    </div>
  );
}

export function Spinner({ label = "กำลังโหลด…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: "var(--t-mid)" }}>
      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="glass-card rounded-2xl p-10 text-center">
      <div className="text-sm" style={{ color: "var(--t-mid)" }}>{title}</div>
      {sub && <div className="text-[12px] mt-1" style={{ color: "var(--t-low)" }}>{sub}</div>}
    </div>
  );
}
