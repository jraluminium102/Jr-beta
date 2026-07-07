"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";
import type { DesignState } from "@/lib/database.types";
import type { DesignerOption } from "@/app/(app)/designer/page";

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode = "search" | "walkin";

type SearchResult = {
  kind: "job" | "customer";   // job = งานที่มีอยู่ · customer = ลูกค้าในทะเบียน (ยังไม่มีงาน)
  id: string;                 // job: job id · customer: customer id
  job_code: string | null;
  customer_name: string;
  customer_tel?: string;      // สำหรับ kind=customer → ใช้ตอนสร้างงาน
  design_state: DesignState;
  designer_name: string | null;
  designer_ref: number | null;
};

const DESIGN_STATE_TH: Record<DesignState, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  DRAWING: "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอลูกค้า",
  REVISING: "กำลังแก้ไข",
  DONE: "เสร็จแล้ว",
};

// States where the job is already active on the board
const ON_BOARD_STATES: DesignState[] = ["DRAWING", "PENDING_CUSTOMER", "REVISING"];

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Debounce hook ────────────────────────────────────────────────────────────
function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function AddDesignWorkModal({
  designers,
  onClose,
  onAdded,
}: {
  designers: DesignerOption[];
  onClose: () => void;
  onAdded: (state?: DesignState) => void;
}) {
  const [mode, setMode] = useState<Mode>("search");

  // Close on Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="เพิ่มงานเขียนแบบ"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg glass-dark rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 fade-in max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-brand/80 inline-flex items-center justify-center">
              <Icon name="ruler" size={15} />
            </span>
            เพิ่มงานเขียนแบบ
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="glass-soft rounded-xl p-1 inline-flex text-[13px] mb-4 shrink-0">
          <button
            onClick={() => setMode("search")}
            className={`press flex-1 rounded-lg px-3.5 py-2 font-medium min-h-[44px] ${
              mode === "search" ? "bg-brand text-white shadow-brand" : "text-white/70 hover:text-white"
            }`}
          >
            เลือกงานที่มีอยู่
          </button>
          <button
            onClick={() => setMode("walkin")}
            className={`press flex-1 rounded-lg px-3.5 py-2 font-medium min-h-[44px] ${
              mode === "walkin" ? "bg-brand text-white shadow-brand" : "text-white/70 hover:text-white"
            }`}
          >
            ลูกค้าใหม่ (walk-in)
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {mode === "search" ? (
            <SearchMode designers={designers} onClose={onClose} onAdded={onAdded} />
          ) : (
            <WalkInMode designers={designers} onClose={onClose} onAdded={onAdded} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared assignment fields (designer + due date + action) ─────────────────
function AssignFields({
  designers,
  designerRef,
  dueDate,
  action,
  onDesignerChange,
  onDueDateChange,
  onActionChange,
  saving,
  hideAction,
}: {
  designers: DesignerOption[];
  designerRef: number | null;
  dueDate: string;
  action: "DRAWING" | "REVISING";
  onDesignerChange: (v: number | null) => void;
  onDueDateChange: (v: string) => void;
  onActionChange: (v: "DRAWING" | "REVISING") => void;
  saving: boolean;
  hideAction?: boolean;
}) {
  const fieldCls =
    "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] placeholder-white/40 [&>option]:text-gray-800 disabled:opacity-60";
  const lblCls = "block text-[12px] mb-1.5 text-white/60";

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-white/10">
      <div>
        <label className={lblCls}>
          ผู้รับผิดชอบ <span className="text-rose-300">*</span>
        </label>
        <select
          value={designerRef != null ? String(designerRef) : ""}
          onChange={(e) => onDesignerChange(e.target.value ? Number(e.target.value) : null)}
          disabled={saving}
          className={fieldCls}
        >
          <option value="">— เลือกผู้ออกแบบ —</option>
          {designers.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={lblCls}>วันกำหนดส่งแบบ</label>
        <DateField
          value={dueDate}
          onChange={onDueDateChange}
          disabled={saving}
          className={fieldCls}
          aria-label="วันกำหนดส่งแบบ"
        />
      </div>

      {!hideAction && (
        <div>
          <label className={lblCls}>
            การกระทำ <span className="text-rose-300">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn
              active={action === "DRAWING"}
              onClick={() => onActionChange("DRAWING")}
              disabled={saving}
              label="เริ่มเขียนแบบ"
              dot="#2563eb"
            />
            <ActionBtn
              active={action === "REVISING"}
              onClick={() => onActionChange("REVISING")}
              disabled={saving}
              label="ส่งแก้แบบ"
              dot="#B3151D"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  active, onClick, disabled, label, dot,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  dot: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium flex items-center gap-2 justify-center border disabled:opacity-50 ${
        active
          ? "border-white/40 bg-white/20 text-white"
          : "border-white/15 glass-card text-white/60 hover:bg-white/10"
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot }} />
      {label}
    </button>
  );
}

// ─── Mode 1: Search existing jobs ────────────────────────────────────────────
function SearchMode({
  designers,
  onClose,
  onAdded,
}: {
  designers: DesignerOption[];
  onClose: () => void;
  onAdded: (state?: DesignState) => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQ = useDebounce(query, 320);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [designerRef, setDesignerRef] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(TODAY);
  const [action, setAction] = useState<"DRAWING" | "REVISING">("DRAWING");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Search effect — runs when debounced query changes
  useEffect(() => {
    if (!debouncedQ.trim()) { setResults([]); return; }
    let cancelled = false;
    (async () => {
      setSearching(true);
      setSearchErr("");
      try {
        // ค้นทั้ง "งานที่มีอยู่" (jobs) และ "ลูกค้าในทะเบียน" (customers) พร้อมกัน
        // → ลูกค้าที่เพิ่งสร้างในทะเบียน (ยังไม่มีงาน) ก็เจอ แล้วสร้างงานเขียนแบบให้ได้เลย
        const [jobRes, custRes] = await Promise.all([
          fetch(`/api/jobs?q=${encodeURIComponent(debouncedQ)}&limit=20`),
          fetch(`/api/customers?q=${encodeURIComponent(debouncedQ)}`),
        ]);
        const jobJson = await jobRes.json();
        if (cancelled) return;
        if (!jobRes.ok) throw new Error(jobJson.error ?? "ค้นหาไม่สำเร็จ");
        const jobRows: Record<string, unknown>[] = jobJson.data ?? [];
        const jobs: SearchResult[] = jobRows.map((j) => ({
          kind: "job" as const,
          id: j.id as string,
          job_code: j.job_code as string | null,
          customer_name: j.customer_name as string,
          design_state: j.design_state as DesignState,
          designer_name: (j.designer_ref != null
            ? designers.find((d) => d.id === (j.designer_ref as number))?.name ?? null
            : null),
          designer_ref: j.designer_ref as number | null,
        }));

        // ลูกค้าในทะเบียนที่ "ยังไม่มีงาน" ในผลลัพธ์ (กันซ้ำกับงานที่เจอแล้ว)
        const jobCustIds = new Set(jobRows.map((j) => j.customer_id as string).filter(Boolean));
        let customers: SearchResult[] = [];
        if (custRes.ok) {
          const custJson = await custRes.json().catch(() => null);
          const custRows: Record<string, unknown>[] = custJson?.data ?? [];
          customers = custRows
            .filter((c) => !jobCustIds.has(c.id as string))
            .map((c) => ({
              kind: "customer" as const,
              id: c.id as string,
              job_code: null,
              customer_name: c.name as string,
              customer_tel: (c.phone as string) || "",
              design_state: "NOT_STARTED" as DesignState,
              designer_name: null,
              designer_ref: null,
            }));
        }
        setResults([...jobs, ...customers]);
      } catch (e) {
        if (!cancelled) setSearchErr(e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ");
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQ, designers]);

  // When a job is selected, pre-fill designer if already assigned
  function handleSelect(job: SearchResult) {
    setSelected(job);
    setDesignerRef(job.designer_ref);
    setSaveErr("");
    // Suggest REVISING if job has DONE state (returning customer)
    setAction(job.design_state === "DONE" ? "REVISING" : "DRAWING");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!designerRef) { setSaveErr("กรุณาเลือกผู้รับผิดชอบ"); return; }
    setSaveErr("");
    setSaving(true);
    try {
      let jobId = selected.id;
      // ลูกค้าจากทะเบียน (ยังไม่มีงาน) → สร้างงานให้ก่อน (ผูก customer_id ตรง กันลูกค้าซ้ำ)
      if (selected.kind === "customer") {
        const createRes = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: selected.customer_name,
            customer_tel: selected.customer_tel || undefined,
            customer_id: selected.id,
            channel: "OTHER",
            assess_date: TODAY,
          }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok) throw new Error(createJson.error ?? "สร้างงานไม่สำเร็จ");
        jobId = createJson.data?.id;
        if (!jobId) throw new Error("ไม่ได้รับ ID งานใหม่");
      }

      // 1) Assign designer + due date
      const patchJob = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designer_ref: designerRef, design_due_date: dueDate || null }),
      });
      const patchJobJson = await patchJob.json();
      if (!patchJob.ok) throw new Error(patchJobJson.error ?? "มอบหมายงานไม่สำเร็จ");

      // 2) Change design state (ลูกค้าใหม่ = DRAWING เสมอ)
      const nextState = selected.kind === "customer" ? "DRAWING" : action;
      const patchState = await fetch(`/api/designer/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      });
      const patchStateJson = await patchState.json();
      if (!patchState.ok) throw new Error(patchStateJson.error ?? "เปลี่ยนสถานะไม่สำเร็จ");

      onAdded(nextState);
      onClose();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const fieldCls =
    "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] placeholder-white/40";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
          <Icon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          placeholder="ค้นหาชื่อลูกค้า หรือ Job code…"
          className={`${fieldCls} pl-9`}
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin inline-block" />
          </span>
        )}
      </div>

      {/* Search error */}
      {searchErr && (
        <p role="alert" className="text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">
          {searchErr}
        </p>
      )}

      {/* Results list */}
      {results.length > 0 && !selected && (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {results.map((job) => {
            const onBoard = ON_BOARD_STATES.includes(job.design_state);
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => handleSelect(job)}
                className="press w-full text-left glass-card rounded-xl px-3.5 py-2.5 hover:bg-white/20 min-h-[44px] flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm truncate">
                      {job.kind === "customer" ? job.customer_name : (job.job_code ?? "—")}
                    </span>
                    {job.kind === "job" && (
                      <span className="text-white/60 text-[12px] truncate">{job.customer_name}</span>
                    )}
                    {job.kind === "customer" && job.customer_tel && (
                      <span className="text-white/50 text-[12px] truncate">{job.customer_tel}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-white/50">
                      {job.kind === "customer" ? "จากทะเบียนลูกค้า · จะสร้างงานเขียนแบบให้" : DESIGN_STATE_TH[job.design_state]}
                    </span>
                    {job.designer_name && (
                      <span className="text-[11px] text-white/40">· {job.designer_name}</span>
                    )}
                  </div>
                </div>
                {job.kind === "customer" ? (
                  <span className="shrink-0 text-[10px] text-emerald-300 bg-emerald-400/20 border border-emerald-300/30 rounded-full px-2 py-0.5 font-medium whitespace-nowrap">
                    ลูกค้าใหม่
                  </span>
                ) : onBoard ? (
                  <span className="shrink-0 text-[10px] text-amber-300 bg-amber-400/20 border border-amber-300/30 rounded-full px-2 py-0.5 font-medium whitespace-nowrap">
                    อยู่บนบอร์ด
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* No results hint */}
      {debouncedQ.trim() && !searching && results.length === 0 && !selected && (
        <p className="text-[13px] text-white/40 text-center py-2">ไม่พบลูกค้า/งานที่ตรงกับ "{debouncedQ}"</p>
      )}

      {/* Selected job/customer summary */}
      {selected && (
        <div className="glass-soft rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm truncate">
                {selected.kind === "customer" ? selected.customer_name : (selected.job_code ?? "—")}
              </span>
              {selected.kind === "job" && (
                <span className="text-white/60 text-[12px] truncate">{selected.customer_name}</span>
              )}
            </div>
            <span className="text-[11px] text-white/45">
              {selected.kind === "customer" ? "ลูกค้าจากทะเบียน · จะสร้างงานเขียนแบบให้อัตโนมัติ" : DESIGN_STATE_TH[selected.design_state]}
            </span>
            {selected.kind === "job" && ON_BOARD_STATES.includes(selected.design_state) && (
              <span className="ml-2 text-[11px] text-amber-300 bg-amber-400/20 border border-amber-300/30 rounded-full px-1.5 py-px font-medium">
                งานนี้อยู่บนบอร์ดแล้ว — สามารถเปลี่ยนสถานะได้
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setSelected(null); setResults([]); setQuery(""); }}
            className="press text-white/40 hover:text-white/80 min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            aria-label="เลือกงานอื่น"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      {/* Assignment fields — shown once a job is selected */}
      {selected && (
        <AssignFields
          designers={designers}
          designerRef={designerRef}
          dueDate={dueDate}
          action={action}
          onDesignerChange={setDesignerRef}
          onDueDateChange={setDueDate}
          onActionChange={setAction}
          saving={saving}
          hideAction={selected.kind === "customer"}
        />
      )}

      {/* Save error */}
      {saveErr && (
        <p role="alert" className="text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">
          {saveErr}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving || !selected || !designerRef}
          className="focusable pressable flex-1 bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand/90 min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          )}
          ยืนยัน
        </button>
      </div>
    </form>
  );
}

// ─── Mode 2: Walk-in (create new job then assign) ─────────────────────────────
function WalkInMode({
  designers,
  onClose,
  onAdded,
}: {
  designers: DesignerOption[];
  onClose: () => void;
  onAdded: (state?: DesignState) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerTel, setCustomerTel] = useState("");
  const [designerRef, setDesignerRef] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(TODAY);
  const [action, setAction] = useState<"DRAWING" | "REVISING">("DRAWING");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  // Synchronous guard — กันกดสร้างงานซ้ำ (double-submit)
  const busyRef = useRef(false);

  const fieldCls =
    "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] placeholder-white/40 [&>option]:text-gray-800 disabled:opacity-60";
  const lblCls = "block text-[12px] mb-1.5 text-white/60";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Synchronous guard ก่อน await ใดๆ
    if (busyRef.current) return;
    const name = customerName.trim();
    if (!name) { setSaveErr("กรุณาระบุชื่อลูกค้า"); return; }
    if (!designerRef) { setSaveErr("กรุณาเลือกผู้รับผิดชอบ"); return; }

    // เตือนเมื่อเบอร์โทรว่าง — ระบบผูกลูกค้าซ้ำไม่ได้
    if (!customerTel.trim()) {
      const proceed = window.confirm(
        "ไม่ได้ใส่เบอร์โทร\nถ้าไม่ใส่เบอร์ ระบบจะผูกลูกค้าเดิมไม่ได้ เกิดลูกค้าซ้ำ\n\nต้องการสร้างงานโดยไม่มีเบอร์หรือไม่?"
      );
      if (!proceed) return;
    }

    setSaveErr("");
    busyRef.current = true;
    setSaving(true);
    try {
      // 1) Create the job
      const createRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_tel: customerTel.trim() || undefined,
          channel: "OTHER",
          assess_date: TODAY,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? "สร้างงานไม่สำเร็จ");
      // POST /api/jobs returns { success: true, data: { id, ... } } via created()
      const jobId: string = createJson.data?.id;
      if (!jobId) throw new Error("ไม่ได้รับ ID งานใหม่");

      // 2) Assign designer + due date
      const patchJob = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designer_ref: designerRef, design_due_date: dueDate || null }),
      });
      const patchJobJson = await patchJob.json();
      if (!patchJob.ok) throw new Error(patchJobJson.error ?? "มอบหมายงานไม่สำเร็จ");

      // 3) Set design state
      const patchState = await fetch(`/api/designer/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: action }),
      });
      const patchStateJson = await patchState.json();
      if (!patchState.ok) throw new Error(patchStateJson.error ?? "เปลี่ยนสถานะไม่สำเร็จ");

      onAdded(action);
      onClose();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
      busyRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={lblCls} htmlFor="wk-name">
          ชื่อลูกค้า <span className="text-rose-300">*</span>
        </label>
        <input
          id="wk-name"
          required
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="เช่น คุณสมชาย"
          className={fieldCls}
          disabled={saving}
          autoFocus
        />
      </div>

      <div>
        <label className={lblCls} htmlFor="wk-tel">
          เบอร์โทร{" "}
          <span className="text-amber-300 font-medium">
            (แนะนำใส่ — ถ้าไม่ใส่ผูกลูกค้าเดิมไม่ได้ เกิดลูกค้าซ้ำ)
          </span>
        </label>
        <input
          id="wk-tel"
          type="tel"
          inputMode="tel"
          value={customerTel}
          onChange={(e) => setCustomerTel(e.target.value)}
          placeholder="0812345678"
          className={`${fieldCls} tnum`}
          disabled={saving}
        />
      </div>

      <AssignFields
        designers={designers}
        designerRef={designerRef}
        dueDate={dueDate}
        action={action}
        onDesignerChange={setDesignerRef}
        onDueDateChange={setDueDate}
        onActionChange={setAction}
        saving={saving}
      />

      {saveErr && (
        <p role="alert" className="text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">
          {saveErr}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving || !customerName.trim() || !designerRef}
          className="focusable pressable flex-1 bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand/90 min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          )}
          สร้างงาน + มอบหมาย
        </button>
      </div>
    </form>
  );
}
