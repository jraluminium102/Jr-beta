"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { Card } from "@/components/ui";
import DateField from "@/components/ui/DateField";
import type { DesignState } from "@/lib/database.types";
import type { DesignerOption } from "@/app/(app)/designer/page";
import AddDesignWorkModal from "@/components/designer/AddDesignWorkModal";
import DesignerSchedule from "@/components/designer/DesignerSchedule";
import { HoldModal } from "@/components/jobs/HoldModal";

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
  sales_name: string | null;   // เซลล์ที่ไปดูหน้างาน
  design_state: DesignState;
  design_due_date: string | null;
  design_received_date: string | null;
  design_start: string | null;
  design_end: string | null;
  design_revise_count: number;
  current_stage: number;
  assess_date: string | null;
  onsite_deposit: boolean; // (0044) ป้ายมัดจำหน้างาน
  quote_sent_date: string | null; // ส่งใบเสนอด่วนไปแล้ว (แบบยังไม่เสร็จ)
  on_hold: boolean;
  on_hold_reason: string | null;
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
  return `${day}/${m}/${y}`;
}

export default function DesignerBoard({
  designers: initialDesigners,
  canWrite,
}: {
  designers: DesignerOption[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<"board" | "schedule">("board");
  // แท็บหัวข้อย่อยในหน้าบอร์ด (กดดูทีละสถานะ) — default "ยังไม่เริ่ม"
  const [activeState, setActiveState] = useState<DesignState>("NOT_STARTED");
  // แท็บ "เสร็จแล้ว": toggle ดูงานเก่ากว่า 45 วัน (กันงานเสร็จหายเงียบ)
  const [showAllDone, setShowAllDone] = useState(false);
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
  const [holdModal, setHoldModal] = useState<Job | null>(null);
  const [unholdBusy, setUnholdBusy] = useState<string | null>(null);

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

  // เปลี่ยนช่าง → reset toggle "ดูทั้งหมด" (กันค้างเห็นงานเสร็จทั้งหมดของช่างใหม่โดยไม่ตั้งใจ)
  useEffect(() => { setShowAllDone(false); }, [designerFilter]);

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

  // unhold: ดึงงานกลับมาทำ
  async function unholdJob(job: Job) {
    setUnholdBusy(job.id);
    setErr("");
    try {
      const res = await fetch(`/api/jobs/${job.id}/unhold`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ดึงงานกลับไม่สำเร็จ");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ดึงงานกลับไม่สำเร็จ");
    } finally {
      setUnholdBusy(null);
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
      // งาน on_hold ไม่เข้าคอลัมน์
      if (j.on_hold) continue;
      // drift guard: งานที่เลยมัดจำแล้ว (stage>=8) แต่ design_state ยังไม่ DONE = หลุดมาจาก flow อื่น
      //   (จดเอง→ผลิต / มัดจำตรง / auto-promote) ไม่ผ่านบอร์ดแบบ → ไม่ใช่งานเขียนแบบ ไม่โชว์ในคอลัมน์ active
      //   (คอลัมน์ "เสร็จแล้ว" ไม่กระทบ — งานแบบเสร็จ design_state=DONE โชว์ตามเดิม)
      if (j.design_state !== "DONE" && j.current_stage >= 8) continue;
      if (j.design_state === "DONE") {
        // Board DONE column: show only recent completions (design_end within last 45 days)
        if (!j.design_end || j.design_end < cutoff) continue;
      }
      map[j.design_state]?.push(j);
    }
    // ช่อง "เสร็จแล้ว": เรียงวันเสร็จใหม่→เก่า (งานเพิ่งเสร็จอยู่บนสุด · ตรงทิศกับ doneAll)
    map.DONE.sort((a, b) => (b.design_end ?? "").localeCompare(a.design_end ?? ""));
    return map;
  }, [jobs, cardSearch]);

  // งาน DONE ทั้งหมด (ไม่ตัด 45 วัน) — ใช้ตอนกด "ดูงานเก่ากว่า 45 วัน" ในแท็บเสร็จแล้ว
  // เรียงใหม่→เก่า (งานเพิ่งเสร็จอยู่บนสุด)
  const doneAll = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    return jobs
      .filter(
        (j) =>
          !j.on_hold &&
          j.design_state === "DONE" &&
          (q === "" ||
            j.customer_name.toLowerCase().includes(q) ||
            (j.job_code ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) => (b.design_end ?? "").localeCompare(a.design_end ?? ""));
  }, [jobs, cardSearch]);

  // งาน on_hold (filter ตาม cardSearch ด้วย)
  const heldJobs = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        j.on_hold &&
        (q === "" ||
          j.customer_name.toLowerCase().includes(q) ||
          (j.job_code ?? "").toLowerCase().includes(q)),
    );
  }, [jobs, cardSearch]);

  // ตัดงานที่หลุดมาจาก flow อื่น (เลยมัดจำแล้ว stage>=8 แต่ design_state ยังไม่ DONE) ออกจากตารางเวลาด้วย
  const scheduleJobs = useMemo(
    () => jobs.filter((j) => j.design_state === "DONE" || j.current_stage < 8),
    [jobs],
  );

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
        <>
          <PhaseTabsView
            byColumn={byColumn}
            doneAll={doneAll}
            activeState={activeState}
            onTab={(s) => { setActiveState(s); setShowAllDone(false); }}
            showAllDone={showAllDone}
            onToggleAllDone={() => setShowAllDone((v) => !v)}
            canWrite={canWrite}
            moving={moving}
            assigning={assigning}
            designers={designers}
            onMove={moveTo}
            onAssign={assignDesigner}
            onDueDate={updateDueDate}
            onReceivedDate={updateReceivedDate}
            onDesignerAdded={reloadDesigners}
            onHold={canWrite ? (job) => setHoldModal(job) : undefined}
          />
          {/* ── Section พัก (HOLD) ── */}
          <HoldSection
            jobs={heldJobs}
            canWrite={canWrite}
            unholdBusy={unholdBusy}
            onUnhold={unholdJob}
          />
        </>
      ) : (
        <DesignerSchedule
          jobs={scheduleJobs}
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
          onAdded={async (state) => { await load(); if (state) { setActiveState(state); setShowAllDone(false); } }}
        />
      )}

      {/* ── HoldModal ── */}
      {holdModal && (
        <HoldModal
          jobId={holdModal.id}
          jobCode={holdModal.job_code}
          customerName={holdModal.customer_name}
          zone="light"
          onDone={async () => { setHoldModal(null); await load(); }}
          onClose={() => setHoldModal(null)}
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

// ─── Phase tabs + row list (แทนบอร์ดคอลัมน์เดิม — กดดูทีละหัวข้อ แถวเต็มความกว้าง) ──
function PhaseTabsView({
  byColumn,
  doneAll,
  activeState,
  onTab,
  showAllDone,
  onToggleAllDone,
  canWrite,
  moving,
  assigning,
  designers,
  onMove,
  onAssign,
  onDueDate,
  onReceivedDate,
  onDesignerAdded,
  onHold,
}: {
  byColumn: Record<DesignState, Job[]>;
  doneAll: Job[];
  activeState: DesignState;
  onTab: (s: DesignState) => void;
  showAllDone: boolean;
  onToggleAllDone: () => void;
  canWrite: boolean;
  moving: string | null;
  assigning: string | null;
  designers: DesignerOption[];
  onMove: (job: Job, state: DesignState) => void;
  onAssign: (job: Job, designerRef: number | null) => void;
  onDueDate: (job: Job, date: string) => void;
  onReceivedDate: (job: Job, date: string) => void;
  onDesignerAdded: () => Promise<void>;
  onHold?: (job: Job) => void;
}) {
  // รายการตามแท็บ — DONE: default ล่าสุด (45 วัน) · กดดูทั้งหมดได้ (กันงานเสร็จหายเงียบ)
  const rows =
    activeState === "DONE"
      ? showAllDone
        ? doneAll
        : byColumn.DONE
      : byColumn[activeState] ?? [];
  // จำนวนงานเสร็จที่เก่ากว่า 45 วัน (ถูกซ่อนใน default view)
  const olderDoneCount = Math.max(0, doneAll.length - byColumn.DONE.length);

  return (
    <div className="space-y-3">
      {/* ── แท็บ 5 หัวข้อ (กดดูทีละหัวข้อ) ── */}
      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="หัวข้องานเขียนแบบ">
        {COLUMNS.map((col) => {
          const count = byColumn[col.state].length;
          const on = col.state === activeState;
          return (
            <button
              key={col.state}
              role="tab"
              aria-selected={on}
              onClick={() => onTab(col.state)}
              className={`press inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium min-h-[44px] border transition-colors ${
                on
                  ? "bg-brand/10 text-brand border-brand"
                  : "glass-soft text-ink-2 border-transparent hover:bg-brand/5"
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.dot }} />
              {col.th}
              <span className="tnum text-xs font-semibold rounded-md px-1.5 py-0.5 bg-black/5 text-ink-3">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── แถวงานของหัวข้อที่เลือก ── */}
      {rows.length === 0 ? (
        <Card className="p-10 text-center text-ink-3 text-sm">— ไม่มีงานในหัวข้อนี้ —</Card>
      ) : (
        <div className="space-y-2">
          {rows.map((j) => (
            <JobRow
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
              onHold={onHold}
            />
          ))}
        </div>
      )}

      {/* ── ปุ่มดูงานเสร็จเก่ากว่า 45 วัน (เฉพาะแท็บเสร็จแล้ว) ── */}
      {activeState === "DONE" && olderDoneCount > 0 && (
        <button
          type="button"
          onClick={onToggleAllDone}
          className="press w-full text-sm font-medium text-ink-2 glass-soft rounded-xl px-4 py-2.5 min-h-[44px] hover:bg-brand/5 transition-colors"
        >
          {showAllDone
            ? "แสดงเฉพาะงานเสร็จล่าสุด (45 วัน)"
            : `ดูงานเสร็จทั้งหมด (+${olderDoneCount})`}
        </button>
      )}
    </div>
  );
}

// ─── Field — label เล็กบน + ค่า/อินพุตล่าง (ใช้ในแถวงาน) ──────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-3 mb-0.5">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ─── Job Row (แถวเต็มความกว้าง — แทนการ์ดคอลัมน์เดิม) ────────────────────────────
function JobRow({
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
  onHold,
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
  onHold?: (job: Job) => void;
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

  const isDone = job.design_state === "DONE";

  return (
    <div className="glass-soft rounded-xl p-3 text-sm">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        {/* ── ซ้าย: job code + ลูกค้า + เซลล์ ── */}
        <div className="sm:w-[210px] shrink-0 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <a
              href={`/jobs?open=${job.id}`}
              className="font-semibold text-brand-dark hover:underline focus:outline-none focus:ring-2 focus:ring-brand/40 rounded tnum"
              aria-label={`ดูงาน ${job.job_code ?? ""}`}
            >
              {job.job_code ?? "—"}
            </a>
            <a
              href={`/jobs?open=${job.id}`}
              className="inline-flex items-center gap-0.5 text-[10px] text-ink-3 hover:text-brand border border-ink-3/30 hover:border-brand/40 rounded px-1 py-0.5 min-h-[22px] focus:outline-none focus:ring-2 focus:ring-brand/40 shrink-0"
              aria-label="ดูงาน"
              tabIndex={0}
            >
              <Icon name="external" size={10} />
              ดูงาน
            </a>
            {job.design_revise_count > 0 && (
              <span className="text-[10px] font-medium text-white bg-brand rounded-full px-1.5 py-0.5 shrink-0">
                แก้ {job.design_revise_count}
              </span>
            )}
          </div>
          <div className="text-ink-2 mt-0.5 truncate" title={job.customer_name}>
            {job.customer_name}
          </div>
          <div className="text-[11px] text-ink-3 mt-0.5 truncate">
            {job.sales_name ? `เซลล์ ${job.sales_name}` : "—"}
          </div>
          {/* (0044) ป้ายมัดจำหน้างาน · ด่วน — เฉพาะงานที่ยังไม่เสร็จแบบ */}
          {job.onsite_deposit && !isDone && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Icon name="warn" size={11} />
              มัดจำหน้างาน · ด่วน
            </div>
          )}
          {/* ส่งใบเสนอด่วนไปแล้ว (แบบยังไม่เสร็จ) — เตือนฝ่ายแบบว่าใบเสนอออกไปก่อนแล้ว รีบทำแบบ */}
          {job.quote_sent_date && !isDone && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              <Icon name="external" size={11} />
              ส่งใบเสนอแล้ว · รีบทำแบบ
            </div>
          )}
        </div>

        {canWrite ? (
          <>
            {/* ── กลาง: ฟิลด์ (ผู้ออกแบบ/เข้าประเมิน/ได้รับแบบ/กำหนดเสร็จ) ── */}
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-2 min-w-0">
              <Field label="ผู้ออกแบบ">
                <DesignerSelect
                  job={job}
                  designers={designers}
                  assigning={assigning}
                  onAssign={onAssign}
                  onDesignerAdded={onDesignerAdded}
                />
              </Field>

              <Field label="เข้าประเมิน">
                <span className="text-[12px] tnum text-ink-2">{thDate(job.assess_date)}</span>
              </Field>

              <Field label="ได้รับแบบ">
                <DateField
                  value={receivedDateVal}
                  onChange={(iso) => { setReceivedDateVal(iso); saveReceived(iso); }}
                  disabled={assigning}
                  aria-label="วันได้รับแบบ"
                  className="w-full min-w-0 glass-soft rounded-lg px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 text-ink-2"
                />
              </Field>

              {isDone ? (
                <Field label="วันเสร็จ">
                  <span className="text-[12px] tnum text-emerald-700 font-semibold">{thDate(job.design_end)}</span>
                </Field>
              ) : (
                <Field label="กำหนดเสร็จ">
                  <div className="flex items-center gap-1">
                    <DateField
                      value={dueDateVal}
                      onChange={(iso) => { setDueDateVal(iso); saveDue(iso); }}
                      disabled={assigning}
                      aria-label="กำหนดเสร็จ"
                      className={`w-full min-w-0 glass-soft rounded-lg px-2 py-1 text-[12px] outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60 ${
                        job.overdue ? "text-brand font-semibold" : "text-ink-2"
                      }`}
                    />
                    {dueSaved ? (
                      <span className="text-[10px] text-emerald-600 font-semibold shrink-0">✓</span>
                    ) : job.overdue ? (
                      <span className="text-[10px] text-brand font-semibold shrink-0">เลย!</span>
                    ) : null}
                  </div>
                </Field>
              )}
            </div>

            {/* ── ขวา: ย้ายขั้น + พักงาน ── */}
            <div className="sm:w-[168px] shrink-0 flex flex-col gap-1.5">
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
              {onHold && (
                <button
                  type="button"
                  onClick={() => onHold(job)}
                  className="w-full press rounded-lg px-2 py-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 min-h-[36px] transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                  aria-label={`พักงาน ${job.job_code ?? ""}`}
                >
                  พักงาน
                </button>
              )}
            </div>
          </>
        ) : (
          /* ── read-only (ไม่มีสิทธิ์แก้) ── */
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
            <Field label="ผู้ออกแบบ">
              <span className="text-[12px] text-ink-2 truncate block" title={job.designer_name ?? "ยังไม่มอบหมาย"}>
                {job.designer_name ?? "ยังไม่มอบหมาย"}
              </span>
            </Field>
            <Field label="เข้าประเมิน">
              <span className="text-[12px] tnum text-ink-2">{thDate(job.assess_date)}</span>
            </Field>
            <Field label={isDone ? "วันเสร็จ" : "กำหนดเสร็จ"}>
              <span className={`text-[12px] tnum ${job.overdue ? "text-brand font-semibold" : "text-ink-2"}`}>
                {isDone ? thDate(job.design_end) : thDate(job.design_due_date)}
                {job.overdue && " · เลย"}
              </span>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hold Section ─────────────────────────────────────────────────────────────
function HoldSection({
  jobs,
  canWrite,
  unholdBusy,
  onUnhold,
}: {
  jobs: Job[];
  canWrite: boolean;
  unholdBusy: string | null;
  onUnhold: (job: Job) => void;
}) {
  const [open, setOpen] = useState(false);
  if (jobs.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press w-full flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm font-semibold hover:bg-amber-100 transition-colors min-h-[44px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        aria-expanded={open}
      >
        <Icon name="warn" size={15} />
        <span>พัก (HOLD)</span>
        <span className="tnum text-xs font-bold bg-white/60 rounded-md px-1.5 py-0.5 ml-1">
          {jobs.length}
        </span>
        <span className="ml-auto">
          <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
        </span>
      </button>

      {open && (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-50/60 border-b border-amber-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">Job / ลูกค้า</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">เหตุผล</th>
                {canWrite && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-gray-100 last:border-0 hover:bg-amber-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink tnum text-sm">{j.job_code ?? "—"}</div>
                    <div className="text-xs text-ink-2 mt-0.5 truncate max-w-[180px]">{j.customer_name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3 max-w-[200px]">
                    {j.on_hold_reason ?? "—"}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onUnhold(j)}
                        disabled={unholdBusy === j.id}
                        className="press inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-brand text-white shadow-brand hover:bg-brand/90 min-h-[36px] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
                        aria-label={`เอางาน ${j.job_code ?? ""} กลับมาทำ`}
                      >
                        {unholdBusy === j.id ? "กำลังดึงกลับ…" : "เอากลับมาทำ"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

