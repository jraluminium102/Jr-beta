"use client";

/**
 * หน้ารวม BOQ / สโตร์ — 2 แท็บในเมนูเดียว (เจ้าของเคาะ 23 ก.ค.69)
 *   [ความเคลื่อนไหวรายวัน] ประวัติเบิก+รับเข้ารายวัน  ·  [ใบตัด/BOQ] จัดการ+สร้างใบตัด
 */
import { useState } from "react";
import { Providers } from "@/app/providers";
import CutlistListClient from "@/components/cutlist/CutlistListClient";
import DailyMovements from "@/components/cutlist/DailyMovements";

type Row = {
  id: number; code: string; name: string; status: string; job_id: string | null;
  created_at: string; stock_cut_at: string | null;
  jobs?: { job_code: string | null; customer_name: string | null } | null;
};
type JobOpt = { id: string; job_code: string | null; customer_name: string };

export default function BoqTabs({ rows, jobs, canWrite, initialTab }: {
  rows: Row[]; jobs: JobOpt[]; canWrite: boolean; initialTab: "daily" | "cutlist";
}) {
  const [tab, setTab] = useState<"daily" | "cutlist">(initialTab);
  const go = (t: "daily" | "cutlist") => {
    setTab(t);
    // อัปเดต URL ให้แชร์/refresh แล้วอยู่แท็บเดิม (ไม่ยิง server ใหม่)
    try { window.history.replaceState(null, "", `/cutlist?tab=${t}`); } catch { /* ignore */ }
  };

  // /cutlist อยู่นอกโซน (oms) → ไม่มี QueryClientProvider ให้ · ห่อเองเพื่อให้ useQuery ใน DailyMovements ทำงาน
  return (
    <Providers>
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-black/5">
        {([["daily", "📅 ความเคลื่อนไหวรายวัน"], ["cutlist", "✂️ ใบตัด / BOQ"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => go(k)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === k ? "border-brand text-brand-dark" : "border-transparent text-ink-3 hover:text-ink-2"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "daily" ? <DailyMovements /> : <CutlistListClient rows={rows} jobs={jobs} canWrite={canWrite} />}
    </div>
    </Providers>
  );
}
