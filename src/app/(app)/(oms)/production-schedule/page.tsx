"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { Chip, Spinner, EmptyState } from "@/components/ui/primitives";
import { Plus, X, Check, Trash2, CalendarDays } from "@/components/ui/icons";
import DateField from "@/components/ui/DateField";
import type { ProdStatus } from "@/lib/database.types";

type ProdSet = {
  id: number; set_label: string; seq: number;
  design_received: string; glass_installed: string;
  qc_before_glass: string; qc_after_glass: string;
  glass_spec: string; screen_type: string; screen_installed: string;
  glass_order: string; mat_equipment: string; mat_alu_normal: string; mat_alu_painted: string;
  frame_status: string; measurer_name: string; measure_actual: string | null;
  must_finish_date: string | null; glass_done_date: string | null;
  actual_done_date: string | null; install_date: string | null; note: string;
};
type SchedRow = {
  kind: "job" | "adhoc";
  id: string;
  job_id?: string | null;
  title: string;
  subtitle: string | null;
  job_code: string | null;
  customer_area: string | null;
  customer_name?: string | null;
  produce_date: string | null;
  install_date: string | null;
  producer_note: string | null;
  status: string;
  sets?: ProdSet[];
};

const today = () => new Date().toISOString().slice(0, 10);
const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
// ISO → "จ 28/07/69"
function thHead(d: string | null) {
  if (!d) return "ยังไม่กำหนดวันผลิต";
  const dt = new Date(d + "T00:00:00");
  const [y, m, day] = d.split("-");
  return `${WD[dt.getDay()]}. ${day}/${m}/${(Number(y) + 543) % 100}`;
}
const thShort = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${(Number(y) + 543) % 100}`;
};

// ── ค่ามาตรฐาน (ตรงกับ ProductionSetsSection / Excel) ──
const V_DESIGN_DONE = "ได้รับแบบ";
const V_DESIGN_UNDONE = "ยังไม่ได้รับแบบ";
const V_GLASS_DONE = "ใส่แล้ว";
const V_GLASS_UNDONE = "ยังไม่ใส่";
const V_QC_PASS = "ผ่าน";

// นับวันถึงเดดไลน์ (เทียบ ISO string ตรงๆ กัน bug DATE same-day)
function deadlineInfo(must: string | null, done: boolean): { tone: string; text: string } {
  if (done) return { tone: "done", text: "เสร็จแล้ว" };
  if (!must) return { tone: "none", text: "ยังไม่กำหนดวันต้องเสร็จ" };
  const t = today();
  const diff = Math.round(
    (new Date(must + "T00:00:00").getTime() - new Date(t + "T00:00:00").getTime()) / 86400000
  );
  if (diff < 0) return { tone: "over", text: `เลยกำหนด ${-diff} วัน` };
  if (diff === 0) return { tone: "today", text: "ต้องเสร็จวันนี้" };
  if (diff <= 2) return { tone: "soon", text: `เหลือ ${diff} วัน` };
  return { tone: "normal", text: `เหลือ ${diff} วัน` };
}
const setIsDone = (s: ProdSet) => s.glass_installed === V_GLASS_DONE && s.qc_after_glass === V_QC_PASS;

export default function ProductionSchedulePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["production-schedule"],
    queryFn: () => api.get<SchedRow[]>("/production-schedule"),
  });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const [addOpen, setAddOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<SchedRow>>>({});

  // ── ดึงรายชื่อช่างจาก /api/producers (ครั้งเดียว) ──
  const { data: producersData } = useQuery({
    queryKey: ["producers"],
    queryFn: () => api.get<{ producers: string[] }>("/producers"),
    staleTime: 5 * 60 * 1000,
  });
  const producerList: string[] = producersData?.data?.producers ?? [];

  // ── filter ช่าง ──
  const [producerFilter, setProducerFilter] = useState<string>("");

  // จัดกลุ่มตามวันผลิต (ยังไม่กำหนด → ท้ายสุด) + apply producer filter
  const groups = useMemo(() => {
    const filterTrimmed = producerFilter.trim();
    const filtered = filterTrimmed
      ? rows.filter((r) => (r.producer_note ?? "").trim() === filterTrimmed)
      : rows;
    const map = new Map<string, SchedRow[]>();
    for (const r of filtered) {
      const key = r.produce_date ?? "zzz";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, producerFilter]);

  const v = (r: SchedRow, k: keyof SchedRow) => (draft[r.id]?.[k] ?? r[k] ?? "") as string;

  // ── มาร์คเช็คลิสต์ช่าง (เขียนลง production_sets ช่องเดียว — ออฟฟิศเห็นทันที) ──
  const [savingSetId, setSavingSetId] = useState<number | null>(null);
  const markSet = async (setId: number, patch: Record<string, string | null>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setSavingSetId(setId);
    try {
      await api.patch(`/production-sets/${setId}`, patch);
      await refetch();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ — เช็คเน็ตแล้วลองอีกครั้ง");
    } finally {
      setSavingSetId((s) => (s === setId ? null : s));
    }
  };

  const save = async (r: SchedRow, patch: Partial<SchedRow>) => {
    setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], ...patch } }));
    setSavingId(r.id);
    try {
      await api.patch(`/production-schedule/${r.id}`, { kind: r.kind, ...patch });
      await refetch();
    } finally {
      setSavingId((s) => (s === r.id ? null : s));
    }
  };

  // debounce ref — 1 timer ต่อ row id
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounceSave = (r: SchedRow, patch: Partial<SchedRow>, ms = 600) => {
    clearTimeout(debounceRef.current[r.id]);
    debounceRef.current[r.id] = setTimeout(() => save(r, patch), ms);
  };

  const markDone = (r: SchedRow) => {
    if (!confirm(`ยืนยันว่างาน "${r.title}" เสร็จแล้ว? (จะหายจากตารางคิว)`)) return;
    save(r, { status: "DONE" } as Partial<SchedRow>);
  };

  // ปุ่มเลื่อนสถานะสำหรับงานในระบบ (kind==='job')
  const JOB_NEXT: Record<string, { label: string; nextStatus: string; confirmMsg: (title: string) => string }> = {
    QUEUED:        { label: "เริ่มผลิต", nextStatus: "MANUFACTURING", confirmMsg: (t) => `เริ่มผลิต "${t}" ใช่ไหม?` },
    MANUFACTURING: { label: "ส่ง QC",    nextStatus: "QC",            confirmMsg: (t) => `ส่งงาน "${t}" เข้าตรวจ QC ใช่ไหม?` },
    QC:            { label: "ยืนยัน QC (หน้าผลิต)", nextStatus: "READY", confirmMsg: (t) => `งาน "${t}" ต้องกรอกผล QC + วันตรวจที่หน้า "ผลิต" — ไปที่หน้าผลิตเลยไหม?` },
  };

  const advanceJobStatus = async (r: SchedRow) => {
    const cfg = JOB_NEXT[r.status];
    if (!cfg) return;
    if (!confirm(cfg.confirmMsg(r.title))) return;
    setSavingId(r.id);
    try {
      const body: Record<string, string> = { status: cfg.nextStatus };
      if (cfg.nextStatus === "QC") {
        // ต้องส่ง production_done ด้วย — ใช้วันนี้ถ้าไม่มีใน draft
        body.production_done = today();
      }
      if (cfg.nextStatus === "READY") {
        // READY ต้องกรอกผล QC + วันตรวจ ซึ่งมีเฉพาะหน้า "ผลิต" → พาไปที่นั่นแทนการเด้ง alert ทางตัน
        window.location.href = "/production";
        return;
      }
      await api.patch(`/production/${r.id}`, body);
      await refetch();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingId((s) => (s === r.id ? null : s));
    }
  };
  const del = async (r: SchedRow) => {
    if (!confirm(`ลบงาน "${r.title}" ออกจากตาราง?`)) return;
    setSavingId(r.id);
    try { await api.del(`/production-schedule/${r.id}`); await refetch(); }
    finally { setSavingId((s) => (s === r.id ? null : s)); }
  };

  const dateCls = "glass-card rounded-lg px-2 py-1.5 text-[13px] text-white outline-none min-h-[40px] disabled:opacity-50";
  const txtCls = "glass-card rounded-lg px-2.5 py-1.5 text-[13px] text-white outline-none placeholder-white/35 min-h-[40px] disabled:opacity-50";

  // datalist id
  const DATALIST_ID = "producers-list";

  return (
    <div className="p-4 sm:p-6 fade-in">
      {/* ── หัว: title + filter ช่าง + ปุ่มเพิ่ม ── */}
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 mr-auto"><CalendarDays size={22} /> ตารางผลิต</h1>

        {/* filter ช่าง */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="producer-filter" className="text-[12px] shrink-0" style={{ color: "var(--t-low)" }}>ช่าง:</label>
          <select
            id="producer-filter"
            value={producerFilter}
            onChange={(e) => setProducerFilter(e.target.value)}
            className="glass-card rounded-lg px-2.5 py-1.5 text-[13px] text-white outline-none min-h-[40px] appearance-none focus:ring-2 focus:ring-white/30"
            aria-label="กรองตามช่างผลิต"
          >
            <option value="">ทั้งหมด</option>
            {producerList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {producerFilter && (
            <button
              onClick={() => setProducerFilter("")}
              className="focusable pressable text-[12px] text-white/60 hover:text-white min-h-[40px] px-1.5"
              aria-label="ล้างตัวกรองช่าง"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {canWrite && (
          <button onClick={() => setAddOpen(true)} className="focusable pressable inline-flex items-center gap-1.5 bg-white/90 text-[#1F4E78] rounded-xl px-3.5 py-2 text-sm font-semibold min-h-[40px]">
            <Plus size={16} /> เพิ่มงานผลิต
          </button>
        )}
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>ตารางงานสำหรับช่าง · เรียงตามวันผลิต · แก้วัน/ใส่ชื่อช่างได้เลย · งานในระบบดึงจากหน้างานผลิตอัตโนมัติ</p>

      {/* datalist รายชื่อช่าง (ใช้ร่วมกันทั้งหน้า) */}
      <datalist id={DATALIST_ID}>
        {producerList.map((name) => <option key={name} value={name} />)}
      </datalist>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีงานในตารางผลิต" sub="กด 'เพิ่มงานผลิต' หรือไปลงคิวผลิตในหน้างานผลิต" />
      ) : (
        <div className="space-y-5">
          {groups.length === 0 && producerFilter ? (
            <EmptyState title={`ไม่มีงานของ "${producerFilter}"`} sub="ลองเลือกช่างคนอื่น หรือเลือก 'ทั้งหมด'" />
          ) : (
            groups.map(([dateKey, items]) => (
              <div key={dateKey}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`text-sm font-bold ${dateKey === today() ? "text-emerald-300" : "text-white"}`}>{thHead(items[0].produce_date)}</span>
                  {dateKey === today() && <span className="text-[11px] bg-emerald-500/20 text-emerald-200 rounded-md px-1.5 py-0.5">วันนี้</span>}
                  <span className="text-[12px] tnum px-1.5 py-0.5 rounded-md bg-white/10" style={{ color: "var(--t-mid)" }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <div key={r.id} className="glass-card rounded-2xl p-3 space-y-3">
                      <div className="grid grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.2fr_1fr_auto] gap-2 lg:items-center">
                      {/* งาน/ลูกค้า */}
                      <div className="col-span-2 lg:col-span-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-white font-semibold text-sm truncate">{r.title}</span>
                          {r.kind === "job" ? (
                            <span className="text-[10px] tnum bg-sky-500/20 text-sky-200 rounded px-1.5 py-0.5">{r.job_code}</span>
                          ) : (
                            <span className="text-[10px] bg-amber-500/20 text-amber-200 rounded px-1.5 py-0.5">จดเอง</span>
                          )}
                          {/* ลิงก์พิมพ์ใบงาน — เฉพาะงานในระบบ */}
                          {r.kind === "job" && (
                            <a
                              href={`/production/${r.id}/print`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`พิมพ์ใบงาน ${r.job_code ?? r.title}`}
                              className="focusable inline-flex items-center gap-1 text-[11px] bg-white/10 hover:bg-white/20 text-white/75 hover:text-white rounded-lg px-2 py-1 min-h-[28px] transition-colors"
                            >
                              <Printer size={12} /> ใบงาน
                            </a>
                          )}
                        </div>
                        {r.subtitle && (
                          <div className="text-[12px] truncate" style={{ color: "var(--t-mid)" }}>{r.subtitle}</div>
                        )}
                      </div>

                      {/* วันผลิต */}
                      <label className="block">
                        <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>วันผลิต</span>
                        <DateField
                          disabled={!canWrite || savingId === r.id}
                          value={v(r, "produce_date")}
                          onChange={(iso) => {
                            setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], produce_date: iso } }));
                            if (iso && iso !== (r.produce_date ?? "")) debounceSave(r, { produce_date: iso } as Partial<SchedRow>);
                          }}
                          onBlur={() => {
                            const cur = v(r, "produce_date");
                            if (cur !== (r.produce_date ?? "")) save(r, { produce_date: cur } as Partial<SchedRow>);
                          }}
                          className={`${dateCls} w-full`}
                          aria-label={`วันผลิต ${r.title}`}
                        />
                      </label>

                      {/* ช่างผลิต — input + datalist */}
                      <label className="block">
                        <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>ช่างผลิต</span>
                        <input
                          type="text"
                          list={DATALIST_ID}
                          disabled={!canWrite}
                          placeholder="ใส่ชื่อช่าง…"
                          value={v(r, "producer_note")}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], producer_note: e.target.value } }))}
                          onBlur={(e) => { if (e.target.value !== (r.producer_note ?? "")) save(r, { producer_note: e.target.value } as Partial<SchedRow>); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); save(r, { producer_note: e.currentTarget.value } as Partial<SchedRow>); } }}
                          className={`${txtCls} w-full`}
                          aria-label={`ช่างผลิต ${r.title}`}
                        />
                      </label>

                      {/* สถานะ + วันติดตั้ง */}
                      <div className="flex flex-col gap-1">
                        <Chip>{r.kind === "job" ? PROD_STATUS[r.status as ProdStatus] : "งานจดเอง"}</Chip>
                        {r.install_date && <span className="text-[11px] tnum" style={{ color: "var(--t-low)" }}>ติดตั้ง {thShort(r.install_date)}</span>}
                      </div>

                      {/* actions */}
                      <div className="col-span-2 lg:col-span-1 flex items-center gap-1.5 justify-end">
                        {r.kind === "adhoc" && canWrite && (
                          <>
                            <button onClick={() => markDone(r)} disabled={savingId === r.id} className="focusable pressable inline-flex items-center gap-1 bg-emerald-500/90 hover:bg-emerald-400 text-white rounded-lg px-2.5 py-1.5 text-[12px] font-semibold min-h-[44px] disabled:opacity-50"><Check size={13} /> เสร็จ</button>
                            <button onClick={() => del(r)} disabled={savingId === r.id} aria-label="ลบ" className="focusable pressable inline-flex items-center justify-center text-rose-300 hover:bg-rose-500/15 rounded-lg w-11 h-11"><Trash2 size={15} /></button>
                          </>
                        )}
                        {r.kind === "job" && canWrite && JOB_NEXT[r.status] && (
                          <button
                            onClick={() => advanceJobStatus(r)}
                            disabled={savingId === r.id}
                            className="focusable pressable inline-flex items-center gap-1.5 bg-sky-500/90 hover:bg-sky-400 text-white rounded-xl px-3 py-2 text-[13px] font-semibold min-h-[44px] disabled:opacity-50"
                          >
                            {savingId === r.id
                              ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                              : <Check size={14} />}
                            {JOB_NEXT[r.status]?.label ?? "เลื่อนสถานะ"}
                          </button>
                        )}
                        {r.kind === "job" && (!canWrite || !JOB_NEXT[r.status]) && (
                          <span className="text-[11px]" style={{ color: "var(--t-low)" }}>
                            {r.status === "READY" ? "พร้อมติดตั้งแล้ว" : "จัดการที่หน้า \"ผลิต\""}
                          </span>
                        )}
                      </div>
                      </div>
                      {r.kind === "job" && r.sets && r.sets.length > 0 && (
                        <ChangChecklist sets={r.sets} savingSetId={savingSetId} mark={markSet} canMark={canWrite} />
                      )}
                      {r.kind === "job" && r.job_id && (!r.sets || r.sets.length === 0) && (
                        <p className="text-[12px] text-amber-200/90 bg-amber-500/10 border border-amber-300/20 rounded-xl px-3 py-2">⚠️ ยังไม่มีชุดงาน — ออฟฟิศลงรายละเอียดที่หน้า “ผลิต” (คลิกงานนี้) ก่อน ช่างถึงจะเห็นเช็คลิสต์</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {addOpen && <AddModal producerList={producerList} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refetch(); }} />}
    </div>
  );
}

// ════════ เช็คลิสต์ชุดงานสำหรับช่าง (มือถือ) ════════
function ChangChecklist({ sets, savingSetId, mark, canMark }: {
  sets: ProdSet[];
  savingSetId: number | null;
  mark: (setId: number, patch: Record<string, string | null>, confirmMsg?: string) => void;
  canMark: boolean;
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-2.5">
      {sets.map((s) => <SetCard key={s.id} s={s} saving={savingSetId === s.id} mark={mark} canMark={canMark} />)}
    </div>
  );
}

function SetCard({ s, saving, mark, canMark }: {
  s: ProdSet; saving: boolean;
  mark: (setId: number, patch: Record<string, string | null>, confirmMsg?: string) => void;
  canMark: boolean;
}) {
  const [showMore, setShowMore] = useState(false);
  const done = setIsDone(s);
  const dl = deadlineInfo(s.must_finish_date, done);
  const dlTone: Record<string, string> = {
    over: "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/40",
    today: "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40",
    soon: "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/40",
    normal: "bg-white/10 text-white/80",
    none: "bg-white/8 text-white/45",
    done: "bg-white/8 text-white/45",
  };
  const hasScreen = !!(s.screen_type && s.screen_type.trim());
  const screenNotInstalled = hasScreen && s.screen_installed !== V_GLASS_DONE;

  const designDone = s.design_received === V_DESIGN_DONE;
  const glassDone = s.glass_installed === V_GLASS_DONE;
  const qcBefore = s.qc_before_glass === V_QC_PASS;
  const qcAfter = s.qc_after_glass === V_QC_PASS;
  const qcDone = qcBefore && qcAfter;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-3 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className="text-white font-semibold text-[15px]">{s.set_label || "ชุดงาน"}</span>
        <span className={`text-[12px] font-bold px-2 py-0.5 rounded-md ${dlTone[dl.tone]}`}>
          {dl.tone === "over" && "🔴 "}{dl.tone === "soon" && "⚠️ "}{dl.text}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[12px]">
        {s.must_finish_date && <span className="tnum text-white/85">⏰ ต้องเสร็จ {thShort(s.must_finish_date)}</span>}
        {s.install_date && <span className="tnum text-white/55">· 🔧 ติดตั้ง {thShort(s.install_date)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        {hasScreen ? (
          <span className="inline-flex items-center gap-1 text-[12px] bg-sky-500/20 text-sky-100 rounded-md px-2 py-0.5">🪟 {s.screen_type}{screenNotInstalled && <span className="text-amber-200"> · ยังไม่ใส่</span>}</span>
        ) : (
          <span className="text-[11px] text-white/40">ไม่มีมุ้ง</span>
        )}
        {s.glass_spec && <span className="text-[12px] text-white/70 truncate max-w-[60%]">🟦 {s.glass_spec}</span>}
      </div>

      {canMark ? (
        <div className="grid grid-cols-3 gap-1.5">
          <MarkBtn label={designDone ? "ได้แบบแล้ว" : "ได้แบบ"} done={designDone} saving={saving}
            onClick={() => designDone
              ? mark(s.id, { design_received: V_DESIGN_UNDONE }, "ยกเลิก “ได้แบบแล้ว” ?")
              : mark(s.id, { design_received: V_DESIGN_DONE })} />
          <MarkBtn label={glassDone ? "ใส่กระจกแล้ว" : "ใส่กระจก"} done={glassDone} saving={saving}
            onClick={() => glassDone
              ? mark(s.id, { glass_installed: V_GLASS_UNDONE }, "ยกเลิก “ใส่กระจกแล้ว” ?")
              : mark(s.id, { glass_installed: V_GLASS_DONE })} />
          <MarkBtn label={qcDone ? "ตรวจผ่านครบ" : qcBefore ? "ตรวจหลังใส่" : "ตรวจก่อนสั่ง"} done={qcDone} half={qcBefore && !qcAfter} saving={saving}
            sub={<span className="text-[9px] tracking-widest">{qcBefore ? "●" : "○"}{qcAfter ? "●" : "○"}</span>}
            onClick={() => {
              if (qcDone) return mark(s.id, { qc_after_glass: "" }, "ยกเลิก QC หลังใส่กระจก ?");
              if (!qcBefore) return mark(s.id, { qc_before_glass: V_QC_PASS });
              return mark(s.id, { qc_after_glass: V_QC_PASS });
            }} />
        </div>
      ) : (
        <div className="flex gap-1.5 text-[11px]">
          <StatusPill ok={designDone} label="แบบ" />
          <StatusPill ok={glassDone} label="กระจก" />
          <StatusPill ok={qcDone} label="QC" />
        </div>
      )}

      <button onClick={() => setShowMore((x) => !x)} className="focusable pressable mt-2 text-[11px] text-white/50 hover:text-white/80 min-h-[32px]">
        {showMore ? "▲ ซ่อนรายละเอียด" : "▼ ดูรายละเอียดทั้งหมด"}
      </button>
      {showMore && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <RoRow label="คนวัด" v={s.measurer_name} />
          <RoRow label="วันวัด" v={s.measure_actual ? thShort(s.measure_actual) : ""} />
          <RoRow label="โครง/โรงงาน" v={s.frame_status} />
          <RoRow label="สั่งกระจก" v={s.glass_order} />
          <RoRow label="อุปกรณ์" v={s.mat_equipment} />
          <RoRow label="อลู ปกติ" v={s.mat_alu_normal} />
          <RoRow label="อลู อบสี" v={s.mat_alu_painted} />
          <RoRow label="ใส่มุ้ง" v={s.screen_installed} />
          <RoRow label="ใส่กระจกเสร็จ" v={s.glass_done_date ? thShort(s.glass_done_date) : ""} />
          <RoRow label="เสร็จจริง" v={s.actual_done_date ? thShort(s.actual_done_date) : ""} />
          {s.note && <div className="col-span-2"><RoRow label="หมายเหตุ" v={s.note} /></div>}
        </div>
      )}
    </div>
  );
}

function MarkBtn({ label, done, half, saving, sub, onClick }: { label: string; done: boolean; half?: boolean; saving: boolean; sub?: ReactNode; onClick: () => void }) {
  const cls = done ? "bg-emerald-500/90 text-white" : half ? "bg-amber-500/80 text-white" : "bg-white/8 text-white/70 border border-white/12";
  return (
    <button onClick={onClick} disabled={saving}
      className={`focusable pressable rounded-xl min-h-[56px] px-1 flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${cls} disabled:opacity-60`}>
      {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        : <>{done && <Check size={15} />}<span className="leading-tight text-center">{label}</span>{sub}</>}
    </button>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${ok ? "bg-emerald-500/20 text-emerald-200" : "bg-white/8 text-white/45"}`}>
      {ok ? <Check size={12} /> : "○"} {label}
    </span>
  );
}

function RoRow({ label, v }: { label: string; v: string }) {
  return <div><span className="text-white/40">{label}: </span><span className="text-white/75">{v || "—"}</span></div>;
}

// ── Modal เพิ่มงานผลิต (จดเอง / เลือกจากงานในระบบ) ──
type Candidate = { id: string; status: ProdStatus; job: { job_code: string; customer_name: string } | null };

function AddModal({ producerList, onClose, onSaved }: { producerList: string[]; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<"adhoc" | "job">("adhoc");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // จดเอง
  const [title, setTitle] = useState("");
  const [cust, setCust] = useState("");
  const [pdate, setPdate] = useState(today());
  const [idate, setIdate] = useState("");
  const [producer, setProducer] = useState("");

  // เลือกจากระบบ
  const { data: prodData } = useQuery({ queryKey: ["production", "candidates"], queryFn: () => api.get<Candidate[]>("/production") });
  // เฉพาะงานที่วัดแล้ว (PENDING_MEASURE ยังวัดไม่เสร็จ → ยังลงคิวผลิตไม่ได้)
  const NOT_QUEUED: ProdStatus[] = ["MEASURED", "PENDING_MEETING", "PENDING_CONFIRM", "REVISING"];
  const candidates = (prodData?.data ?? []).filter((p) => NOT_QUEUED.includes(p.status));
  const [pickId, setPickId] = useState("");

  const MODAL_DATALIST_ID = "modal-producers-list";

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (tab === "adhoc") {
        if (!cust.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); setSaving(false); return; }
        await api.post("/production-schedule", { customer_name: cust, title, produce_date: pdate, install_date: idate, producer_note: producer });
      } else {
        if (!pickId) { setErr("กรุณาเลือกงาน"); setSaving(false); return; }
        await api.patch(`/production/${pickId}`, { status: "QUEUED", production_queued: pdate, ...(idate ? { planned_install_date: idate } : {}) });
      }
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); setSaving(false); }
  };

  const inp = "w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none placeholder-white/40 min-h-[48px]";
  const dinp = inp;

  // ปิด modal ด้วยปุ่ม Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  // Portal ไป body → หลุดจาก ancestor ที่มี transform/backdrop-filter (กัน fixed เพี้ยน/ล้นจอ)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      {/* flex-col + header/footer ติดขอบ → ปิด/บันทึกเห็นเสมอแม้เนื้อหายาว */}
      <div className="relative w-full sm:max-w-md glass-dark rounded-t-3xl sm:rounded-3xl fade-in flex flex-col max-h-[88dvh]">
        {/* header (ปิดได้เสมอ) */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">เพิ่มงานผลิต</h2>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-10 h-10 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10"><X size={20} /></button>
        </div>

        {/* body (scroll) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* datalist สำหรับ modal */}
          <datalist id={MODAL_DATALIST_ID}>
            {producerList.map((name) => <option key={name} value={name} />)}
          </datalist>

          {/* tabs */}
          <div className="flex gap-1.5 glass-card rounded-xl p-1 mb-4">
            {[["adhoc", "จดเอง"], ["job", "เลือกจากงานในระบบ"]].map(([t, l]) => (
              <button key={t} onClick={() => { setTab(t as "adhoc" | "job"); setErr(null); }}
                className={`focusable pressable flex-1 px-3 py-2 rounded-lg text-[13px] font-medium min-h-[40px] ${tab === t ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>{l}</button>
            ))}
          </div>

          {tab === "adhoc" ? (
            <div className="space-y-3">
              <div><label className="block text-[13px] mb-1 text-white">ชื่อลูกค้า *</label>
                <input value={cust} onChange={(e) => setCust(e.target.value)} placeholder="เช่น คุณสมชาย / บ้านทรายทอง" className={inp} autoFocus /></div>
              <div><label className="block text-[13px] mb-1 text-white">ชื่อ/รายละเอียดงาน (ไม่บังคับ)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ซ่อมบานเลื่อน / งานด่วน" className={inp} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[13px] mb-1 text-white">วันผลิต</label>
                  <DateField value={pdate} onChange={(iso) => setPdate(iso)} className={dinp} aria-label="วันผลิต" /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง/ส่ง</label>
                  <DateField value={idate} onChange={(iso) => setIdate(iso)} className={dinp} aria-label="วันติดตั้ง/ส่ง" /></div>
              </div>
              <div>
                <label className="block text-[13px] mb-1 text-white">ช่างผลิต</label>
                <input
                  list={MODAL_DATALIST_ID}
                  value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                  placeholder="ชื่อช่าง"
                  className={inp}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div><label className="block text-[13px] mb-1 text-white">เลือกงานในระบบ (ยังไม่ลงคิว) *</label>
                <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={`${inp} appearance-none`}>
                  <option value="">— เลือกงาน —</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.job?.job_code} · {c.job?.customer_name} ({PROD_STATUS[c.status]})</option>)}
                </select>
                {candidates.length === 0 && <p className="text-[12px] text-amber-200 mt-1">ไม่มีงานที่วัดแล้วและยังไม่ลงคิว — งานที่ยังรอวัด (PENDING_MEASURE) ต้องวัดหน้างานก่อน</p>}</div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[13px] mb-1 text-white">วันผลิต</label>
                  <DateField value={pdate} onChange={(iso) => setPdate(iso)} className={dinp} aria-label="วันผลิต" /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง</label>
                  <DateField value={idate} onChange={(iso) => setIdate(iso)} className={dinp} aria-label="วันติดตั้ง" /></div>
              </div>
              <p className="text-[12px]" style={{ color: "var(--t-low)" }}>เลือกแล้วงานจะเข้าสถานะ "ลงคิวผลิต" + ใส่วันให้</p>
            </div>
          )}

          {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
        </div>

        {/* footer (ปุ่มเห็นเสมอ) */}
        <div className="flex gap-2 px-5 py-4 shrink-0 border-t border-white/10">
          <button onClick={onClose} className="focusable pressable glass-card text-white rounded-2xl px-5 min-h-[52px] font-medium">ปิด</button>
          <button onClick={submit} disabled={saving} className="focusable pressable flex-1 min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={20} />} บันทึก
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
