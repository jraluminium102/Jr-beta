"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { Card } from "@/components/ui";
import type { DesignState } from "@/lib/database.types";
import type { DesignerOption } from "@/app/(app)/designer/page";

// ─── คอลัมน์บอร์ด + ภาษาไทย/สี ─────────────────────────────────────────────
const COLUMNS: { state: DesignState; th: string; dot: string }[] = [
  { state: "NOT_STARTED", th: "ยังไม่เริ่ม", dot: "#94a3b8" },
  { state: "DRAWING", th: "กำลังเขียนแบบ", dot: "#2563eb" },
  { state: "PENDING_CUSTOMER", th: "รอลูกค้า", dot: "#d97706" },
  { state: "REVISING", th: "กำลังแก้ไข", dot: "#B3151D" },
  { state: "DONE", th: "เสร็จแล้ว", dot: "#059669" },
];
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  DRAWING: "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอลูกค้า",
  REVISING: "กำลังแก้ไข",
  DONE: "เสร็จแล้ว",
};

type Job = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_id: string | null;
  designer_name: string | null;
  design_state: DesignState;
  design_due_date: string | null;
  design_start: string | null;
  design_end: string | null;
  design_revise_count: number;
  current_stage: number;
  overdue: boolean;
};
type Kpi = {
  total: number;
  overdue: number;
  avg_revise: number;
  per_designer: { designer_id: string | null; name: string; count: number; overdue: number }[];
};
type TimelineItem = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_name: string;
  design_start: string | null;
  design_end: string | null;
  design_due_date: string | null;
  design_state: DesignState;
};

const TODAY = new Date().toISOString().slice(0, 10);

function thDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${(Number(y) + 543) % 100}`;
}

export default function DesignerBoard({ designers, canWrite }: { designers: DesignerOption[]; canWrite: boolean }) {
  const [tab, setTab] = useState<"board" | "timeline">("board");
  const [designerFilter, setDesignerFilter] = useState("");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [moving, setMoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const qs = designerFilter ? `?designer=${designerFilter}` : "";
      const res = await fetch(`/api/designer${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setJobs(json.data.items as Job[]);
      setKpi(json.data.kpi as Kpi);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [designerFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // ย้ายสถานะการ์ด (PATCH /api/designer/[id]) — optimistic ออกจากคอลัมน์เดิม
  async function moveTo(job: Job, state: DesignState) {
    if (state === job.design_state) return;
    setMoving(job.id);
    setErr("");
    try {
      const res = await fetch(`/api/designer/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setMoving(null);
    }
  }

  const byColumn = useMemo(() => {
    const map: Record<DesignState, Job[]> = {
      NOT_STARTED: [],
      DRAWING: [],
      PENDING_CUSTOMER: [],
      REVISING: [],
      DONE: [],
    };
    for (const j of jobs) map[j.design_state]?.push(j);
    return map;
  }, [jobs]);

  return (
    <div className="space-y-5">
      {/* ── หัวเรื่อง ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="building" size={18} />
          </span>
          จัดการงานเขียนแบบ
        </h1>

        {/* ── สลับแท็บ บอร์ด | ไทม์ไลน์ ── */}
        <div className="glass-soft rounded-xl p-1 inline-flex text-sm">
          <button
            onClick={() => setTab("board")}
            className={`press rounded-lg px-3.5 py-1.5 font-medium ${tab === "board" ? "bg-brand text-white shadow-brand" : "text-ink-2"}`}
          >
            บอร์ด
          </button>
          <button
            onClick={() => setTab("timeline")}
            className={`press rounded-lg px-3.5 py-1.5 font-medium ${tab === "timeline" ? "bg-brand text-white shadow-brand" : "text-ink-2"}`}
          >
            ไทม์ไลน์
          </button>
        </div>
      </div>

      {/* ── KPI bar ── */}
      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="งานในมือ" value={kpi.total} />
          <KpiTile label="เลยกำหนด" value={kpi.overdue} accent={kpi.overdue > 0 ? "text-brand" : undefined} />
          <KpiTile label="รอบแก้เฉลี่ย" value={kpi.avg_revise} />
          <KpiTile label="ผู้ออกแบบที่มีงาน" value={kpi.per_designer.filter((d) => d.designer_id).length} />
        </div>
      )}

      {/* ── filter designer ── */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-ink-3">ผู้ออกแบบ:</span>
        <select
          value={designerFilter}
          onChange={(e) => setDesignerFilter(e.target.value)}
          className="glass-soft rounded-lg px-3 py-2 outline-none"
        >
          <option value="">— ทุกคน —</option>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
      </div>

      {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

      {loading ? (
        <Card className="p-10 text-center text-ink-3">กำลังโหลด…</Card>
      ) : tab === "board" ? (
        <BoardView byColumn={byColumn} canWrite={canWrite} moving={moving} onMove={moveTo} />
      ) : (
        <TimelineView />
      )}
    </div>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className={`text-2xl font-bold mt-1 tnum ${accent ?? "text-brand-dark"}`}>{value}</div>
    </Card>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────
function BoardView({
  byColumn,
  canWrite,
  moving,
  onMove,
}: {
  byColumn: Record<DesignState, Job[]>;
  canWrite: boolean;
  moving: string | null;
  onMove: (job: Job, state: DesignState) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      {COLUMNS.map((col) => {
        const items = byColumn[col.state] ?? [];
        return (
          <div key={col.state} className="glass-card rounded-2xl p-3 flex flex-col min-h-[120px]">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-sm font-semibold text-brand-dark flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
                {col.th}
              </span>
              <span className="text-xs text-ink-3 tnum">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-[12px] text-ink-3 px-1 py-3 text-center">— ไม่มีงาน —</p>
              ) : (
                items.map((j) => (
                  <JobCard key={j.id} job={j} canWrite={canWrite} moving={moving === j.id} onMove={onMove} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JobCard({
  job,
  canWrite,
  moving,
  onMove,
}: {
  job: Job;
  canWrite: boolean;
  moving: boolean;
  onMove: (job: Job, state: DesignState) => void;
}) {
  return (
    <div className="glass-soft rounded-xl p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-brand-dark">{job.job_code ?? "—"}</span>
        {job.design_revise_count > 0 && (
          <span className="text-[11px] font-medium text-white bg-brand rounded-full px-1.5 py-0.5">
            แก้ {job.design_revise_count}
          </span>
        )}
      </div>
      <div className="text-ink-2 mt-0.5 truncate">{job.customer_name}</div>
      <div className="text-[12px] text-ink-3 mt-0.5 truncate">
        ผู้ออกแบบ: {job.designer_name ?? "ยังไม่มอบหมาย"}
      </div>
      <div className={`text-[12px] mt-1 ${job.overdue ? "text-brand font-semibold" : "text-ink-3"}`}>
        กำหนด: {thDate(job.design_due_date)}
        {job.overdue && " · เลยกำหนด"}
      </div>

      {canWrite && (
        <div className="mt-2">
          <select
            value={job.design_state}
            disabled={moving}
            onChange={(e) => onMove(job, e.target.value as DesignState)}
            className="w-full glass-soft rounded-lg px-2 py-1.5 text-[12px] outline-none disabled:opacity-60"
          >
            {COLUMNS.map((c) => (
              <option key={c.state} value={c.state}>
                ย้ายไป: {STATE_TH[c.state]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Timeline (Gantt CSS อ่านอย่างเดียว) ───────────────────────────────────
function TimelineView() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/designer/timeline");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "โหลดไทม์ไลน์ไม่สำเร็จ");
        setItems(json.data.items as TimelineItem[]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "โหลดไทม์ไลน์ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // กรอบเวลา: ครอบทุกช่วง start→(end|due|today) + เผื่อขอบ
  const range = useMemo(() => {
    const dates: number[] = [Date.parse(TODAY)];
    for (const it of items) {
      if (it.design_start) dates.push(Date.parse(it.design_start));
      const right = it.design_end ?? it.design_due_date ?? TODAY;
      dates.push(Date.parse(right));
    }
    let min = Math.min(...dates);
    let max = Math.max(...dates);
    const DAY = 86400000;
    min -= 2 * DAY;
    max += 2 * DAY;
    const span = Math.max(max - min, DAY);
    return { min, span, DAY };
  }, [items]);

  function pct(dateMs: number) {
    return ((dateMs - range.min) / range.span) * 100;
  }

  if (loading) return <Card className="p-10 text-center text-ink-3">กำลังโหลด…</Card>;
  if (err) return <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>;
  if (items.length === 0) return <Card className="p-10 text-center text-ink-3">ยังไม่มีงานที่เริ่มเขียนแบบ</Card>;

  const todayLeft = pct(Date.parse(TODAY));

  return (
    <Card className="p-4 overflow-x-auto">
      <div className="min-w-[640px] relative">
        {/* เส้นวันนี้ */}
        <div
          className="absolute top-0 bottom-0 w-px bg-brand/70 z-10"
          style={{ left: `calc(28% + ${todayLeft}% * 0.72)` }}
          title={`วันนี้ ${thDate(TODAY)}`}
        >
          <span className="absolute -top-1 -translate-x-1/2 text-[10px] text-brand font-semibold whitespace-nowrap">
            วันนี้
          </span>
        </div>

        <div className="space-y-1.5 pt-3">
          {items.map((it) => {
            const startMs = it.design_start ? Date.parse(it.design_start) : range.min;
            const endRaw = it.design_end ?? it.design_due_date ?? TODAY;
            const endMs = Math.max(Date.parse(endRaw), startMs + range.DAY);
            const left = pct(startMs);
            const width = Math.max(pct(endMs) - left, 1.5);
            const overdue = !it.design_end && it.design_due_date && it.design_due_date < TODAY;
            return (
              <div key={it.id} className="flex items-center gap-2 text-[12px]">
                {/* ป้ายซ้าย */}
                <div className="w-[28%] shrink-0 truncate pr-2">
                  <span className="font-semibold text-brand-dark">{it.job_code ?? "—"}</span>
                  <span className="text-ink-3"> · {it.designer_name}</span>
                </div>
                {/* แทร็ก */}
                <div className="relative h-6 grow rounded-md bg-black/5">
                  <div
                    className={`absolute top-1 h-4 rounded-md ${overdue ? "bg-brand" : "bg-brand/60"}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${it.customer_name} · ${thDate(it.design_start)} → ${thDate(endRaw)} (${STATE_TH[it.design_state]})`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-black/5 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm bg-brand/60" /> ช่วงเขียนแบบ
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm bg-brand" /> เลยกำหนด
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-px h-3 bg-brand/70" /> เส้นวันนี้
          </span>
        </div>
      </div>
    </Card>
  );
}
