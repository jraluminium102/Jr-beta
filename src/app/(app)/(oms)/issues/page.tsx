"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatCard, Spinner, EmptyState } from "@/components/ui/primitives";
import { Plus } from "@/components/ui/icons";
import { IssueTrackTable, type IssueTrackRow, PHASE_TH } from "@/components/issues/IssueTrackTable";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";

type Owner = { id: string; full_name: string };
type Aggregate = {
  total: number; open: number;
  by_status: Record<string, number>; by_severity: Record<string, number>;
  overdue: number; urgent: number; oldest_days: number;
};

// แต่ละตัวกรอง = query param เดียว (compose เป็น query string)
const STATUS_OPTS = [["", "สถานะทั้งหมด"], ["OPEN", "เปิด"], ["IN_PROGRESS", "กำลังแก้"], ["CLOSED", "ปิด"]];
const SEVERITY_OPTS = [["", "ความรุนแรงทั้งหมด"], ["HIGH", "สูง"], ["MEDIUM", "กลาง"], ["LOW", "ต่ำ"]];
const PHASE_OPTS = [["", "ทุก phase"], ...Object.entries(PHASE_TH)];

const selCls = "focusable glass-card rounded-xl px-3 py-2 text-[13px] text-white outline-none min-h-[40px] [&>option]:text-gray-800";

export default function IssuesPage() {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [phase, setPhase] = useState("");
  const [owner, setOwner] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [creating, setCreating] = useState(false);

  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (severity) qs.set("severity", severity);
  if (phase) qs.set("phase", phase);
  if (owner) qs.set("owner", owner);
  if (overdue) qs.set("overdue", "1");
  const query = qs.toString();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["issues", query],
    queryFn: () => api.get<IssueTrackRow[]>(`/issues${query ? `?${query}` : ""}`),
  });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const owners = (data?.meta?.owners as Owner[]) ?? [];
  const agg = data?.meta?.aggregate as Aggregate | undefined;

  const hasFilter = !!(status || severity || phase || owner || overdue);
  const clearFilters = () => { setStatus(""); setSeverity(""); setPhase(""); setOwner(""); setOverdue(false); };

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">ระบบปัญหางาน</h1>
          <p className="text-sm" style={{ color: "var(--t-low)" }}>ติดตามปัญหาทุก phase · จัดลำดับด่วน · ครบกำหนด</p>
        </div>
        {canWrite && (
          <button onClick={() => setCreating(true)} className="focusable pressable flex items-center gap-2 bg-white text-[#B3151D] rounded-xl px-3.5 sm:px-4 py-2.5 text-sm font-semibold hover:bg-white/90 shadow-lg min-h-[44px] shrink-0">
            <Plus size={18} /> <span className="hidden xs:inline">แจ้งปัญหาใหม่</span><span className="xs:hidden">แจ้ง</span>
          </button>
        )}
      </div>

      {/* แถบสรุปแอดมิน */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="เปิดอยู่" value={agg?.open ?? "—"} sub={`ทั้งหมด ${agg?.total ?? 0} รายการ`} />
        <StatCard label="เลยกำหนด" value={agg?.overdue ?? "—"} accent="text-rose-300" sub="ยังไม่ปิด · พ้นกำหนด" />
        <StatCard label="ด่วน" value={agg?.urgent ?? "—"} accent="text-amber-300" sub="รุนแรงสูง / priority สูง" />
        <StatCard label="ค้างนานสุด" value={agg ? `${agg.oldest_days} วัน` : "—"} sub="อายุ issue ที่ยังเปิด" />
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="กรองสถานะ" className={selCls}>
          {STATUS_OPTS.map(([v, th]) => <option key={v} value={v}>{th}</option>)}
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="กรองความรุนแรง" className={selCls}>
          {SEVERITY_OPTS.map(([v, th]) => <option key={v} value={v}>{th}</option>)}
        </select>
        <select value={phase} onChange={(e) => setPhase(e.target.value)} aria-label="กรอง phase" className={selCls}>
          {PHASE_OPTS.map(([v, th]) => <option key={v} value={v}>{th}</option>)}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="กรองผู้รับผิดชอบ" className={selCls}>
          <option value="">ผู้รับผิดชอบทั้งหมด</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        <button onClick={() => setOverdue((v) => !v)} aria-pressed={overdue}
          className={`focusable pressable px-3.5 py-2 rounded-xl text-[13px] font-medium min-h-[40px] border transition ${overdue ? "bg-rose-500/30 text-rose-100 border-rose-300/40" : "glass-card text-white/70 border-white/12"}`}>
          เฉพาะเลยกำหนด
        </button>
        {hasFilter && (
          <button onClick={clearFilters} className="focusable pressable px-3 py-2 rounded-xl text-[13px] min-h-[40px] text-white/60 hover:text-white">ล้างตัวกรอง</button>
        )}
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title="ไม่มี issue" sub={hasFilter ? "ไม่พบตามตัวกรอง" : "งานทุกชิ้นเรียบร้อยดี"} />
      ) : (
        <IssueTrackTable rows={rows} />
      )}

      {creating && <CreateIssueModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refetch(); }} />}
    </div>
  );
}
