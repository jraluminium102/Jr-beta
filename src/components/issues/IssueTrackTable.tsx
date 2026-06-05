"use client";
import Link from "next/link";
import { thDate } from "@/lib/format";
import type { IssueStatus, IssueType, IssuePhase } from "@/lib/database.types";

// ---------- shared row shape (track view) ----------
export type IssueTrackRow = {
  id: string; issue_code: string; phase: IssuePhase; type: IssueType; detail: string;
  owner_name: string | null; owner_id: string | null; is_auto_created: boolean;
  status: IssueStatus; severity: "LOW" | "MEDIUM" | "HIGH"; priority: number;
  due_date: string | null; resolution: string | null; reported_at: string; created_at: string;
  resolved_at: string | null;
  job: { job_code: string; customer_name: string } | null;
  owner: { full_name: string } | null;
};

export const PHASE_TH: Record<string, string> = { SALES: "ขาย", MEASUREMENT: "วัดจริง", PRODUCTION: "ผลิต", INSTALLATION: "ติดตั้ง", POST_SALE: "หลังขาย" };
export const TYPE_TH: Record<string, string> = {
  WRONG_DESIGN: "แบบผิด", CUSTOMER_CHANGES: "ลูกค้าปรับเยอะ", MATERIAL_SHORTAGE: "วัสดุขาด",
  PRODUCTION_DELAY: "ผลิตเลท", INSTALLATION_DELAY: "ติดตั้งช้า", CUSTOMER_COMPLAINT: "ลูกค้าไม่พอใจ", OTHER: "อื่นๆ",
};
export const STATUS_TH: Record<IssueStatus, [string, string]> = {
  OPEN: ["bg-rose-500/25 text-rose-100 border-rose-300/30", "เปิด"],
  IN_PROGRESS: ["bg-amber-500/25 text-amber-100 border-amber-300/30", "กำลังแก้"],
  CLOSED: ["bg-emerald-500/25 text-emerald-100 border-emerald-300/30", "ปิด"],
};
export const SEVERITY_TH: Record<string, [string, string]> = {
  HIGH: ["bg-rose-500/25 text-rose-100 border-rose-300/35", "สูง"],
  MEDIUM: ["bg-amber-500/25 text-amber-100 border-amber-300/35", "กลาง"],
  LOW: ["bg-white/12 text-white/80 border-white/15", "ต่ำ"],
};

// ---------- due + อายุ badge (เขียว<7วัน / เหลือง / แดงเลยกำหนด) ----------
export function dueBadge(due: string | null, closed: boolean): { cls: string; text: string } | null {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  const label = thDate(due);
  if (closed) return { cls: "bg-white/10 text-white/60 border-white/12", text: label };
  if (days < 0) return { cls: "bg-rose-500/30 text-rose-100 border-rose-300/40", text: `${label} · เลย ${-days} วัน` };
  if (days < 7) return { cls: "bg-emerald-500/25 text-emerald-100 border-emerald-300/35", text: `${label} · อีก ${days} วัน` };
  return { cls: "bg-amber-500/20 text-amber-100 border-amber-300/30", text: `${label} · อีก ${days} วัน` };
}

const cellBadge = "inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border whitespace-nowrap";

export function IssueTrackTable({ rows }: { rows: IssueTrackRow[] }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--t-low)" }}>
              {["งาน / ลูกค้า", "Phase", "ประเภท", "ความรุนแรง", "ผู้รับผิดชอบ", "ครบกำหนด", "สถานะ"].map((h) => (
                <th key={h} className="px-4 py-3 text-[12px] font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const closed = i.status === "CLOSED";
              const due = dueBadge(i.due_date, closed);
              const sev = SEVERITY_TH[i.severity] ?? SEVERITY_TH.MEDIUM;
              const ownerName = i.owner?.full_name ?? i.owner_name;
              return (
                <tr key={i.id} className="border-t border-white/8 hover:bg-white/5 transition">
                  <td className="px-4 py-3">
                    <Link href={`/issues/${i.id}`} className="focusable block group">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold tnum">{i.job?.job_code ?? "—"}</span>
                        {i.is_auto_created && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-400/20 text-sky-100 border border-sky-300/25">auto</span>}
                      </div>
                      <div className="text-[12px] truncate max-w-[180px] group-hover:underline" style={{ color: "var(--t-low)" }}>{i.job?.customer_name ?? "—"}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3"><span className="text-white/85 text-[13px]">{PHASE_TH[i.phase] ?? i.phase}</span></td>
                  <td className="px-4 py-3"><span className="text-white/85 text-[13px] whitespace-nowrap">{TYPE_TH[i.type] ?? i.type}</span></td>
                  <td className="px-4 py-3"><span className={`${cellBadge} ${sev[0]}`}>{sev[1]}</span></td>
                  <td className="px-4 py-3"><span className="text-white/85 text-[13px]">{ownerName ?? "—"}</span></td>
                  <td className="px-4 py-3">{due ? <span className={`${cellBadge} ${due.cls} tnum`}>{due.text}</span> : <span className="text-white/35 text-[13px]">—</span>}</td>
                  <td className="px-4 py-3"><span className={`${cellBadge} ${STATUS_TH[i.status][0]}`}>{STATUS_TH[i.status][1]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="md:hidden divide-y divide-white/8">
        {rows.map((i) => {
          const closed = i.status === "CLOSED";
          const due = dueBadge(i.due_date, closed);
          const sev = SEVERITY_TH[i.severity] ?? SEVERITY_TH.MEDIUM;
          const ownerName = i.owner?.full_name ?? i.owner_name;
          return (
            <Link key={i.id} href={`/issues/${i.id}`} className="focusable pressable block p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold tnum">{i.job?.job_code ?? "—"}</span>
                    <span className="text-[12px]" style={{ color: "var(--t-low)" }}>{i.job?.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[12px] text-white/75">{PHASE_TH[i.phase] ?? i.phase} · {TYPE_TH[i.type] ?? i.type}</span>
                  </div>
                  {ownerName && <div className="text-[12px] mt-1" style={{ color: "var(--t-low)" }}>ผู้รับผิดชอบ: {ownerName}</div>}
                </div>
                <span className={`${cellBadge} ${STATUS_TH[i.status][0]} shrink-0`}>{STATUS_TH[i.status][1]}</span>
              </div>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className={`${cellBadge} ${sev[0]}`}>{sev[1]}</span>
                {due && <span className={`${cellBadge} ${due.cls} tnum`}>{due.text}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
