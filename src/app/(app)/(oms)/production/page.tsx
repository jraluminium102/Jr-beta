"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip, Spinner, EmptyState } from "@/components/ui/primitives";
import { TriangleAlert, Clock, ChevronRight, Package, PackageCheck, Search } from "@/components/ui/icons";
import Icon from "@/components/Icon";
import { ProductionStepModal, type ProdRow, type BoqSummary } from "@/components/production/ProductionStepModal";
import type { ProdStatus } from "@/lib/database.types";

type Row = ProdRow & {
  status_updated_at: string | null; created_at: string;
  measure_scheduled: string | null; planned_install_date: string | null;
  producer_note: string | null;
};

// จำนวนวันนับจาก deposit_date ถึงวันนี้ (วัดความด่วน)
function daysSinceDeposit(depositDate: string | null | undefined): number | null {
  if (!depositDate) return null;
  return Math.floor((Date.now() - new Date(depositDate).getTime()) / 86400000);
}

function BoqBadge({ boq }: { boq: BoqSummary | null }) {
  if (!boq) return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-300/25 text-amber-200">
      <TriangleAlert size={10} /> ไม่มี BOQ
    </span>
  );
  if (boq.status === "ordered") return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-300/25 text-emerald-200">
      <PackageCheck size={10} /> สั่งของแล้ว
    </span>
  );
  if (boq.status === "confirmed") return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-300/25 text-sky-200">
      <Package size={10} /> BOQ ยืนยันแล้ว
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-white/8 border border-white/12 text-white/55">
      <Package size={10} /> BOQ ร่าง
    </span>
  );
}

/** แปลง "9.30"→"09:30", "10.00"→"10:00", "09:30"→"09:30" */
function normalizeTime(t: string | null | undefined): string {
  if (!t) return "";
  const s = t.trim().replace(".", ":");
  const [h, m] = s.split(":");
  if (!h) return "";
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

const todayStr = new Date().toISOString().slice(0, 10);
// กลุ่มสรุปสำหรับ dashboard ช่าง
const GROUPS: { key: string; label: string; statuses: ProdStatus[]; tone: string }[] = [
  { key: "measure", label: "รอวัดจริง", statuses: ["PENDING_MEASURE"], tone: "text-sky-300" },
  { key: "prep", label: "เตรียม/ประชุม/แก้แบบ", statuses: ["MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM"], tone: "text-cyan-300" },
  { key: "producing", label: "กำลังผลิต", statuses: ["QUEUED", "MANUFACTURING"], tone: "text-orange-300" },
  { key: "qc", label: "รอ QC", statuses: ["QC"], tone: "text-violet-300" },
  { key: "ready", label: "พร้อมติดตั้ง", statuses: ["READY"], tone: "text-emerald-300" },
  { key: "issue", label: "มีปัญหา", statuses: ["ISSUE"], tone: "text-rose-300" },
];
const FLOW_ORDER: Record<string, number> = { ISSUE: 0, PENDING_MEASURE: 1, MEASURED: 2, PENDING_MEETING: 3, REVISING: 4, PENDING_CONFIRM: 5, QUEUED: 6, MANUFACTURING: 7, QC: 8, READY: 99 };
const KANBAN: ProdStatus[] = ["PENDING_MEASURE", "MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM", "QUEUED", "MANUFACTURING", "QC", "READY", "ISSUE"];

const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

function daysSince(d: string | null, created: string) {
  const base = d ?? created;
  return Math.floor((Date.now() - new Date(base).getTime()) / 86400000);
}

// ── Deep-link handler (useSearchParams ต้อง Suspense) ────────────────────────
function DeepLinkHandler({ rows, setOpen, setFilterKey }: {
  rows: Row[];
  setOpen: (r: Row | null) => void;
  setFilterKey: (k: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [notFound, setNotFound] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("open");
    if (!id || rows.length === 0) return;

    // ล้าง param ก่อน (ไม่ว่าจะเจอหรือไม่)
    router.replace("/production", { scroll: false });

    const target = rows.find((r) => r.id === id);
    if (target) {
      setOpen(target);
      // ถ้าถูกกรองอยู่ ล้าง filter ให้เห็น
      setFilterKey(null);
    } else {
      setNotFound(id);
      setTimeout(() => setNotFound(null), 4000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rows]);

  if (!notFound) return null;
  return (
    <div className="mb-3 rounded-xl border border-amber-300/30 bg-amber-500/15 px-3.5 py-2.5 text-[13px] text-amber-100 flex items-center gap-2">
      <TriangleAlert size={15} className="shrink-0 text-amber-300" />
      ไม่พบงานนี้แล้ว (อาจถูกอัปเดตไปขั้นอื่น)
    </div>
  );
}

export default function ProductionPage() {
  const [view, setView] = useState<"table" | "board">("table");
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Row | null>(null);

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["production"], queryFn: () => api.get<Row[]>("/production") });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["production"] });
    queryClient.invalidateQueries({ queryKey: ["measure-schedule"] });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    GROUPS.forEach((g) => { c[g.key] = rows.filter((r) => g.statuses.includes(r.status)).length; });
    return c;
  }, [rows]);

  const overdue = rows.filter((r) => r.status !== "READY" && daysSince(r.status_updated_at, r.created_at) >= 5);
  const todayJobs = rows.filter((r) => r.measure_scheduled === todayStr || r.planned_install_date === todayStr);
  // เตือนเดดไลน์: วันติดตั้งใกล้ (ภายใน 3 วัน) หรือเลยกำหนด แต่งานยังไม่พร้อมติดตั้ง
  const dueSoon = rows.filter((r) => r.status !== "READY" && r.planned_install_date && r.planned_install_date <= in3days);

  const filtered = useMemo(() => {
    const g = GROUPS.find((x) => x.key === filterKey);
    let list = g ? rows.filter((r) => g.statuses.includes(r.status)) : rows;
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((r) =>
      (r.job?.job_code ?? "").toLowerCase().includes(term) ||
      (r.job?.customer_name ?? "").toLowerCase().includes(term) ||
      (r.job?.customer_area ?? "").toLowerCase().includes(term));
    return [...list].sort((a, b) => (FLOW_ORDER[a.status] - FLOW_ORDER[b.status]) || (daysSince(b.status_updated_at, b.created_at) - daysSince(a.status_updated_at, a.created_at)));
  }, [rows, filterKey, q]);

  return (
    <div className="p-4 sm:p-6 fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-white">งานผลิต</h1>
        <div className="flex items-center gap-2">
          {/* ข้อ 5: shortcut ไปหน้านัดวัดจริง */}
          <Link
            href="/measure-schedule"
            className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl glass-card border border-white/15 text-white text-[13px] font-medium min-h-[40px]"
          >
            <Icon name="ruler" size={14} />
            นัดวัดจริง
          </Link>
          <div className="flex gap-1.5 glass-card rounded-xl p-1">
            {[["table", "ตาราง"], ["board", "บอร์ด"]].map(([v, l]) => (
              <button key={v} onClick={() => setView(v as "table" | "board")}
                className={`focusable pressable px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] ${view === v ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--t-low)" }}>แตะการ์ด/แถวเพื่ออัปเดตงาน · ปุ่มเดียวไปขั้นต่อไป</p>

      {/* ── Dashboard ช่าง: นับแต่ละสถานะ ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-3">
        {GROUPS.map((g) => (
          <button key={g.key} onClick={() => setFilterKey(filterKey === g.key ? null : g.key)}
            className={`focusable pressable glass-card rounded-2xl p-3 text-left border-2 ${filterKey === g.key ? "border-white/60" : "border-transparent"}`}>
            <div className={`text-2xl font-bold tnum ${g.tone}`}>{counts[g.key] ?? 0}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--t-mid)" }}>{g.label}</div>
          </button>
        ))}
      </div>

      {/* ค้นหา */}
      <label className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 mb-3 focusable" style={{ color: "var(--t-mid)" }}>
        <Search size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา job / ชื่อลูกค้า / พื้นที่…" aria-label="ค้นหางานผลิต"
          className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full" />
        {q && <button onClick={() => setQ("")} aria-label="ล้าง" className="text-white/50 hover:text-white text-sm">✕</button>}
      </label>

      {/* Deep-link (ข้อ 3) — ต้องครอบ Suspense เพราะ useSearchParams */}
      <Suspense>
        <DeepLinkHandler rows={rows} setOpen={setOpen} setFilterKey={setFilterKey} />
      </Suspense>

      {/* งานค้างนาน + ใกล้เดดไลน์ + วันนี้ */}
      <div className="flex flex-wrap gap-2 mb-4">
        {dueSoon.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-300/40 rounded-xl px-3 py-2 text-[13px] text-amber-100 font-semibold">
            <Clock size={15} /> ใกล้/เลยวันติดตั้ง (ยังไม่พร้อม) <b className="tnum">{dueSoon.length}</b> งาน
          </div>
        )}
        {overdue.length > 0 && (
          <div className="flex items-center gap-2 bg-rose-500/15 border border-rose-300/30 rounded-xl px-3 py-2 text-[13px] text-rose-100">
            <Clock size={16} /> งานค้างเกิน 5 วัน <b className="tnum">{overdue.length}</b> งาน
          </div>
        )}
        {todayJobs.length > 0 && (
          <div className="flex items-center gap-2 bg-sky-500/15 border border-sky-300/30 rounded-xl px-3 py-2 text-[13px] text-sky-100">
            <Icon name="calendar" size={15} /> งานนัดวันนี้ <b className="tnum">{todayJobs.length}</b> งาน
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
            // ข้อ 7: วันนัดวัด/ติดตั้ง inline
            const showMeasureSched = r.status === "PENDING_MEASURE" && r.measure_scheduled;
            const installSoon = r.planned_install_date && r.planned_install_date <= in3days && r.status !== "READY";
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
                    <BoqBadge boq={r.boq_summary} />
                    {r.production_queued && <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>คิว: {thDate(r.production_queued)}</span>}
                    {r.production_done && <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>เสร็จ: {thDate(r.production_done)}</span>}
                    {r.job?.deposit_date && (() => {
                      const n = daysSinceDeposit(r.job?.deposit_date);
                      return (
                        <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>
                          มัดจำ: {thDate(r.job.deposit_date)}{n !== null ? <span className="ml-1 opacity-70">{n >= 0 ? `(รอ ${n} วัน)` : `(อีก ${-n} วัน)`}</span> : null}
                        </span>
                      );
                    })()}
                  </div>
                  {/* ข้อ 7: inline date chips */}
                  {(showMeasureSched || r.planned_install_date) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {showMeasureSched && (
                        <span className="text-[12px] tnum inline-flex items-center gap-1" style={{ color: "var(--t-low)" }}>
                          <Icon name="calendar" size={11} />
                          นัดวัด: {thDate(r.measure_scheduled)}{r.measure_time ? ` ${normalizeTime(r.measure_time)}` : ""}
                        </span>
                      )}
                      {!showMeasureSched && r.status === "PENDING_MEASURE" && (
                        <span className="text-[12px] inline-flex items-center gap-1 text-amber-200">
                          <Icon name="calendar" size={11} /> ยังไม่นัด
                        </span>
                      )}
                      {r.planned_install_date && (
                        <span className={`text-[12px] tnum inline-flex items-center gap-1 ${installSoon ? "text-amber-200" : ""}`} style={installSoon ? undefined : { color: "var(--t-low)" }}>
                          <Icon name="wrench" size={11} />
                          ติดตั้ง: {thDate(r.planned_install_date)}
                        </span>
                      )}
                    </div>
                  )}
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
                      <div className="mt-1.5"><BoqBadge boq={r.boq_summary} /></div>
                    </button>
                  ))}
                  {items.length === 0 && <div className="text-[12px] text-center py-4" style={{ color: "rgba(255,255,255,0.35)" }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <ProductionStepModal
          prod={open}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onSavedInPlace={() => invalidateAll()}
          onSavedAndClose={() => { setOpen(null); invalidateAll(); }}
        />
      )}
    </div>
  );
}
