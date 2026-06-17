"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Card } from "@/components/ui";
import DateField from "@/components/ui/DateField";
import type { DesignState } from "@/lib/database.types";
import type { DesignerOption } from "@/app/(app)/designer/page";
import AddDesignWorkModal from "@/components/designer/AddDesignWorkModal";
import DesignerSchedule from "@/components/designer/DesignerSchedule";

// ─── Column config + Thai labels ─────────────────────────────────────────────
const COLUMNS: { state: DesignState; th: string; dot: string }[] = [
  { state: "NOT_STARTED",      th: "ยังไม่เริ่ม",       dot: "#94a3b8" },
  { state: "DRAWING",          th: "กำลังเขียนแบบ",     dot: "#2563eb" },
  { state: "PENDING_CUSTOMER", th: "รอเซลล์ตรวจแบบ",          dot: "#d97706" },
  { state: "REVISING",         th: "กำลังแก้ไข",        dot: "#B3151D" },
  { state: "DONE",             th: "เสร็จแล้ว",         dot: "#059669" },
];
const STATE_TH: Record<DesignState, string> = {
  NOT_STARTED:      "ยังไม่เริ่ม",
  DRAWING:          "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอเซลล์ตรวจแบบ",
  REVISING:         "กำลังแก้ไข",
  DONE:             "เสร็จแล้ว",
};

type Job = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_id: string | null;
  designer_ref: number | null;
  designer_name: string | null;
  design_state: DesignState;
  design_due_date: string | null;
  design_received_date: string | null;
  design_start: string | null;
  design_end: string | null;
  design_revise_count: number;
  current_stage: number;
  assess_date: string | null;
  onsite_deposit: boolean; // (0044) ป้ายมัดจำหน้างาน
  overdue: boolean;
};
type Kpi = {
  total: number;
  overdue: number;
  avg_revise: number;
  per_designer: {
    designer_ref: number | null;
    name: string;
    count: number;
    overdue: number;
    done: number;
  }[];
};
const TODAY = new Date().toISOString().slice(0, 10);

// Board DONE column: show only jobs completed within the last N days (client-side)
const DONE_BOARD_DAYS = 45;
function doneCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - DONE_BOARD_DAYS);
  return d.toISOString().slice(0, 10);
}

function thDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${(Number(y) + 543) % 100}`;
}

export default function DesignerBoard({
  designers: initialDesigners,
  canWrite,
}: {
  designers: DesignerOption[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<"board" | "schedule">("board");
  const [designerFilter, setDesignerFilter] = useState("");
  // Client-side card search (by customer name / job code)
  const [cardSearch, setCardSearch] = useState("");
  // Add-work modal visibility
  const [showAddModal, setShowAddModal] = useState(false);

  const [designers, setDesigners] = useState<DesignerOption[]>(initialDesigners);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

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

  // Reload designers list (after adding new one)
  const reloadDesigners = useCallback(async () => {
    try {
      const res = await fetch("/api/designers");
      const json = await res.json();
      if (res.ok) setDesigners(json.data.designers as DesignerOption[]);
    } catch {
      // non-critical: keep current list
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Assign designer_ref — also triggers auto-deadline on first assignment
  async function assignDesigner(job: Job, designerRef: number | null) {
    if (designerRef === (job.designer_ref ?? null)) return;
    setAssigning(job.id);
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designer_ref: designerRef }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "มอบหมายงานไม่สำเร็จ");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "มอบหมายงานไม่สำเร็จ");
    } finally {
      setAssigning(null);
    }
  }

  // Update design_due_date directly from the card's date input
  async function updateDueDate(job: Job, date: string) {
    if (date === (job.design_due_date ?? "")) return;
    setAssigning(job.id); // reuse assigning flag to show busy
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design_due_date: date || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แก้ไขกำหนดส่งไม่สำเร็จ");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "แก้ไขกำหนดส่งไม่สำเร็จ");
    } finally {
      setAssigning(null);
    }
  }

  // (0032) Update วันได้รับแบบ จาก input บนการ์ด
  async function updateReceivedDate(job: Job, date: string) {
    if (date === (job.design_received_date ?? "")) return;
    setAssigning(job.id);
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design_received_date: date || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แก้ไขวันได้รับแบบไม่สำเร็จ");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "แก้ไขวันได้รับแบบไม่สำเร็จ");
    } finally {
      setAssigning(null);
    }
  }

  // ลำดับขั้นปกติ — ใช้ตรวจว่า "ข้ามขั้น" หรือไม่
  const STATE_ORDER: DesignState[] = [
    "NOT_STARTED", "DRAWING", "PENDING_CUSTOMER", "REVISING", "DONE",
  ];

  // Move design_state (PATCH /api/designer/[id])
  async function moveTo(job: Job, state: DesignState) {
    if (state === job.design_state) return;

    const fromIdx = STATE_ORDER.indexOf(job.design_state);
    const toIdx   = STATE_ORDER.indexOf(state);

    // ยืนยันก่อนปิดงาน (DONE)
    if (state === "DONE") {
      const confirmed = window.confirm(
        `ยืนยันปิดงานเขียนแบบ "${job.customer_name}" (${job.job_code ?? "—"})?\nระบบจะ stamp วันเสร็จ`
      );
      if (!confirmed) return;
    } else if (toIdx < fromIdx) {
      // ถอยหลัง — ต้องยืนยันเสมอ (#16)
      const confirmed = window.confirm(
        `ยืนยันถอยสถานะจาก "${STATE_TH[job.design_state]}" กลับไป "${STATE_TH[state]}"?`
      );
      if (!confirmed) return;
    } else if (toIdx - fromIdx > 1) {
      // ข้ามขั้นมากกว่า 1 ขั้น — เตือน (DB ยังเป็นคนตัดสินใจสุดท้าย)
      const confirmed = window.confirm(
        `กำลังย้ายจาก "${STATE_TH[job.design_state]}" ไป "${STATE_TH[state]}" (ข้ามขั้น)\nต้องการดำเนินการต่อหรือไม่?`
      );
      if (!confirmed) return;
    }

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
    // Apply client-side text filter (job_code or customer_name)
    const q = cardSearch.trim().toLowerCase();
    const filtered = q
      ? jobs.filter(
          (j) =>
            j.customer_name.toLowerCase().includes(q) ||
            (j.job_code ?? "").toLowerCase().includes(q)
        )
      : jobs;
    const cutoff = doneCutoff();
    for (const j of filtered) {
      if (j.design_state === "DONE") {
        // Board DONE column: show only recent completions (design_end within last 45 days)
        if (!j.design_end || j.design_end < cutoff) continue;
      }
      map[j.design_state]?.push(j);
    }
    // ช่อง "เสร็จแล้ว": เรียงตามวันเสร็จจากเก่า→ใหม่ → งานที่กดเสร็จล่าสุดอยู่ล่างสุด
    map.DONE.sort((a, b) => (a.design_end ?? "").localeCompare(b.design_end ?? ""));
    return map;
  }, [jobs, cardSearch]);

  // Total DONE count across all visible cards
  const doneCount = byColumn["DONE"].length;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="building" size={18} />
          </span>
          จัดการงานเขียนแบบ
        </h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ── Add work button (canWrite only) ── */}
          {canWrite && (
            <button
              onClick={() => setShowAddModal(true)}
              className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold bg-brand text-white shadow-brand min-h-[44px] hover:bg-brand/90"
              aria-label="เพิ่มงานเขียนแบบ"
            >
              <Icon name="plus" size={16} />
              เพิ่มงานเขียนแบบ
            </button>
          )}

          {/* ── Tab switch ── */}
          <div className="glass-soft rounded-xl p-1 inline-flex text-sm">
            <button
              onClick={() => setTab("board")}
              className={`press rounded-lg px-3.5 py-1.5 font-medium ${tab === "board" ? "bg-brand text-white shadow-brand" : "text-ink-2"}`}
            >
              บอร์ด
            </button>
            <button
              onClick={() => setTab("schedule")}
              className={`press rounded-lg px-3.5 py-1.5 font-medium ${tab === "schedule" ? "bg-brand text-white shadow-brand" : "text-ink-2"}`}
            >
              ตารางเวลา
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI bar ── */}
      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="งานในมือ" value={kpi.total} />
          <KpiTile label="เลยกำหนด" value={kpi.overdue} accent={kpi.overdue > 0 ? "text-brand" : undefined} />
          <KpiTile label="รอบแก้เฉลี่ย" value={kpi.avg_revise} />
          <KpiTile label="เสร็จแล้ว (ล่าสุด)" value={doneCount} accent="text-emerald-600" />
        </div>
      )}

      {/* ── Filters row: designer + card search ── */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-ink-3 shrink-0">ผู้ออกแบบ:</span>
        <select
          value={designerFilter}
          onChange={(e) => setDesignerFilter(e.target.value)}
          className="glass-soft rounded-lg px-3 py-2 outline-none"
        >
          <option value="">— ทุกคน —</option>
          {designers.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>

        {/* Client-side card search — filters visible cards by customer name / job code */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
            <Icon name="search" size={14} />
          </span>
          <input
            type="search"
            value={cardSearch}
            onChange={(e) => setCardSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / Job code…"
            aria-label="ค้นหาการ์ดบนบอร์ด"
            className="w-full glass-soft rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
          />
        </div>
      </div>

      {err && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      {loading ? (
        <Card className="p-10 text-center text-ink-3">กำลังโหลด…</Card>
      ) : tab === "board" ? (
        <BoardView
          byColumn={byColumn}
          canWrite={canWrite}
          moving={moving}
          assigning={assigning}
          designers={designers}
          onMove={moveTo}
          onAssign={assignDesigner}
          onDueDate={updateDueDate}
          onReceivedDate={updateReceivedDate}
          onDesignerAdded={reloadDesigners}
        />
      ) : (
        <DesignerSchedule
          jobs={jobs}
          designers={designers}
          canWrite={canWrite}
          designerFilter={designerFilter}
          onRefresh={load}
        />
      )}

      {/* ── Add-work modal (rendered at root level to avoid stacking context issues) ── */}
      {showAddModal && (
        <AddDesignWorkModal
          designers={designers}
          onClose={() => setShowAddModal(false)}
          onAdded={async () => { await load(); }}
        />
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

// ─── Board ────────────────────────────────────────────────────────────────────
function BoardView({
  byColumn,
  canWrite,
  moving,
  assigning,
  designers,
  onMove,
  onAssign,
  onDueDate,
  onReceivedDate,
  onDesignerAdded,
}: {
  byColumn: Record<DesignState, Job[]>;
  canWrite: boolean;
  moving: string | null;
  assigning: string | null;
  designers: DesignerOption[];
  onMove: (job: Job, state: DesignState) => void;
  onAssign: (job: Job, designerRef: number | null) => void;
  onDueDate: (job: Job, date: string) => void;
  onReceivedDate: (job: Job, date: string) => void;
  onDesignerAdded: () => Promise<void>;
}) {
  // auto-fit: คอลัมน์กว้าง ≥240px เสมอ · จัดจำนวนคอลัมน์ให้พอดีจอเอง (ไม่ scroll ซ้ายขวา ไม่มีช่องเล็ก)
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
      {COLUMNS.map((col) => {
        const items = byColumn[col.state] ?? [];
        return (
          <div key={col.state} className="glass-card rounded-2xl p-3 flex flex-col min-w-0 min-h-[120px] lg:max-h-[calc(100dvh-250px)]">
            <div className="flex items-center justify-between mb-2.5 px-1 shrink-0">
              <span className="text-sm font-semibold text-brand-dark flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
                {col.th}
              </span>
              <span className="text-xs text-ink-3 tnum">{items.length}</span>
            </div>
            <div className="space-y-2 overflow-y-auto lg:flex-1 lg:min-h-0 pr-0.5">
              {items.length === 0 ? (
                <p className="text-[12px] text-ink-3 px-1 py-3 text-center">— ไม่มีงาน —</p>
              ) : (
                items.map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    canWrite={canWrite}
                    moving={moving === j.id}
                    assigning={assigning === j.id}
                    designers={designers}
                    onMove={onMove}
                    onAssign={onAssign}
                    onDueDate={onDueDate}
                    onReceivedDate={onReceivedDate}
                    onDesignerAdded={onDesignerAdded}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────
function JobCard({
  job,
  canWrite,
  moving,
  assigning,
  designers,
  onMove,
  onAssign,
  onDueDate,
  onReceivedDate,
  onDesignerAdded,
}: {
  job: Job;
  canWrite: boolean;
  moving: boolean;
  assigning: boolean;
  designers: DesignerOption[];
  onMove: (job: Job, state: DesignState) => void;
  onAssign: (job: Job, designerRef: number | null) => void;
  onDueDate: (job: Job, date: string) => void;
  onReceivedDate: (job: Job, date: string) => void;
  onDesignerAdded: () => Promise<void>;
}) {
  // toast feedback สำหรับ #37 (บันทึกกำหนดส่ง)
  const [dueSaved, setDueSaved] = useState(false);

  // controlled state สำหรับ date inputs — sync จาก prop เมื่อ job reload
  const [dueDateVal, setDueDateVal] = useState(job.design_due_date ?? "");
  const [receivedDateVal, setReceivedDateVal] = useState(job.design_received_date ?? "");

  useEffect(() => {
    setDueDateVal(job.design_due_date ?? "");
  }, [job.design_due_date]);

  useEffect(() => {
    setReceivedDateVal(job.design_received_date ?? "");
  }, [job.design_received_date]);

  // บันทึกทันทีเมื่อเลือก/พิมพ์วัน (รองรับทั้งปฏิทิน+พิมพ์มือ) · ใช้ค่า iso ตรงๆ กัน state ค้าง
  // ทำงานทุกสถานะรวม "ยังไม่เริ่ม" (วางแผนล่วงหน้าได้)
  async function saveDue(iso: string) {
    if (iso === (job.design_due_date ?? "")) return;
    if (iso && iso < TODAY) {
      const ok = window.confirm(`กำหนดเสร็จที่เลือก (${iso}) เป็นวันในอดีต\nยืนยันบันทึกหรือไม่?`);
      if (!ok) { setDueDateVal(job.design_due_date ?? ""); return; }
    }
    await onDueDate(job, iso);
    setDueSaved(true);
    setTimeout(() => setDueSaved(false), 2000);
  }

  async function saveReceived(iso: string) {
    if (iso === (job.design_received_date ?? "")) return;
    await onReceivedDate(job, iso);
    // auto กำหนดเสร็จ = ได้รับแบบ + 2 วัน (ถ้ายังไม่เคยตั้งกำหนด · แก้ทีหลังได้)
    if (iso && !(job.design_due_date ?? "")) {
      const d = new Date(iso + "T00:00:00");
      d.setDate(d.getDate() + 2);
      const due2 = d.toISOString().slice(0, 10);
      setDueDateVal(due2);
      await onDueDate(job, due2);
    }
  }

  return (
    <div className="glass-soft rounded-xl p-3 text-sm w-full min-w-0 overflow-hidden">
      {/* job_code + ปุ่มดูงาน (#26) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={`/jobs?open=${job.id}`}
            className="font-semibold text-brand-dark hover:underline focus:outline-none focus:ring-2 focus:ring-brand/40 rounded"
            aria-label={`ดูงาน ${job.job_code ?? ""}`}
          >
            {job.job_code ?? "—"}
          </a>
          <a
            href={`/jobs?open=${job.id}`}
            className="inline-flex items-center gap-0.5 text-[10px] text-ink-3 hover:text-brand border border-ink-3/30 hover:border-brand/40 rounded px-1 py-0.5 min-h-[22px] focus:outline-none focus:ring-2 focus:ring-brand/40"
            aria-label="ดูงาน"
            tabIndex={0}
          >
            <Icon name="external" size={10} />
            ดูงาน
          </a>
        </div>
        {job.design_revise_count > 0 && (
          <span className="text-[11px] font-medium text-white bg-brand rounded-full px-1.5 py-0.5 shrink-0">
            แก้ {job.design_revise_count}
          </span>
        )}
      </div>
      <div className="text-ink-2 mt-0.5 truncate" title={job.customer_name}>
        {job.customer_name}
      </div>
      {/* (0044) ป้ายมัดจำหน้างาน · ด่วน — แสดงเฉพาะงานที่ยังไม่เสร็จแบบ */}
      {job.onsite_deposit && job.design_state !== "DONE" && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <Icon name="warn" size={11} />
          มัดจำหน้างาน · ด่วน
        </div>
      )}

      {canWrite ? (
        <div className="mt-2 space-y-1.5">
          {/* Assign designer from designers lookup table */}
          <DesignerSelect
            job={job}
            designers={designers}
            assigning={assigning}
            onAssign={onAssign}
            onDesignerAdded={onDesignerAdded}
          />

          {/* เข้าประเมิน (read-only · ฟิกวันจากหน้าคิวงาน) */}
          {job.assess_date && (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <span className="shrink-0">เข้าประเมิน:</span>
              <span className="tnum">{thDate(job.assess_date)}</span>
            </div>
          )}

          {/* วันได้รับแบบ — editable (ขึ้นก่อนกำหนดเสร็จ) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-3 shrink-0">ได้รับแบบ:</span>
            <DateField
              value={receivedDateVal}
              onChange={(iso) => { setReceivedDateVal(iso); saveReceived(iso); }}
              disabled={assigning}
              aria-label="วันได้รับแบบ"
              className="flex-1 min-w-0 glass-soft rounded-lg px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 text-ink-2"
            />
          </div>

          {/* กำหนดเสร็จ = ได้รับแบบ + 2 วัน (auto-คำนวณ · แก้ทีหลังได้) — #37 confirm อดีต + toast */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-3 shrink-0">กำหนดเสร็จ:</span>
            <DateField
              value={dueDateVal}
              onChange={(iso) => { setDueDateVal(iso); saveDue(iso); }}
              disabled={assigning}
              aria-label="กำหนดเสร็จ"
              className={`flex-1 min-w-0 glass-soft rounded-lg px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 ${
                job.overdue ? "text-brand font-semibold" : "text-ink-2"
              }`}
            />
            {dueSaved ? (
              <span className="text-[10px] text-emerald-600 font-semibold shrink-0">บันทึกแล้ว</span>
            ) : job.overdue ? (
              <span className="text-[10px] text-brand font-semibold shrink-0">เลย!</span>
            ) : null}
          </div>

          {/* design_start → design_end (read-only แสดงไทม์ไลน์ทำแบบ) */}
          {(job.design_start || job.design_end) && (
            <div className="text-[11px] text-ink-3 tnum">
              ทำแบบ: {thDate(job.design_start)} → {thDate(job.design_end)}
            </div>
          )}

          {/* Move design_state (#16: disable option ปัจจุบัน) */}
          <select
            value={job.design_state}
            disabled={moving}
            onChange={(e) => onMove(job, e.target.value as DesignState)}
            aria-label="ขั้นตอนเขียนแบบ"
            className="w-full glass-soft rounded-lg px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
          >
            {COLUMNS.map((c) => (
              <option key={c.state} value={c.state} disabled={c.state === job.design_state}>
                {c.state === job.design_state ? `[ปัจจุบัน] ${STATE_TH[c.state]}` : `ย้ายไป: ${STATE_TH[c.state]}`}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div
            className={`text-[12px] mt-1 ${job.overdue ? "text-brand font-semibold" : "text-ink-3"}`}
          >
            กำหนดเสร็จ: {thDate(job.design_due_date)}
            {job.overdue && " · เลยกำหนด"}
          </div>
          <div
            className="text-[12px] text-ink-3 mt-0.5 truncate"
            title={job.designer_name ?? "ยังไม่มอบหมาย"}
          >
            ผู้ออกแบบ: {job.designer_name ?? "ยังไม่มอบหมาย"}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Designer dropdown with "add new" option ─────────────────────────────────
const ADD_NEW_VALUE = "__add_new__";

function DesignerSelect({
  job,
  designers,
  assigning,
  onAssign,
  onDesignerAdded,
}: {
  job: Job;
  designers: DesignerOption[];
  assigning: boolean;
  onAssign: (job: Job, designerRef: number | null) => void;
  onDesignerAdded: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAddErr("");
    try {
      const res = await fetch("/api/designers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "เพิ่มชื่อไม่สำเร็จ");
      // Reload designers list then assign the newly created designer
      await onDesignerAdded();
      const newId = (json.data?.designer?.id ?? null) as number | null;
      if (newId != null) onAssign(job, newId);
      setNewName("");
      setAdding(false);
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "เพิ่มชื่อไม่สำเร็จ");
    }
  }

  function handleSelectChange(val: string) {
    if (val === ADD_NEW_VALUE) {
      setAdding(true);
      return;
    }
    onAssign(job, val ? Number(val) : null);
  }

  if (adding) {
    return (
      <div className="space-y-1">
        <form onSubmit={handleAdd} className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ชื่อผู้ออกแบบ"
            className="flex-1 glass-soft rounded-lg px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 min-w-0"
            maxLength={80}
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="press rounded-lg px-2 py-1 bg-brand text-white text-[12px] font-medium disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="บันทึกชื่อใหม่"
          >
            <Icon name="check" size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setAddErr(""); setNewName(""); }}
            className="press rounded-lg px-2 py-1 glass-soft text-[12px] text-ink-3 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="ยกเลิก"
          >
            <Icon name="close" size={14} />
          </button>
        </form>
        {addErr && <p className="text-[11px] text-red-600">{addErr}</p>}
      </div>
    );
  }

  return (
    <select
      value={job.designer_ref != null ? String(job.designer_ref) : ""}
      disabled={assigning}
      onChange={(e) => handleSelectChange(e.target.value)}
      aria-label="มอบหมายผู้ออกแบบ"
      className="w-full glass-soft rounded-lg px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
    >
      <option value="">— ยังไม่มอบหมาย —</option>
      {designers.map((d) => (
        <option key={d.id} value={String(d.id)}>
          {d.name}
        </option>
      ))}
      <option value={ADD_NEW_VALUE}>+ เพิ่มชื่อใหม่</option>
    </select>
  );
}

