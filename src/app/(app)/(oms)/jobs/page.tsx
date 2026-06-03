"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { JOB_STATUS } from "@/lib/constants";
import { baht } from "@/lib/format";
import { Chip, Spinner } from "@/components/ui/primitives";
import { Search, Plus, Lock, ChevronRight } from "@/components/ui/icons";
import { CreateJobModal } from "@/components/jobs/CreateJobModal";
import { JobDrawer } from "@/components/jobs/JobDrawer";

type JobRow = {
  id: string; job_code: string; customer_name: string; customer_tel: string | null;
  customer_area: string | null; status: keyof typeof JOB_STATUS;
  estimator: { full_name: string | null } | null; net_amount?: number | null; open_issues: number;
};

export default function JobsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["jobs", q, status],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (status !== "ALL") p.set("status", status);
      return api.get<JobRow[]>(`/jobs?${p}`);
    },
  });

  const rows = data?.data ?? [];
  const canFinance = (data?.meta?.can_finance as boolean) ?? false;

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-4 sm:mb-5 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">งานทั้งหมด</h1>
          <p className="text-sm tnum" style={{ color: "var(--t-low)" }}>{rows.length} งาน</p>
        </div>
        <button onClick={() => setCreating(true)} className="focusable pressable flex items-center gap-2 bg-white text-[#1F4E78] rounded-xl px-3.5 sm:px-4 py-2.5 text-sm font-semibold hover:bg-white/90 shadow-lg min-h-[44px]">
          <Plus size={18} /> <span className="hidden xs:inline">สร้างงานใหม่</span><span className="xs:hidden">สร้าง</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 flex-1 min-h-[44px] focusable" style={{ color: "var(--t-mid)" }}>
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อลูกค้า / Job ID" aria-label="ค้นหางาน"
            className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full" />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="กรองตามสถานะ"
          className="focusable glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] [&>option]:text-gray-800">
          <option value="ALL">ทุกสถานะ</option>
          {Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.th}</option>)}
        </select>
      </div>

      {isLoading ? <Spinner /> : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                    <th className="text-left font-medium px-4 py-3">Job ID</th>
                    <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
                    <th className="text-left font-medium px-4 py-3">พื้นที่</th>
                    <th className="text-left font-medium px-4 py-3">ช่าง</th>
                    {canFinance && <th className="text-right font-medium px-4 py-3">ยอดงาน</th>}
                    <th className="text-left font-medium px-4 py-3">สถานะ</th>
                    <th className="text-center font-medium px-4 py-3">Issues</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.id} tabIndex={0} role="button" onClick={() => setOpenId(j.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(j.id)}
                      className="focusable border-b border-white/6 hover:bg-white/10 cursor-pointer group">
                      <td className="px-4 py-3 text-white font-medium tnum">{j.job_code}</td>
                      <td className="px-4 py-3 text-white/90">{j.customer_name}<div className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>{j.customer_tel}</div></td>
                      <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{j.customer_area ?? "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{j.estimator?.full_name ?? "—"}</td>
                      {canFinance && <td className="px-4 py-3 text-right text-white/90 tnum">{j.net_amount ? baht(j.net_amount) : "—"}</td>}
                      <td className="px-4 py-3"><Chip status={j.status} /></td>
                      <td className="px-4 py-3 text-center">{j.open_issues > 0 ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/90 text-white text-[11px] font-semibold tnum">{j.open_issues}</span> : <span style={{ color: "var(--t-low)" }}>—</span>}</td>
                      <td className="px-2 text-white/30 group-hover:text-white/70"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {rows.map((j) => (
              <button key={j.id} onClick={() => setOpenId(j.id)} className="focusable pressable w-full text-left glass-card rounded-2xl p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm tnum">{j.job_code}</span>
                    {j.open_issues > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/90 text-white text-[11px] font-semibold tnum">{j.open_issues}</span>}
                  </div>
                  <div className="text-white/90 text-sm mt-0.5 truncate">{j.customer_name} · <span style={{ color: "var(--t-low)" }}>{j.customer_area}</span></div>
                  <div className="flex items-center gap-2 mt-2">
                    <Chip status={j.status} />
                    {canFinance && j.net_amount ? <span className="text-[12px] tnum" style={{ color: "var(--t-mid)" }}>{baht(j.net_amount)} ฿</span> : null}
                  </div>
                </div>
                <span className="text-white/40"><ChevronRight size={18} /></span>
              </button>
            ))}
          </div>

          {!canFinance && (
            <p className="flex items-center gap-1.5 text-[12px] mt-3" style={{ color: "var(--t-low)" }}>
              <Lock size={13} /> บทบาทนี้ไม่เห็นข้อมูลยอดเงิน (RBAC)
            </p>
          )}
        </>
      )}

      {creating && <CreateJobModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refetch(); }} />}
      {openId && <JobDrawer jobId={openId} canFinance={canFinance} onClose={() => setOpenId(null)} onChanged={refetch} />}
    </div>
  );
}
