"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip, Spinner, EmptyState } from "@/components/ui/primitives";
import { TriangleAlert, Clock, ChevronRight } from "@/components/ui/icons";
import { ProductionStepModal, type ProdRow } from "@/components/production/ProductionStepModal";
import type { ProdStatus } from "@/lib/database.types";

type Row = ProdRow & {
  status_updated_at: string | null; created_at: string;
  measure_scheduled: string | null; planned_install_date: string | null;
};

const today = new Date().toISOString().slice(0, 10);
// กลุ่มสรุปสำหรับ dashboard ช่าง
const GROUPS: { key: string; label: string; statuses: ProdStatus[]; tone: string }[] = [
  { key: "measure", label: "รอวัดจริง", statuses: ["PENDING_MEASURE"], tone: "text-sky-300" },
  { key: "doing", label: "กำลังทำ/ผลิต", statuses: ["MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM", "QUEUED", "MANUFACTURING"], tone: "text-amber-300" },
  { key: "qc", label: "รอ QC", statuses: ["QC"], tone: "text-violet-300" },
  { key: "ready", label: "พร้อมติดตั้ง", statuses: ["READY"], tone: "text-emerald-300" },
  { key: "issue", label: "มีปัญหา", statuses: ["ISSUE"], tone: "text-rose-300" },
];
const FLOW_ORDER: Record<string, number> = { ISSUE: 0, PENDING_MEASURE: 1, MEASURED: 2, PENDING_MEETING: 3, REVISING: 4, PENDING_CONFIRM: 5, QUEUED: 6, MANUFACTURING: 7, QC: 8, READY: 99 };
const KANBAN: ProdStatus[] = ["PENDING_MEASURE", "MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM", "QUEUED", "MANUFACTURING", "QC", "READY", "ISSUE"];

function daysSince(d: string | null, created: string) {
  const base = d ?? created;
  return Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
}

export default function ProductionPage() {
  const [view, setView] = useState<"table" | "board">("table");
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [open, setOpen] = useState<Row | null>(null);

  const { data, isLoading, refetch } = useQuery({ queryKey: ["production"], queryFn: () => api.get<Row[]>("/production") });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    GROUPS.forEach((g) => { c[g.key] = rows.filter((r) => g.statuses.includes(r.status)).length; });
    return c;
  }, [rows]);

  const overdue = rows.filter((r) => r.status !== "READY" && daysSince(r.status_updated_at, r.created_at) >= 5);
  const todayJobs = rows.filter((r) => r.measure_scheduled === today || r.planned_install_date === today);

  const filtered = useMemo(() => {
    const g = GROUPS.find((x) => x.key === filterKey);
    const list = g ? rows.filter((r) => g.statuses.includes(r.status)) : rows;
    return [...list].sort((a, b) => (FLOW_ORDER[a.status] - FLOW_ORDER[b.status]) || (daysSince(b.status_updated_at, b.created_at) - daysSince(a.status_updated_at, a.created_at)));
  }, [rows, filterKey]);

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">งานผลิต</h1>
        <div className="flex gap-1.5 glass-card rounded-xl p-1">
          {[["table", "ตาราง"], ["board", "บอร์ด"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v as "table" | "board")}
              className={`focusable pressable px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] ${view === v ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>{l}</button>
          ))}
        </div>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--t-low)" }}>แตะการ์ด/แถวเพื่ออัปเดตงาน · ปุ่มเดียวไปขั้นต่อไป</p>

      {/* ── Dashboard ช่าง: นับแต่ละสถานะ ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-3">
        {GROUPS.map((g) => (
          <button key={g.key} onClick={() => setFilterKey(filterKey === g.key ? null : g.key)}
            className={`focusable pressable glass-card rounded-2xl p-3 text-left border-2 ${filterKey === g.key ? "border-white/60" : "border-transparent"}`}>
            <div className={`text-2xl font-bold tnum ${g.tone}`}>{counts[g.key] ?? 0}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--t-mid)" }}>{g.label}</div>
          </button>
        ))}
      </div>

      {/* งานค้างนาน + วันนี้ */}
      <div className="flex flex-wrap gap-2 mb-4">
        {overdue.length > 0 && (
          <div className="flex items-center gap-2 bg-rose-500/15 border border-rose-300/30 rounded-xl px-3 py-2 text-[13px] text-rose-100">
            <Clock size={16} /> งานค้างเกิน 5 วัน <b className="tnum">{overdue.length}</b> งาน
          </div>
        )}
        {todayJobs.length > 0 && (
          <div className="flex items-center gap-2 bg-sky-500/15 border border-sky-300/30 rounded-xl px-3 py-2 text-[13px] text-sky-100">
            📅 งานนัดวันนี้ <b className="tnum">{todayJobs.length}</b> งาน
          </div>
        )}
        {filterKey && (
          <button onClick={() => setFilterKey(null)} className="focusable pressable text-[13px] text-white/70 hover:text-white px-3 py-2">ล้างตัวกรอง ✕</button>
        )}
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="ยังไม่มีงานผลิต" sub="งานจะเข้ามาเมื่อลูกค้ามัดจำแล้ว" /> : view === "table" ? (
        /* ── ตารางงานช่าง (default) ── */
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const stale = r.status !== "READY" && daysSince(r.status_updated_at, r.created_at) >= 5;
            return (
              <button key={r.id} onClick={() => setOpen(r)} aria-label={`อัปเดต ${r.job?.job_code}`}
                className={`focusable pressable w-full text-left glass-card rounded-2xl p-4 flex items-center gap-3 ${stale ? "ring-1 ring-rose-300/40" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold tnum">{r.job?.job_code}</span>
                    <span className="text-[13px]" style={{ color: "var(--t-mid)" }}>{r.job?.customer_name}</span>
                    {stale && <span className="text-[11px] text-rose-200 flex items-center gap-0.5"><Clock size={11} /> ค้าง {daysSince(r.status_updated_at, r.created_at)} วัน</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Chip>{PROD_STATUS[r.status]}</Chip>
                    {r.production_queued && <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>คิว: {thDate(r.production_queued)}</span>}
                    {r.production_done && <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>เสร็จ: {thDate(r.production_done)}</span>}
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 bg-white/90 text-[#1F4E78] rounded-xl px-3 py-2.5 text-sm font-semibold min-h-[44px]">อัปเดต <ChevronRight size={16} /></span>
              </button>
            );
          })}
          {filtered.length === 0 && <EmptyState title="ไม่มีงานในกลุ่มนี้" />}
        </div>
      ) : (
        /* ── บอร์ด kanban ── */
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
          {KANBAN.map((col) => {
            const items = rows.filter((r) => r.status === col);
            return (
              <div key={col} className="glass-card rounded-2xl p-3 min-w-[200px] flex-shrink-0 snap-start">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-white text-sm font-semibold">{PROD_STATUS[col]}</span>
                  <span className="text-[12px] tnum px-1.5 py-0.5 rounded-md bg-white/10" style={{ color: "var(--t-mid)" }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <button key={r.id} onClick={() => setOpen(r)} className="focusable pressable w-full text-left bg-white/9 hover:bg-white/16 border border-white/10 rounded-xl p-3">
                      <div className="text-white text-sm font-medium tnum">{r.job?.job_code}</div>
                      <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>{r.job?.customer_name}</div>
                    </button>
                  ))}
                  {items.length === 0 && <div className="text-[12px] text-center py-4" style={{ color: "rgba(255,255,255,0.35)" }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && <ProductionStepModal prod={open} canWrite={canWrite} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); refetch(); }} />}
    </div>
  );
}
