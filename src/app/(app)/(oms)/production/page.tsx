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
import { FloorWorkBadge } from "@/components/ui/FloorWorkBadge";
import { BlockerNotesInline } from "@/components/production/BlockerNotesInline";

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
// แยกเฟส "รอวัด" เป็น 2 ตามว่าได้คิว(วัน)แล้วหรือยัง — มัดจำแล้วยังไม่นัด = รอจัดคิว · นัดแล้ว = รอวัดจริง
type Lane = "office" | "chang" | "issue";
const GROUPS: { key: string; label: string; match: (r: Row) => boolean; tone: string; lane: Lane }[] = [
  { key: "queue_wait", label: "รอจัดคิววัดจริง", match: (r) => r.status === "PENDING_MEASURE" && !r.measure_scheduled, tone: "text-amber-300", lane: "office" },
  { key: "measure", label: "รอวัดจริง", match: (r) => r.status === "PENDING_MEASURE" && !!r.measure_scheduled, tone: "text-sky-300", lane: "office" },
  { key: "prep", label: "เตรียม/ประชุม/แก้แบบ", match: (r) => ["MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM"].includes(r.status), tone: "text-cyan-300", lane: "office" },
  { key: "queued", label: "รอลงผลิต", match: (r) => r.status === "QUEUED", tone: "text-amber-300", lane: "office" },
  { key: "producing", label: "กำลังผลิต", match: (r) => r.status === "MANUFACTURING", tone: "text-orange-300", lane: "chang" },
  { key: "qc", label: "ตรวจ QC", match: (r) => r.status === "QC", tone: "text-purple-300", lane: "chang" },
  { key: "ready", label: "พร้อมติดตั้ง", match: (r) => r.status === "READY", tone: "text-emerald-300", lane: "chang" },
  { key: "issue", label: "มีปัญหา", match: (r) => r.status === "ISSUE", tone: "text-rose-300", lane: "issue" },
];
const LANE_HEAD: Record<Lane, { icon: string; title: string; sub: string }> = {
  office: { icon: "🏢", title: "ช่วงออฟฟิศ · ก่อนลงมือผลิต", sub: "วัด → ประชุม/แบบ → สั่งของ → ส่งเข้าคิวผลิต" },
  chang: { icon: "🔧", title: "ช่วงช่าง · กำลังผลิต", sub: "เริ่มผลิต → QC → ส่งติดตั้ง (ช่างทำในหน้าตารางผลิต)" },
  issue: { icon: "⚠️", title: "มีปัญหา", sub: "ต้องเคลียร์ก่อนไปต่อ" },
};
// label เฟสย่อยสำหรับชิป (PENDING_MEASURE แยก 2 · อื่นๆ ใช้ PROD_STATUS เดิม)
function phaseLabel(r: Row): string {
  if (r.status === "PENDING_MEASURE") return r.measure_scheduled ? "รอวัดจริง" : "รอจัดคิววัดจริง";
  return PROD_STATUS[r.status];
}
const FLOW_ORDER: Record<string, number> = { ISSUE: 0, PENDING_MEASURE: 1, MEASURED: 2, PENDING_MEETING: 3, REVISING: 4, PENDING_CONFIRM: 5, QUEUED: 6, MANUFACTURING: 7, QC: 8, READY: 99 };

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
    queryClient.invalidateQueries({ queryKey: ["overdue-count"] });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    GROUPS.forEach((g) => { c[g.key] = rows.filter((r) => g.match(r)).length; });
    return c;
  }, [rows]);

  const overdue = rows.filter((r) => r.status !== "READY" && daysSince(r.status_updated_at, r.created_at) >= 5);
  const todayJobs = rows.filter((r) => r.measure_scheduled === todayStr || r.planned_install_date === todayStr);
  // เตือนเดดไลน์: วันติดตั้งใกล้ (ภายใน 3 วัน) หรือเลยกำหนด แต่งานยังไม่พร้อมติดตั้ง
  const dueSoon = rows.filter((r) => r.status !== "READY" && r.planned_install_date && r.planned_install_date <= in3days);

  const filtered = useMemo(() => {
    const g = GROUPS.find((x) => x.key === filterKey);
    // ค่าเริ่มต้น (ไม่กรอง) ซ่อนงาน READY = พร้อมติดตั้ง (ส่งเข้าหน้าติดตั้งแล้ว ไม่ต้องรกบอร์ดผลิต)
    // กดการ์ด "พร้อมติดตั้ง" ยังเห็นได้ (g.match)
    let list = g ? rows.filter((r) => g.match(r)) : rows.filter((r) => r.status !== "READY");
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((r) =>
      (r.job?.job_code ?? "").toLowerCase().includes(term) ||
      (r.job?.customer_name ?? "").toLowerCase().includes(term) ||
      (r.job?.customer_area ?? "").toLowerCase().includes(term));
    // ภายใน PENDING_MEASURE: รอจัดคิว (ยังไม่นัด) มาก่อน รอวัดจริง (นัดแล้ว)
    const schedRank = (r: Row) => (r.status === "PENDING_MEASURE" && r.measure_scheduled ? 1 : 0);
    return [...list].sort((a, b) => (FLOW_ORDER[a.status] - FLOW_ORDER[b.status]) || (schedRank(a) - schedRank(b)) || (daysSince(b.status_updated_at, b.created_at) - daysSince(a.status_updated_at, a.created_at)));
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
        </div>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--t-low)" }}>แตะการ์ด/แถวเพื่ออัปเดตงาน · ปุ่มเดียวไปขั้นต่อไป</p>

      {/* ป้ายบอกหน้า: นี่คือหน้าออฟฟิศ (งานตอนผลิตจริงช่างทำที่ "ตารางผลิต") */}
      <div className="flex items-center gap-2 mb-4 rounded-xl px-3.5 py-2.5" style={{ background: "rgba(55,138,221,.12)", border: "1px solid rgba(55,138,221,.28)" }}>
        <span className="text-base">🏢</span>
        <span className="text-[13px]" style={{ color: "#bfdbff" }}>
          หน้านี้สำหรับ<b>ออฟฟิศ</b> — ดูแลงานตั้งแต่วัดจนส่งเข้าคิวผลิต · งานที่ช่างกำลังผลิตดูรายวันที่{" "}
          <Link href="/production-schedule" className="underline underline-offset-2 text-white">ตารางผลิต (ช่าง)</Link>
        </span>
      </div>

      {/* ── Dashboard 2 เลน: ก่อนผลิต (ออฟฟิศ) / กำลังผลิต (ช่าง) ── */}
      {(["office", "chang", "issue"] as const).map((lane) => {
        const gs = GROUPS.filter((g) => g.lane === lane);
        const laneTotal = gs.reduce((n, g) => n + (counts[g.key] ?? 0), 0);
        if (lane === "issue" && laneTotal === 0) return null;   // ซ่อนแถวปัญหาถ้าไม่มี
        const h = LANE_HEAD[lane];
        return (
          <div key={lane} className="mb-3">
            <div className="flex items-baseline gap-2 mb-1.5 px-1">
              <span className="text-sm font-semibold text-white">{h.icon} {h.title}</span>
              <span className="text-[11px]" style={{ color: "var(--t-low)" }}>{h.sub}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {gs.map((g) => (
                <button key={g.key} onClick={() => setFilterKey(filterKey === g.key ? null : g.key)}
                  className={`focusable pressable glass-card rounded-2xl p-3 text-left border-2 ${filterKey === g.key ? "border-white/60" : "border-transparent"}`}>
                  <div className={`text-2xl font-bold tnum ${g.tone}`}>{counts[g.key] ?? 0}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--t-mid)" }}>{g.label}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}

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
        {!filterKey && (counts["ready"] ?? 0) > 0 && (
          <button onClick={() => setFilterKey("ready")}
            className="focusable pressable flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-300/30 rounded-xl px-3 py-2 text-[13px] text-emerald-100">
            <PackageCheck size={15} /> พร้อมติดตั้งแล้ว <b className="tnum">{counts["ready"]}</b> งาน (ซ่อนจากรายการ — แตะดู)
          </button>
        )}
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="ยังไม่มีงานผลิต" sub="งานจะเข้ามาเมื่อลูกค้ามัดจำแล้ว" /> : (
        /* ── ตารางงานช่าง ── */
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const stale = r.status !== "READY" && daysSince(r.status_updated_at, r.created_at) >= 5;
            // ข้อ 7: วันนัดวัด/ติดตั้ง inline
            const showMeasureSched = r.status === "PENDING_MEASURE" && r.measure_scheduled;
            const installSoon = r.planned_install_date && r.planned_install_date <= in3days && r.status !== "READY";
            return (
              // เดิมเป็น <button> ล้วน — เปลี่ยนเป็น div+role="button" เพราะต้องมีปุ่มโน้ต (BlockerNotesInline) ซ้อนข้างใน
              // (nested <button> ใน <button> ผิด HTML spec) ปุ่มซ้อนกด stopPropagation กันชนกับ onClick แถวนี้
              <div key={r.id} role="button" tabIndex={0} onClick={() => setOpen(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(r); } }}
                aria-label={`อัปเดต ${r.job?.job_code}`}
                className={`focusable pressable w-full text-left glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer ${stale ? "ring-1 ring-rose-300/40" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold tnum">{r.job?.job_code}</span>
                    {/* มีงาน ผรม. (0090) — read-only marker ต่อเลขงาน */}
                    <FloorWorkBadge floorWork={r.job?.floor_work} floorNote={r.job?.floor_note} dark />
                    <span className="text-[13px]" style={{ color: "var(--t-mid)" }}>{r.job?.customer_name}</span>
                    {/* โน้ตเด่น "ทำไมยังวัด/ผลิตไม่ได้" (0098) — กดใส่/เอาออกเร็วจากรายการ */}
                    <BlockerNotesInline jobId={r.job_id} customerName={r.job?.customer_name ?? ""} notes={r.job?.job_blocker_notes ?? []} canWrite={canWrite} onChanged={invalidateAll} />
                    {stale && <span className="text-[11px] text-rose-200 flex items-center gap-0.5"><Clock size={11} /> ค้าง {daysSince(r.status_updated_at, r.created_at)} วัน</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Chip>{phaseLabel(r)}</Chip>
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
                  {(showMeasureSched || r.status === "PENDING_MEASURE" || r.planned_install_date) && (
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
              </div>
            );
          })}
          {filtered.length === 0 && <EmptyState title="ไม่มีงานในกลุ่มนี้" />}
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
