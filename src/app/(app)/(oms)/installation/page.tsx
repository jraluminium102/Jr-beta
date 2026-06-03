"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { INST_STATUS } from "@/lib/constants";
import { Spinner } from "@/components/ui/primitives";
import { ShieldCheck } from "@/components/ui/icons";
import { JobDrawer } from "@/components/jobs/JobDrawer";
import type { InstStatus } from "@/lib/database.types";

type Row = { id: string; job_code: string; customer_name: string; installations: { status: InstStatus }[] };
// ครบทุกสถานะ — กันงานที่ถูกตีกลับ/มีปัญหาหายจากบอร์ด
const COLS: InstStatus[] = ["PENDING", "INSTALLING", "PENDING_INSPECT", "REVISING", "COMPLETED", "ISSUE"];

export default function InstallationPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["jobs", "inst"], queryFn: () => api.get<Row[]>("/jobs?limit=100") });
  const jobs = (data?.data ?? []).filter((j) => j.installations?.length);
  const canFinance = (data?.meta?.can_finance as boolean) ?? false;

  return (
    <div className="p-4 sm:p-6 fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-white">ติดตั้ง + ส่งงาน</h1>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>ติดตั้ง → ลูกค้าตรวจ → จบงาน → รับประกัน · แตะการ์ดเพื่อเปลี่ยนสถานะ</p>
      {isLoading ? <Spinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COLS.map((col) => {
            const items = jobs.filter((j) => j.installations[0]?.status === col);
            return (
              <div key={col} className="glass-card rounded-2xl p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-white text-sm font-semibold">{INST_STATUS[col]}</span>
                  <span className="text-[12px] tnum px-1.5 py-0.5 rounded-md bg-white/10" style={{ color: "var(--t-mid)" }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((j) => (
                    <button key={j.id} onClick={() => setOpenId(j.id)} aria-label={`เปิด ${j.job_code}`}
                      className="focusable pressable w-full text-left bg-white/9 hover:bg-white/16 border border-white/10 rounded-xl p-3">
                      <div className="text-white text-sm font-medium tnum">{j.job_code}</div>
                      <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>{j.customer_name}</div>
                      {col === "COMPLETED" && <div className="flex items-center gap-1 text-emerald-200 text-[11px] mt-1.5"><ShieldCheck size={12} /> อยู่ในประกัน</div>}
                    </button>
                  ))}
                  {items.length === 0 && <div className="text-[12px] text-center py-4" style={{ color: "rgba(255,255,255,0.35)" }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {openId && <JobDrawer jobId={openId} canFinance={canFinance} onClose={() => setOpenId(null)} onChanged={refetch} />}
    </div>
  );
}
