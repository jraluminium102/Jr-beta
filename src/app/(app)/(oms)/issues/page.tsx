"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Tag, Spinner, EmptyState } from "@/components/ui/primitives";
import { ChevronRight, Plus } from "@/components/ui/icons";
import { IssueDrawer, type IssueRow } from "@/components/issues/IssueDrawer";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
import type { IssueStatus } from "@/lib/database.types";

const PHASE_TH: Record<string, string> = { SALES: "ขาย", MEASUREMENT: "วัดจริง", PRODUCTION: "ผลิต", INSTALLATION: "ติดตั้ง", POST_SALE: "หลังขาย" };
const ST: Record<IssueStatus, [string, string]> = {
  OPEN: ["bg-rose-500/25 text-rose-100 border-rose-300/30", "เปิด"],
  IN_PROGRESS: ["bg-amber-500/25 text-amber-100 border-amber-300/30", "กำลังแก้"],
  CLOSED: ["bg-emerald-500/25 text-emerald-100 border-emerald-300/30", "ปิด"],
};
const FILTERS: { v: string; th: string }[] = [
  { v: "ALL", th: "ทั้งหมด" }, { v: "OPEN", th: "เปิด" }, { v: "IN_PROGRESS", th: "กำลังแก้" }, { v: "CLOSED", th: "ปิด" },
];

export default function IssuesPage() {
  const [filter, setFilter] = useState("ALL");
  const [open, setOpen] = useState<IssueRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["issues", filter],
    queryFn: () => api.get<IssueRow[]>(`/issues${filter !== "ALL" ? `?status=${filter}` : ""}`),
  });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Issues</h1>
          <p className="text-sm mb-4" style={{ color: "var(--t-low)" }}>ปัญหาทุก phase · auto-sync จาก Production / ติดตั้ง</p>
        </div>
        {canWrite && (
          <button onClick={() => setCreating(true)} className="focusable pressable flex items-center gap-2 bg-white text-[#1F4E78] rounded-xl px-3.5 sm:px-4 py-2.5 text-sm font-semibold hover:bg-white/90 shadow-lg min-h-[44px] shrink-0">
            <Plus size={18} /> <span className="hidden xs:inline">แจ้งปัญหาใหม่</span><span className="xs:hidden">แจ้ง</span>
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`focusable pressable shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-medium min-h-[40px] border transition ${filter === f.v ? "bg-white text-[#1F4E78] border-white" : "glass-card text-white/70 border-white/12"}`}>
            {f.th}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="ไม่มี issue" sub="งานทุกชิ้นเรียบร้อยดี" /> : (
        <div className="space-y-3">
          {rows.map((i) => (
            <button key={i.id} onClick={() => setOpen(i)} aria-label={`เปิด issue ${i.job?.job_code}`}
              className="focusable pressable w-full text-left glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm tnum">{i.job?.job_code}</span>
                    <span className="text-[12px]" style={{ color: "var(--t-low)" }}>{i.job?.customer_name}</span>
                    <Tag>{PHASE_TH[i.phase] ?? i.phase}</Tag>
                    {i.is_auto_created && <Tag tone="sky">auto</Tag>}
                  </div>
                  <div className="text-sm mt-2 line-clamp-2" style={{ color: "var(--t-hi)" }}>{i.detail}</div>
                  {i.owner_name && <div className="text-[12px] mt-1.5" style={{ color: "var(--t-low)" }}>ผู้รับผิดชอบ: {i.owner_name}</div>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${ST[i.status][0]}`}>{ST[i.status][1]}</span>
                  <ChevronRight size={16} className="text-white/30" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <IssueDrawer issue={open} canWrite={canWrite} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); refetch(); }} />}
      {creating && <CreateIssueModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refetch(); }} />}
    </div>
  );
}
