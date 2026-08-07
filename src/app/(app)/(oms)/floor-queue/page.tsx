"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";
// pure JS generator (ไม่มี type) — ใช้ร่วมกับ scripts/verify-floor-queue.mjs (golden test)
import { buildLineExport } from "@/lib/floor-queue/line-export.mjs";
import type {
  FloorQueueEntry, FloorQueueStatus, FloorQueueBucket, FloorQueueKind,
} from "@/lib/floor-queue/types";
import { FLOOR_QUEUE_STATUS_LABEL, COMMON_WORK_TYPES } from "@/lib/floor-queue/types";

// ── types ────────────────────────────────────────────────────────────────────

type QueueJob = { job_code: string | null; customer_name: string | null; current_stage?: number | null } | null;
type QueueEntry = FloorQueueEntry & { job: QueueJob };

// ── style ────────────────────────────────────────────────────────────────────
// พื้นช่องเข้มทึบ ตัดกับพื้นแดงเข้มของโซน OMS — ตัวอักษรขาวชัดเจน (ตามแบบ ProductionSetsSection)
const fieldCls =
  "w-full bg-slate-900/70 text-white text-[14px] px-2.5 py-2 rounded-lg border border-white/20 " +
  "focus:border-sky-300/60 focus:bg-slate-900/90 outline-none transition-colors placeholder-white/35 " +
  "disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]";
const selectCls = fieldCls + " appearance-none pr-7 cursor-pointer";
const optStyle = { background: "#0f172a", color: "#fff" } as const;

const TH_MONTHS = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function thaiDateFull(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `วันที่ ${d} ${TH_MONTHS[m]} ${y + 543}`;
}

const kindEmoji = (k: FloorQueueKind) => (k === "assess" ? "🟣" : "🔴");

// ── page ──────────────────────────────────────────────────────────────────────

export default function FloorQueuePage() {
  const qc = useQueryClient();
  const key = ["floor-queue"];
  const { data: res, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: key,
    queryFn: () => api.get<QueueEntry[]>("/floor-queue"),
    staleTime: 15_000,
  });
  const entries = res?.data ?? [];
  const canWrite = (res?.meta?.can_write as boolean) ?? false;

  const [pulling, setPulling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  async function patch(id: string, partial: Record<string, unknown>) {
    try {
      await api.patch(`/floor-queue/${id}`, partial);
      invalidate();
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1400);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function remove(id: string) {
    if (!confirm("ลบคิวนี้ออกจากรายการ?")) return;
    try { await api.del(`/floor-queue/${id}`); invalidate(); }
    catch (e) { alert(e instanceof ApiError ? e.message : "ลบไม่สำเร็จ"); }
  }

  async function pull() {
    setPulling(true);
    try {
      const r = await api.post<{ added: number }>("/floor-queue/pull", {});
      invalidate();
      alert(r.data.added > 0 ? `ดึงลูกค้าเข้าคิวเพิ่ม ${r.data.added} รายการ (อยู่ในถัง "มัดจำแล้ว รอลงคิว")` : "ไม่มีลูกค้าใหม่ที่เข้าเงื่อนไข");
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "ดึงลูกค้าอัตโนมัติไม่สำเร็จ");
    } finally { setPulling(false); }
  }

  async function copyToLine() {
    try {
      const text = buildLineExport(entries);
      if (!text) { alert("ยังไม่มีคิว — เพิ่มคิวก่อนคัดลอก"); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { alert("คัดลอกไม่สำเร็จ ลองใหม่"); }
  }

  // จัดกลุ่ม scheduled → เดือน → วันที่ (เรียงน้อยไปมาก)
  const scheduled = useMemo(
    () => entries.filter((e) => e.bucket === "scheduled" && e.scheduled_date)
      .slice().sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : a.scheduled_date! > b.scheduled_date! ? 1 : (a.sort_order ?? 0) - (b.sort_order ?? 0))),
    [entries],
  );
  const afterJr = useMemo(() => entries.filter((e) => e.bucket === "after_jr"), [entries]);
  const depositWait = useMemo(() => entries.filter((e) => e.bucket === "deposit_wait"), [entries]);

  const monthGroups = useMemo(() => {
    const byMonth = new Map<string, QueueEntry[]>();
    scheduled.forEach((e) => {
      const ym = e.scheduled_date!.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym)!.push(e);
    });
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scheduled]);

  const dayGroupsOf = (monthEntries: QueueEntry[]) => {
    const byDay = new Map<string, QueueEntry[]>();
    monthEntries.forEach((e) => {
      const d = e.scheduled_date!;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(e);
    });
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  if (isLoading) return <Spinner label="กำลังโหลดคิวงานพื้น…" />;
  if (error) return (
    <div role="alert" className="glass-card rounded-2xl p-6 text-center">
      <p className="text-rose-200 mb-3">{error instanceof Error ? error.message : "โหลดไม่สำเร็จ"}</p>
      <button onClick={() => refetch()} className="focusable pressable px-4 py-2 rounded-xl bg-white/10 hover:bg-white/18 text-white text-sm min-h-[44px]">ลองใหม่</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* combobox ตัวเลือกรายละเอียดงานที่ใช้บ่อย — ใช้ร่วมกันทุกช่อง work_desc ในหน้านี้ (list="work-types") */}
      <datalist id="work-types">
        {COMMON_WORK_TYPES.map((t) => <option key={t} value={t} />)}
      </datalist>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center bg-amber-500/25 border border-amber-300/30 text-amber-100">
            <Icon name="ruler" size={18} />
          </span>
          จัดคิวงานพื้น
          {savedFlash && <span className="text-[12px] font-normal text-emerald-200 flex items-center gap-1"><Icon name="check" size={12} /> บันทึกแล้ว</span>}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite && (
            <button onClick={pull} disabled={pulling}
              className="focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl glass-card border border-white/15 text-white text-sm font-medium min-h-[44px] disabled:opacity-60">
              <Icon name="refresh" size={15} className={pulling ? "animate-spin" : ""} /> ดึงลูกค้าอัตโนมัติ
            </button>
          )}
          <button onClick={copyToLine}
            className="focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-300/30 text-emerald-50 text-sm font-medium min-h-[44px]">
            <Icon name={copied ? "check" : "clipboard"} size={15} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไปไลน์"}
          </button>
          {canWrite && (
            <button onClick={() => setShowAdd(true)}
              className="focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white text-[#1F4E78] text-sm font-semibold min-h-[44px]">
              <Icon name="plus" size={15} /> เพิ่มคิว
            </button>
          )}
          <button onClick={() => refetch()} disabled={isFetching}
            className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl glass-card border border-white/15 text-white text-sm font-medium min-h-[44px] disabled:opacity-60">
            <Icon name="refresh" size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* คิวที่ลงวันแล้ว */}
        <div className="lg:col-span-2 space-y-4">
          {monthGroups.length === 0 ? (
            <EmptyState title="ยังไม่มีคิวที่ลงวันที่" sub="เพิ่มคิว หรือดึงลูกค้าอัตโนมัติ แล้วลงวันที่จากถังด้านขวา" />
          ) : (
            monthGroups.map(([ym, monthEntries]) => (
              <div key={ym} className="glass-card rounded-2xl p-4 border border-white/10">
                <div className="text-[13px] font-semibold text-amber-200/90 mb-3">
                  ☀️🌤️ อัพเดทคิวเดือน{TH_MONTHS[Number(ym.slice(5, 7))]} 🌤️✨
                </div>
                <div className="space-y-4">
                  {dayGroupsOf(monthEntries).map(([d, dayEntries]) => {
                    const dayKinds = [...new Set(dayEntries.map((e) => e.kind))];
                    const dayEmoji = dayKinds.length === 1 ? kindEmoji(dayKinds[0]) : "🔴🟣";
                    return (
                      <div key={d}>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 mb-2">
                          <span className="text-[14px] shrink-0" aria-hidden="true">{dayEmoji}</span>
                          <span className="text-[13px] font-semibold text-white">{thaiDateFull(d)}</span>
                        </div>
                        <div className="space-y-1.5">
                          {dayEntries.map((e) => (
                            <ScheduledRow key={e.id} entry={e} canWrite={canWrite} onPatch={patch} onDelete={remove} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2 ถังท้าย */}
        <div className="space-y-4">
          <BucketPanel title="รอต่อหลัง JR เสร็จ" entries={afterJr} canWrite={canWrite} onPatch={patch} onDelete={remove} otherBucket="deposit_wait" />
          <BucketPanel title="มัดจำแล้ว รอลงคิว" entries={depositWait} canWrite={canWrite} onPatch={patch} onDelete={remove} otherBucket="after_jr" />
        </div>
      </div>

      {showAdd && (
        <AddQueueModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); invalidate(); }} />
      )}
    </div>
  );
}

// ── แถวคิวที่ลงวันแล้ว — บรรทัดเดียวอ่านง่าย กดขยายเพื่อแก้ ──────────────────

function ScheduledRow({ entry, canWrite, onPatch, onDelete }: {
  entry: QueueEntry;
  canWrite: boolean;
  onPatch: (id: string, p: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const e = entry;
  const [expanded, setExpanded] = useState(false);
  const statusLabel = e.status !== "confirmed" ? FLOOR_QUEUE_STATUS_LABEL[e.status] : null;

  return (
    <div className="rounded-xl glass-card border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="focusable w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-[15px] shrink-0" aria-hidden="true">{kindEmoji(e.kind)}</span>
        <span className="tabular-nums text-[12.5px] text-white/55 shrink-0 w-11">{(e.start_time || "").slice(0, 5) || "--:--"}</span>
        <span className="flex-1 min-w-0 truncate">
          <span className="text-white font-medium text-[14px]">{e.customer_name || "(ไม่มีชื่อ)"}</span>
          {e.work_desc && <span className="text-white/60 text-[13px]"> · {e.work_desc}</span>}
          {e.duration_note && <span className="text-white/40 text-[12px]"> ({e.duration_note})</span>}
        </span>
        {statusLabel && (
          <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-300/30 text-amber-100">{statusLabel}</span>
        )}
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={15} className="text-white/40 shrink-0" />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input defaultValue={e.customer_name} disabled={!canWrite} placeholder="ชื่อลูกค้า"
              onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.customer_name && onPatch(e.id, { customer_name: ev.target.value.trim() })}
              className={fieldCls} aria-label="ชื่อลูกค้า" />
            <input list="work-types" defaultValue={e.work_desc} disabled={!canWrite} placeholder="รายละเอียดงาน เช่น เริ่มงาน, ต่องานฝ้า"
              onBlur={(ev) => ev.target.value !== e.work_desc && onPatch(e.id, { work_desc: ev.target.value })}
              className={fieldCls} aria-label="รายละเอียดงาน" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
            <DateField value={e.scheduled_date ?? ""} disabled={!canWrite} onChange={(iso) => iso && onPatch(e.id, { scheduled_date: iso })}
              className={fieldCls} aria-label="วันที่" />
            <input type="time" step={60} defaultValue={e.start_time} disabled={!canWrite}
              onBlur={(ev) => ev.target.value && ev.target.value !== e.start_time && onPatch(e.id, { start_time: ev.target.value })}
              className={`${fieldCls} tnum [&::-webkit-calendar-picker-indicator]:invert`} aria-label="เวลา" />
            <div className="relative">
              <select defaultValue={e.status} disabled={!canWrite} onChange={(ev) => onPatch(e.id, { status: ev.target.value as FloorQueueStatus })}
                className={selectCls} aria-label="สถานะ">
                {(Object.keys(FLOOR_QUEUE_STATUS_LABEL) as FloorQueueStatus[]).map((s) => (
                  <option key={s} value={s} style={optStyle}>{FLOOR_QUEUE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-1">
              <button type="button" disabled={!canWrite} onClick={() => onPatch(e.id, { kind: "work" as FloorQueueKind })}
                title="งาน" aria-pressed={e.kind === "work"}
                className={`flex-1 rounded-lg py-2 text-[13px] border min-h-[40px] ${e.kind === "work" ? "bg-rose-500/30 border-rose-300/40 text-white" : "border-white/15 text-white/50"}`}>
                🔴 งาน
              </button>
              <button type="button" disabled={!canWrite} onClick={() => onPatch(e.id, { kind: "assess" as FloorQueueKind })}
                title="ประเมิน/คุยงาน" aria-pressed={e.kind === "assess"}
                className={`flex-1 rounded-lg py-2 text-[13px] border min-h-[40px] ${e.kind === "assess" ? "bg-purple-500/30 border-purple-300/40 text-white" : "border-white/15 text-white/50"}`}>
                🟣 คุย
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input defaultValue={e.duration_note} disabled={!canWrite} placeholder="ระยะเวลาทำงาน เช่น ทำ3วัน"
              onBlur={(ev) => ev.target.value !== e.duration_note && onPatch(e.id, { duration_note: ev.target.value })}
              className={fieldCls} aria-label="ระยะเวลาทำงาน" />
            <input defaultValue={e.extra_note} disabled={!canWrite} placeholder="โน้ตภายใน (ไม่ขึ้นข้อความไลน์)"
              onBlur={(ev) => ev.target.value !== e.extra_note && onPatch(e.id, { extra_note: ev.target.value })}
              className={fieldCls} aria-label="โน้ตภายใน" />
          </div>
          {e.job?.job_code && <div className="text-[11px]" style={{ color: "var(--t-low)" }}>ผูกงาน: {e.job.job_code}</div>}
          {canWrite && (
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => onPatch(e.id, { bucket: "after_jr" as FloorQueueBucket, scheduled_date: null })}
                className="focusable pressable text-[12px] px-2.5 py-1.5 rounded-md bg-white/8 hover:bg-white/15 text-white/70 min-h-[36px]">ถอดกลับถัง</button>
              <button onClick={() => onDelete(e.id)} aria-label="ลบคิว"
                className="focusable pressable inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 min-h-[36px]">
                <Icon name="trash" size={12} /> ลบ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ถังท้าย (ไม่มีวัน) ────────────────────────────────────────────────────────

function BucketPanel({ title, entries, canWrite, onPatch, onDelete, otherBucket }: {
  title: string;
  entries: QueueEntry[];
  canWrite: boolean;
  onPatch: (id: string, p: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  otherBucket: FloorQueueBucket;
}) {
  const [setDateFor, setSetDateFor] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="glass-card rounded-2xl p-4 border border-white/10">
      <div className="text-[13px] font-semibold text-white mb-3">{title} <span className="text-white/40 font-normal">({entries.length})</span></div>
      {entries.length === 0 ? (
        <div className="text-[12px] text-center py-4" style={{ color: "var(--t-low)" }}>ไม่มีรายการ</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const expanded = expandedId === e.id;
            return (
              <div key={e.id} className="rounded-xl bg-white/6 border border-white/10 overflow-hidden">
                <div className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
                  <button type="button" onClick={() => setExpandedId(expanded ? null : e.id)} aria-expanded={expanded}
                    className="focusable flex-1 min-w-0 text-left min-h-[40px] flex items-center py-1">
                    <span className="min-w-0 truncate">
                      <span className="text-white text-[13.5px] font-medium">{e.customer_name || "(ไม่มีชื่อ)"}</span>
                      {e.work_desc && <span className="text-white/60 text-[12.5px]"> · {e.work_desc}</span>}
                      {e.extra_note && <span className="text-white/40 text-[12px]"> ({e.extra_note})</span>}
                    </span>
                  </button>
                  {canWrite && (
                    <button onClick={() => { setSetDateFor(setDateFor === e.id ? null : e.id); setPendingDate(""); }}
                      className="focusable pressable shrink-0 text-[12px] px-2.5 py-1.5 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-100 min-h-[40px]">
                      ลงวันที่
                    </button>
                  )}
                  <button type="button" onClick={() => setExpandedId(expanded ? null : e.id)} aria-label="แก้ไขเพิ่มเติม"
                    className="focusable shrink-0 text-white/40 hover:text-white min-h-[40px] min-w-[36px] flex items-center justify-center">
                    <Icon name={expanded ? "chevron-up" : "chevron-down"} size={15} />
                  </button>
                </div>

                {expanded && (
                  <div className="px-3 pb-3 pt-0.5 border-t border-white/10 space-y-1.5">
                    <input defaultValue={e.customer_name} disabled={!canWrite} placeholder="ชื่อลูกค้า"
                      onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.customer_name && onPatch(e.id, { customer_name: ev.target.value.trim() })}
                      className={fieldCls} aria-label="ชื่อลูกค้า" />
                    <input list="work-types" defaultValue={e.work_desc} disabled={!canWrite} placeholder="งาน (ถ้ามี) เช่น ต่องานเฟส2"
                      onBlur={(ev) => ev.target.value !== e.work_desc && onPatch(e.id, { work_desc: ev.target.value })}
                      className={fieldCls} aria-label="งาน" />
                    <input defaultValue={e.extra_note} disabled={!canWrite} placeholder="โน้ตเสริม เช่น รอลูกค้าคอนเฟิร์ม"
                      onBlur={(ev) => ev.target.value !== e.extra_note && onPatch(e.id, { extra_note: ev.target.value })}
                      className={fieldCls} aria-label="โน้ตเสริม" />
                    {e.job?.job_code && <div className="text-[11px]" style={{ color: "var(--t-low)" }}>ผูกงาน: {e.job.job_code}</div>}
                    {canWrite && (
                      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                        <button onClick={() => onPatch(e.id, { bucket: otherBucket })}
                          className="focusable pressable text-[12px] px-2.5 py-1.5 rounded-md bg-white/8 hover:bg-white/15 text-white/70 min-h-[36px]">
                          ย้ายไป{otherBucket === "after_jr" ? "รอต่อหลัง JR" : "มัดจำ รอลงคิว"}
                        </button>
                        <button onClick={() => onDelete(e.id)} aria-label="ลบคิว"
                          className="focusable pressable inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 min-h-[36px]">
                          <Icon name="trash" size={12} /> ลบ
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {setDateFor === e.id && (
                  <div className="flex gap-2 px-3 pb-3">
                    <DateField value={pendingDate} onChange={setPendingDate} className={fieldCls} aria-label="เลือกวันที่ลงคิว" />
                    <button
                      onClick={() => { if (pendingDate) { onPatch(e.id, { scheduled_date: pendingDate }); setSetDateFor(null); } }}
                      disabled={!pendingDate}
                      className="focusable pressable shrink-0 px-3 rounded-lg bg-white text-[#1F4E78] text-[12px] font-semibold disabled:opacity-50 min-h-[40px]">
                      ยืนยัน
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── เพิ่มคิวใหม่ ──────────────────────────────────────────────────────────────

type JobHit = { id: string; job_code: string | null; customer_name: string | null };

function AddQueueModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"job" | "manual">("manual");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<JobHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedJob, setPickedJob] = useState<JobHit | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [workDesc, setWorkDesc] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [durationNote, setDurationNote] = useState("");
  const [bucket, setBucket] = useState<FloorQueueBucket>("scheduled");
  const [kind, setKind] = useState<FloorQueueKind>("work");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function search(text: string) {
    setQ(text);
    if (!text.trim()) { setHits([]); return; }
    setSearching(true);
    try {
      const r = await api.get<JobHit[]>(`/jobs?q=${encodeURIComponent(text.trim())}&limit=15`);
      setHits(r.data ?? []);
    } catch { setHits([]); }
    finally { setSearching(false); }
  }

  const nameForSave = mode === "job" ? (pickedJob?.customer_name ?? "") : customerName.trim();

  async function save() {
    setErr("");
    if (!nameForSave) { setErr("กรุณาระบุชื่อลูกค้า หรือเลือกงาน JR"); return; }
    if (bucket === "scheduled" && !date) { setErr("กรุณาเลือกวันที่ (หรือเปลี่ยนไปลงถังแทน)"); return; }
    setBusy(true);
    try {
      await api.post("/floor-queue", {
        job_id: mode === "job" ? pickedJob?.id ?? null : null,
        customer_name: nameForSave,
        work_desc: workDesc.trim(),
        extra_note: extraNote.trim(),
        duration_note: durationNote.trim(),
        bucket,
        scheduled_date: bucket === "scheduled" ? date : null,
        start_time: time,
        kind,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-lg glass rounded-2xl p-5 fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white flex items-center gap-2"><Icon name="plus" size={16} /> เพิ่มคิวงานพื้น</h3>
          <button onClick={onClose} aria-label="ปิด" className="text-white/60 hover:text-white"><Icon name="close" size={18} /></button>
        </div>

        {/* เลือกโหมด: งาน JR / พิมพ์เอง */}
        <div className="flex gap-1 glass-card rounded-xl p-1 border border-white/10 mb-3">
          <button onClick={() => setMode("manual")}
            className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium min-h-[40px] ${mode === "manual" ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>
            พิมพ์ชื่อลูกค้าเอง
          </button>
          <button onClick={() => setMode("job")}
            className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium min-h-[40px] ${mode === "job" ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>
            ค้นหางาน JR
          </button>
        </div>

        {mode === "manual" ? (
          <label className="block mb-3">
            <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ชื่อลูกค้า</span>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="เช่น กนกวรรณ(ลพบุรี)"
              className={fieldCls} aria-label="ชื่อลูกค้า" />
          </label>
        ) : (
          <div className="mb-3">
            <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ค้นหางาน (ชื่อ/รหัสงาน)</span>
            {pickedJob ? (
              <div className="flex items-center justify-between glass-card rounded-lg px-3 py-2.5 border border-white/15">
                <span className="text-sm text-white">{pickedJob.job_code ?? "—"} · {pickedJob.customer_name}</span>
                <button onClick={() => { setPickedJob(null); setQ(""); }} className="text-white/50 hover:text-white"><Icon name="close" size={14} /></button>
              </div>
            ) : (
              <>
                <input value={q} onChange={(e) => search(e.target.value)} placeholder="พิมพ์ชื่อลูกค้าหรือรหัสงาน…"
                  className={fieldCls} aria-label="ค้นหางาน" />
                {searching && <div className="text-[11px] text-white/50 mt-1">กำลังค้นหา…</div>}
                {hits.length > 0 && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-white/15">
                    {hits.map((h) => (
                      <button key={h.id} onClick={() => setPickedJob(h)}
                        className="w-full text-left px-3 py-2 text-[13px] text-white hover:bg-white/10 border-b border-white/10 last:border-0">
                        {h.job_code ?? "—"} · {h.customer_name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <label className="block mb-3">
          <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>รายละเอียดงาน (ถ้ามี)</span>
          <input list="work-types" value={workDesc} onChange={(e) => setWorkDesc(e.target.value)} placeholder="เลือกจากรายการ หรือพิมพ์เอง เช่น เริ่มงาน, ต่องานฝ้า,ไฟ"
            className={fieldCls} aria-label="รายละเอียดงาน" />
        </label>

        <label className="block mb-3">
          <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ถัง / สถานะคิว</span>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as FloorQueueBucket)} className={selectCls} aria-label="ถัง">
            <option value="scheduled" style={optStyle}>ลงคิว (มีวันที่)</option>
            <option value="after_jr" style={optStyle}>รอต่อหลัง JR เสร็จ</option>
            <option value="deposit_wait" style={optStyle}>มัดจำแล้ว รอลงคิว</option>
          </select>
        </label>

        {bucket === "scheduled" ? (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="block">
              <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>วันที่</span>
              <DateField value={date} onChange={setDate} className={fieldCls} aria-label="วันที่ลงคิว" />
            </label>
            <label className="block">
              <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>เวลา</span>
              <input type="time" step={60} value={time} onChange={(e) => setTime(e.target.value.slice(0, 5))}
                className={`${fieldCls} tnum [&::-webkit-calendar-picker-indicator]:invert`} aria-label="เวลา" />
            </label>
            <label className="block col-span-2">
              <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ชนิด</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setKind("work")}
                  className={`flex-1 rounded-lg py-2.5 text-[13px] border min-h-[40px] ${kind === "work" ? "bg-rose-500/30 border-rose-300/40 text-white" : "border-white/15 text-white/50"}`}>
                  🔴 งาน
                </button>
                <button type="button" onClick={() => setKind("assess")}
                  className={`flex-1 rounded-lg py-2.5 text-[13px] border min-h-[40px] ${kind === "assess" ? "bg-purple-500/30 border-purple-300/40 text-white" : "border-white/15 text-white/50"}`}>
                  🟣 ประเมิน/คุย
                </button>
              </div>
            </label>
            <label className="block col-span-2">
              <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ระยะเวลาทำงาน (ถ้ามี)</span>
              <input value={durationNote} onChange={(e) => setDurationNote(e.target.value)} placeholder="เช่น ทำ3วัน"
                className={fieldCls} aria-label="ระยะเวลาทำงาน" />
            </label>
          </div>
        ) : (
          <label className="block mb-3">
            <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>โน้ตเสริม (ถ้ามี)</span>
            <input value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="เช่น รอลูกค้าคอนเฟิร์มทำงาน"
              className={fieldCls} aria-label="โน้ตเสริม" />
          </label>
        )}

        {err && <p role="alert" className="mb-3 text-sm text-rose-200 bg-rose-500/15 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-2">
          <button onClick={save} disabled={busy}
            className="focusable pressable flex-1 rounded-xl py-2.5 text-sm font-semibold text-[#1F4E78] bg-white hover:bg-white/90 disabled:opacity-60 min-h-[48px]">
            {busy ? "กำลังบันทึก…" : "เพิ่มคิว"}
          </button>
          <button onClick={onClose} disabled={busy}
            className="focusable pressable glass-card border border-white/15 rounded-xl px-5 py-2.5 text-sm text-white/80 min-h-[48px]">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}
