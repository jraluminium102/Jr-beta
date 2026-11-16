"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
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
// ธีมสบายตา (เจ้าของ 16 พ.ย.69 "ไม่เอาสีแดง มันแสบตา"): พื้นเทาอมฟ้าอ่อน · การ์ดขาว · ตัวหนังสือเข้ม · ปุ่มหลักน้ำเงินกรม
//   ตัวหนังสือที่ต้องอ่าน ใช้ไม่อ่อนกว่า slate-600 บนพื้นขาว (ตัดกันเกิน 7:1) · ห้ามใช้ตัวขาว/ตัวจางบนพื้นอ่อน
const NAVY = "#1F4E78";
const fieldCls =
  "w-full bg-white text-slate-900 text-[15px] px-2.5 py-2 rounded-lg border border-slate-300 " +
  "focus:border-[#1F4E78] focus:ring-2 focus:ring-[#1F4E78]/20 outline-none transition-colors placeholder-slate-500 " +
  "disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed min-h-[40px]";
const selectCls = fieldCls + " cursor-pointer";
const cardCls = "bg-white rounded-2xl p-4 border border-slate-200 shadow-sm";
const labelCls = "block text-[13px] font-medium text-slate-700 mb-1";
const btnPrimary = "bg-[#1F4E78] hover:bg-[#183d5e] text-white";
const btnPlain = "bg-white hover:bg-slate-50 border border-slate-300 text-slate-800";
const btnDanger = "bg-white hover:bg-rose-50 border border-rose-200 text-rose-700";
// แถวที่ถูกชี้ (เพิ่งเพิ่ม / กดมาจากปฏิทิน) — พื้นฟ้าอ่อน + ขอบน้ำเงิน เห็นชัดแต่ไม่แสบตา
const hiCls = "bg-sky-50 border-[#1F4E78] ring-2 ring-[#1F4E78]/35";

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

// ชื่อลูกค้าแบบเทียบกันได้ — ตัด "คุณ" · วงเล็บท้ายชื่อ · ช่องว่าง (ใช้หา "คนเดียวกัน" ตอนกดมาจากปฏิทิน)
const normName = (s?: string | null) =>
  String(s ?? "").replace(/\(.*?\)/g, "").replace(/^\s*คุณ\s*/, "").replace(/\s+/g, "").toLowerCase();

/** คิวล่าสุด (วันที่อนาคตที่สุด) ของลูกค้าคนเดียวกับ src — คนเดียวกัน = งาน JR เดียวกัน หรือชื่อเดียวกัน */
function latestOfCustomer(entries: QueueEntry[], src: QueueEntry): QueueEntry {
  const key = normName(src.customer_name);
  const same = entries.filter((e) =>
    e.bucket === "scheduled" && e.scheduled_date &&
    ((src.job_id && e.job_id === src.job_id) || (key && normName(e.customer_name) === key)));
  if (!same.length) return src;
  return same.reduce((a, b) => {
    const ka = `${a.scheduled_date} ${a.start_time ?? ""}`;
    const kb = `${b.scheduled_date} ${b.start_time ?? ""}`;
    return kb > ka ? b : a;
  });
}

// textarea โตอัตโนมัติตามข้อความ — แก้ปัญหา "พิมพ์ยาวเกินช่องแล้วมองไม่เห็น" (ข้อความห่อบรรทัด เห็นครบ)
function GrowText(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 240)}px`; } };
  useEffect(() => { grow(); }, []);
  useEffect(() => { grow(); }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      {...props}
      onInput={(e) => { grow(); props.onInput?.(e); }}
      className={`${props.className ?? ""} resize-none overflow-hidden leading-snug`}
    />
  );
}

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
  const [search, setSearch] = useState("");
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [showTop, setShowTop] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  // ปุ่มเลื่อนขึ้นบนสุด — โผล่เมื่อเลื่อนลงเยอะ
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // กดคิวงานพื้นมาจากหน้าปฏิทิน (/floor-queue?focus=<id>) → เลื่อนไปหาลูกค้าคนนั้น ที่ "คิวล่าสุด" (วันที่อนาคตที่สุด) + ไฮไลต์
  //   (เจ้าของ 16 พ.ย.69) อ่านจาก window.location ตรง ๆ — ไม่ใช้ useSearchParams (ต้องครอบ Suspense ตอน build)
  const focusDone = useRef(false);
  useEffect(() => {
    if (focusDone.current || !entries.length) return;
    focusDone.current = true;
    const id = new URLSearchParams(window.location.search).get("focus");
    if (!id) return;
    const src = entries.find((e) => e.id === id);
    if (src) setJustAddedId(latestOfCustomer(entries, src).id);
    // ล้าง ?focus ออกจากแถบที่อยู่ — รีเฟรชหน้าแล้วไม่เด้งซ้ำ
    window.history.replaceState(null, "", window.location.pathname);
  }, [entries]);

  // บันทึกคิวใหม่ / กดมาจากปฏิทิน → เลื่อนไปหา + ไฮไลต์คิวนั้น
  useEffect(() => {
    if (!justAddedId) return;
    const t = setTimeout(() => {
      document.getElementById(`fq-${justAddedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const clr = setTimeout(() => setJustAddedId(null), 5000);
    return () => { clearTimeout(t); clearTimeout(clr); };
  }, [justAddedId, entries]);

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

  // กรองด้วยคำค้น (ชื่อลูกค้า / รายละเอียดงาน)
  const q = search.trim().toLowerCase();
  const matchQ = (e: QueueEntry) =>
    !q || (e.customer_name ?? "").toLowerCase().includes(q) || (e.work_desc ?? "").toLowerCase().includes(q);

  // จัดกลุ่ม scheduled → เดือน → วันที่ (เรียงน้อยไปมาก)
  const scheduled = useMemo(
    () => entries.filter((e) => e.bucket === "scheduled" && e.scheduled_date && matchQ(e))
      .slice().sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : a.scheduled_date! > b.scheduled_date! ? 1 : (a.sort_order ?? 0) - (b.sort_order ?? 0))),
    [entries, q],
  );
  const afterJr = useMemo(() => entries.filter((e) => e.bucket === "after_jr" && matchQ(e)), [entries, q]);
  const depositWait = useMemo(() => entries.filter((e) => e.bucket === "deposit_wait" && matchQ(e)), [entries, q]);

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

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-[15px] text-slate-700">
      <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-[#1F4E78] animate-spin" />
      กำลังโหลดคิวงานพื้น…
    </div>
  );
  if (error) return (
    <div role="alert" className={`${cardCls} p-6 text-center`}>
      <p className="text-rose-700 mb-3">{error instanceof Error ? error.message : "โหลดไม่สำเร็จ"}</p>
      <button onClick={() => refetch()} className={`focusable pressable px-4 py-2 rounded-xl text-sm min-h-[44px] ${btnPlain}`}>ลองใหม่</button>
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
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-white" style={{ background: NAVY }}>
            <Icon name="ruler" size={18} />
          </span>
          <span className="text-[22px] leading-none" aria-hidden="true">🧱👷</span> จัดคิวงานพื้น
          {savedFlash && <span className="text-[13px] font-medium text-emerald-700 flex items-center gap-1"><Icon name="check" size={13} /> บันทึกแล้ว</span>}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite && (
            <button onClick={pull} disabled={pulling}
              className={`focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-60 ${btnPlain}`}>
              <Icon name="refresh" size={15} className={pulling ? "animate-spin" : ""} /> ดึงลูกค้าอัตโนมัติ
            </button>
          )}
          <button onClick={copyToLine}
            className="focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium min-h-[44px]">
            <Icon name={copied ? "check" : "clipboard"} size={15} /> {copied ? "คัดลอกแล้ว" : "คัดลอกไปไลน์"}
          </button>
          {canWrite && (
            <button onClick={() => setShowAdd(true)}
              className={`focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${btnPrimary}`}>
              <Icon name="plus" size={15} /> เพิ่มคิว
            </button>
          )}
          <button onClick={() => refetch()} disabled={isFetching} aria-label="โหลดใหม่"
            className={`focusable pressable inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px] disabled:opacity-60 ${btnPlain}`}>
            <Icon name="refresh" size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ค้นหาชื่อลูกค้า */}
      <div className="relative max-w-sm">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"><Icon name="search" size={15} /></span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อลูกค้า / งาน…"
          className={`${fieldCls} pl-8 pr-8`} aria-label="ค้นหาชื่อลูกค้า" />
        {search && (
          <button onClick={() => setSearch("")} aria-label="ล้างคำค้น"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"><Icon name="close" size={14} /></button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* คิวที่ลงวันแล้ว */}
        <div className="lg:col-span-2 space-y-4">
          {monthGroups.length === 0 ? (
            <div className={`${cardCls} p-10 text-center`}>
              <div className="text-[15px] font-medium text-slate-800">ยังไม่มีคิวที่ลงวันที่</div>
              <div className="text-[13px] mt-1 text-slate-600">เพิ่มคิว หรือดึงลูกค้าอัตโนมัติ แล้วลงวันที่จากถังด้านขวา</div>
            </div>
          ) : (
            monthGroups.map(([ym, monthEntries]) => (
              <div key={ym} className={cardCls}>
                <div className="text-[15px] font-bold mb-3" style={{ color: NAVY }}>
                  ☀️🌤️ อัพเดทคิวเดือน{TH_MONTHS[Number(ym.slice(5, 7))]} 🌤️✨
                </div>
                <div className="space-y-4">
                  {dayGroupsOf(monthEntries).map(([d, dayEntries]) => {
                    const dayKinds = [...new Set(dayEntries.map((e) => e.kind))];
                    const dayEmoji = dayKinds.length === 1 ? kindEmoji(dayKinds[0]) : "🔴🟣";
                    return (
                      <div key={d}>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#E6EEF5] border border-[#C9D8E6] mb-2">
                          <span className="text-[14px] shrink-0" aria-hidden="true">{dayEmoji}</span>
                          <span className="text-[14px] font-semibold text-slate-900">{thaiDateFull(d)}</span>
                        </div>
                        <div className="space-y-1.5">
                          {dayEntries.map((e) => (
                            <ScheduledRow key={e.id} entry={e} canWrite={canWrite} onPatch={patch} onDelete={remove} highlight={e.id === justAddedId} />
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
          <BucketPanel title="รอต่อหลัง JR เสร็จ" entries={afterJr} canWrite={canWrite} onPatch={patch} onDelete={remove} otherBucket="deposit_wait" highlightId={justAddedId} />
          <BucketPanel title="มัดจำแล้ว รอลงคิว" entries={depositWait} canWrite={canWrite} onPatch={patch} onDelete={remove} otherBucket="after_jr" highlightId={justAddedId} />
        </div>
      </div>

      {showAdd && (
        <AddQueueModal onClose={() => setShowAdd(false)} onSaved={(newId) => { setShowAdd(false); setJustAddedId(newId ?? null); invalidate(); }} />
      )}

      {/* ปุ่มเลื่อนขึ้นบนสุด */}
      {showTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="เลื่อนขึ้นบนสุด"
          className={`fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center focusable pressable ${btnPrimary}`}>
          <Icon name="chevron-up" size={22} />
        </button>
      )}
    </div>
  );
}

// ── ปุ่มเลือกชนิด (งาน / ประเมิน-คุย) ──────────────────────────────────────────

function KindButtons({ value, disabled, onPick, assessLabel }: {
  value: FloorQueueKind; disabled?: boolean; onPick: (k: FloorQueueKind) => void; assessLabel: string;
}) {
  const cls = (on: boolean) =>
    `flex-1 rounded-lg py-2 text-[14px] border min-h-[40px] ${on
      ? "bg-[#E6EEF5] border-[#1F4E78] text-slate-900 font-semibold"
      : "bg-white border-slate-300 text-slate-600"}`;
  return (
    <div className="flex gap-1">
      <button type="button" disabled={disabled} onClick={() => onPick("work")} title="งาน" aria-pressed={value === "work"} className={cls(value === "work")}>
        🔴 งาน
      </button>
      <button type="button" disabled={disabled} onClick={() => onPick("assess")} title="ประเมิน/คุยงาน" aria-pressed={value === "assess"} className={cls(value === "assess")}>
        🟣 {assessLabel}
      </button>
    </div>
  );
}

// ── แถวคิวที่ลงวันแล้ว — บรรทัดเดียวอ่านง่าย กดขยายเพื่อแก้ ──────────────────

function ScheduledRow({ entry, canWrite, onPatch, onDelete, highlight }: {
  entry: QueueEntry;
  canWrite: boolean;
  onPatch: (id: string, p: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  highlight?: boolean;
}) {
  const e = entry;
  const [expanded, setExpanded] = useState(false);
  const statusLabel = e.status !== "confirmed" ? FLOOR_QUEUE_STATUS_LABEL[e.status] : null;

  return (
    <div id={`fq-${e.id}`} className={`rounded-xl border overflow-hidden transition-shadow ${highlight ? hiCls : "bg-white border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="focusable w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-[15px] shrink-0" aria-hidden="true">{kindEmoji(e.kind)}</span>
        <span className="tabular-nums text-[13.5px] text-slate-600 shrink-0 w-11">{(e.start_time || "").slice(0, 5) || "--:--"}</span>
        <span className="flex-1 min-w-0 truncate">
          <span className="text-slate-900 font-semibold text-[15px]">{e.customer_name || "(ไม่มีชื่อ)"}</span>
          {e.work_desc && <span className="text-slate-700 text-[14px]"> · {e.work_desc}</span>}
          {e.duration_note && <span className="text-slate-600 text-[13px]"> ({e.duration_note})</span>}
        </span>
        {statusLabel && (
          <span className="shrink-0 text-[12px] font-medium px-1.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-900">{statusLabel}</span>
        )}
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={15} className="text-slate-500 shrink-0" />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-200 bg-slate-50 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <GrowText defaultValue={e.customer_name} disabled={!canWrite} placeholder="ชื่อลูกค้า"
              onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.customer_name && onPatch(e.id, { customer_name: ev.target.value.trim() })}
              className={fieldCls} aria-label="ชื่อลูกค้า" />
            <GrowText defaultValue={e.work_desc} disabled={!canWrite} placeholder="รายละเอียดงาน เช่น เริ่มงาน, ต่องานฝ้า"
              onBlur={(ev) => ev.target.value !== e.work_desc && onPatch(e.id, { work_desc: ev.target.value })}
              className={fieldCls} aria-label="รายละเอียดงาน" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
            <DateField value={e.scheduled_date ?? ""} disabled={!canWrite} onChange={(iso) => iso && onPatch(e.id, { scheduled_date: iso })}
              className={fieldCls} aria-label="วันที่" />
            <input type="time" step={60} defaultValue={e.start_time} disabled={!canWrite}
              onBlur={(ev) => ev.target.value && ev.target.value !== e.start_time && onPatch(e.id, { start_time: ev.target.value })}
              className={`${fieldCls} tnum`} aria-label="เวลา" />
            <div className="relative">
              <select defaultValue={e.status} disabled={!canWrite} onChange={(ev) => onPatch(e.id, { status: ev.target.value as FloorQueueStatus })}
                className={selectCls} aria-label="สถานะ">
                {(Object.keys(FLOOR_QUEUE_STATUS_LABEL) as FloorQueueStatus[]).map((s) => (
                  <option key={s} value={s}>{FLOOR_QUEUE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <KindButtons value={e.kind} disabled={!canWrite} onPick={(k) => onPatch(e.id, { kind: k })} assessLabel="คุย" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <GrowText defaultValue={e.duration_note} disabled={!canWrite} placeholder="ระยะเวลาทำงาน เช่น ทำ3วัน"
              onBlur={(ev) => ev.target.value !== e.duration_note && onPatch(e.id, { duration_note: ev.target.value })}
              className={fieldCls} aria-label="ระยะเวลาทำงาน" />
            <GrowText defaultValue={e.extra_note} disabled={!canWrite} placeholder="โน้ตภายใน (ไม่ขึ้นข้อความไลน์)"
              onBlur={(ev) => ev.target.value !== e.extra_note && onPatch(e.id, { extra_note: ev.target.value })}
              className={fieldCls} aria-label="โน้ตภายใน" />
          </div>
          {e.job?.job_code && <div className="text-[12.5px] text-slate-600">ผูกงาน: {e.job.job_code}</div>}
          {canWrite && (
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => onPatch(e.id, { bucket: "after_jr" as FloorQueueBucket, scheduled_date: null })}
                className={`focusable pressable text-[13px] px-2.5 py-1.5 rounded-md min-h-[36px] ${btnPlain}`}>ถอดกลับถัง</button>
              <button onClick={() => onDelete(e.id)} aria-label="ลบคิว"
                className={`focusable pressable inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-md min-h-[36px] ${btnDanger}`}>
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

function BucketPanel({ title, entries, canWrite, onPatch, onDelete, otherBucket, highlightId }: {
  title: string;
  entries: QueueEntry[];
  canWrite: boolean;
  onPatch: (id: string, p: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  otherBucket: FloorQueueBucket;
  highlightId?: string | null;
}) {
  const [setDateFor, setSetDateFor] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={cardCls}>
      <div className="text-[15px] font-bold text-slate-900 mb-3">{title} <span className="text-slate-600 font-normal">({entries.length})</span></div>
      {entries.length === 0 ? (
        <div className="text-[13px] text-center py-4 text-slate-600">ไม่มีรายการ</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const expanded = expandedId === e.id;
            return (
              <div key={e.id} id={`fq-${e.id}`} className={`rounded-xl border overflow-hidden transition-shadow ${highlightId === e.id ? hiCls : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
                  <button type="button" onClick={() => setExpandedId(expanded ? null : e.id)} aria-expanded={expanded}
                    className="focusable flex-1 min-w-0 text-left min-h-[40px] flex items-center py-1">
                    <span className="min-w-0 truncate">
                      <span className="text-slate-900 text-[14.5px] font-semibold">{e.customer_name || "(ไม่มีชื่อ)"}</span>
                      {e.work_desc && <span className="text-slate-700 text-[13.5px]"> · {e.work_desc}</span>}
                      {e.extra_note && <span className="text-slate-600 text-[13px]"> ({e.extra_note})</span>}
                    </span>
                  </button>
                  {canWrite && (
                    <button onClick={() => { setSetDateFor(setDateFor === e.id ? null : e.id); setPendingDate(""); }}
                      className="focusable pressable shrink-0 text-[13px] font-medium px-2.5 py-1.5 rounded-md bg-[#E6EEF5] hover:bg-[#D5E3EF] border border-[#C9D8E6] text-[#1F4E78] min-h-[40px]">
                      ลงวันที่
                    </button>
                  )}
                  <button type="button" onClick={() => setExpandedId(expanded ? null : e.id)} aria-label="แก้ไขเพิ่มเติม"
                    className="focusable shrink-0 text-slate-500 hover:text-slate-800 min-h-[40px] min-w-[36px] flex items-center justify-center">
                    <Icon name={expanded ? "chevron-up" : "chevron-down"} size={15} />
                  </button>
                </div>

                {expanded && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-200 space-y-1.5">
                    <GrowText defaultValue={e.customer_name} disabled={!canWrite} placeholder="ชื่อลูกค้า"
                      onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.customer_name && onPatch(e.id, { customer_name: ev.target.value.trim() })}
                      className={fieldCls} aria-label="ชื่อลูกค้า" />
                    <GrowText defaultValue={e.work_desc} disabled={!canWrite} placeholder="งาน (ถ้ามี) เช่น ต่องานเฟส2"
                      onBlur={(ev) => ev.target.value !== e.work_desc && onPatch(e.id, { work_desc: ev.target.value })}
                      className={fieldCls} aria-label="งาน" />
                    <GrowText defaultValue={e.extra_note} disabled={!canWrite} placeholder="โน้ตเสริม เช่น รอลูกค้าคอนเฟิร์ม"
                      onBlur={(ev) => ev.target.value !== e.extra_note && onPatch(e.id, { extra_note: ev.target.value })}
                      className={fieldCls} aria-label="โน้ตเสริม" />
                    {e.job?.job_code && <div className="text-[12.5px] text-slate-600">ผูกงาน: {e.job.job_code}</div>}
                    {canWrite && (
                      <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                        <button onClick={() => onPatch(e.id, { bucket: otherBucket })}
                          className={`focusable pressable text-[13px] px-2.5 py-1.5 rounded-md min-h-[36px] ${btnPlain}`}>
                          ย้ายไป{otherBucket === "after_jr" ? "รอต่อหลัง JR" : "มัดจำ รอลงคิว"}
                        </button>
                        <button onClick={() => onDelete(e.id)} aria-label="ลบคิว"
                          className={`focusable pressable inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-md min-h-[36px] ${btnDanger}`}>
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
                      className={`focusable pressable shrink-0 px-3 rounded-lg text-[13px] font-semibold disabled:opacity-50 min-h-[40px] ${btnPrimary}`}>
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

function AddQueueModal({ onClose, onSaved }: { onClose: () => void; onSaved: (newId?: string) => void }) {
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
      const r = await api.post<{ id: string }>("/floor-queue", {
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
      onSaved(r.data?.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  const tabCls = (on: boolean) =>
    `flex-1 px-3 py-2 rounded-lg text-[14px] font-medium min-h-[40px] ${on ? "bg-white text-[#1F4E78] shadow-sm border border-slate-200" : "text-slate-700"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl p-5 shadow-xl border border-slate-200 fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[17px] text-slate-900 flex items-center gap-2"><Icon name="plus" size={16} /> เพิ่มคิวงานพื้น</h3>
          <button onClick={onClose} aria-label="ปิด" className="text-slate-500 hover:text-slate-900"><Icon name="close" size={18} /></button>
        </div>

        {/* เลือกโหมด: งาน JR / พิมพ์เอง */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200 mb-3">
          <button onClick={() => setMode("manual")} className={tabCls(mode === "manual")}>
            พิมพ์ชื่อลูกค้าเอง
          </button>
          <button onClick={() => setMode("job")} className={tabCls(mode === "job")}>
            ค้นหางาน JR
          </button>
        </div>

        {mode === "manual" ? (
          <label className="block mb-3">
            <span className={labelCls}>ชื่อลูกค้า</span>
            <GrowText value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="เช่น กนกวรรณ(ลพบุรี)"
              className={fieldCls} aria-label="ชื่อลูกค้า" />
          </label>
        ) : (
          <div className="mb-3">
            <span className={labelCls}>ค้นหางาน (ชื่อ/รหัสงาน)</span>
            {pickedJob ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-300">
                <span className="text-[15px] text-slate-900">{pickedJob.job_code ?? "—"} · {pickedJob.customer_name}</span>
                <button onClick={() => { setPickedJob(null); setQ(""); }} aria-label="เลือกงานใหม่" className="text-slate-500 hover:text-slate-900"><Icon name="close" size={14} /></button>
              </div>
            ) : (
              <>
                <input value={q} onChange={(e) => search(e.target.value)} placeholder="พิมพ์ชื่อลูกค้าหรือรหัสงาน…"
                  className={fieldCls} aria-label="ค้นหางาน" />
                {searching && <div className="text-[13px] text-slate-600 mt-1">กำลังค้นหา…</div>}
                {hits.length > 0 && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-300 bg-white">
                    {hits.map((h) => (
                      <button key={h.id} onClick={() => setPickedJob(h)}
                        className="w-full text-left px-3 py-2 text-[14px] text-slate-900 hover:bg-[#E6EEF5] border-b border-slate-200 last:border-0">
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
          <span className={labelCls}>รายละเอียดงาน (ถ้ามี)</span>
          <input list="work-types" value={workDesc} onChange={(e) => setWorkDesc(e.target.value)} placeholder="เลือกจากรายการ หรือพิมพ์เอง เช่น เริ่มงาน, ต่องานฝ้า,ไฟ"
            className={fieldCls} aria-label="รายละเอียดงาน" />
        </label>

        <label className="block mb-3">
          <span className={labelCls}>ถัง / สถานะคิว</span>
          <select value={bucket} onChange={(e) => setBucket(e.target.value as FloorQueueBucket)} className={selectCls} aria-label="ถัง">
            <option value="scheduled">ลงคิว (มีวันที่)</option>
            <option value="after_jr">รอต่อหลัง JR เสร็จ</option>
            <option value="deposit_wait">มัดจำแล้ว รอลงคิว</option>
          </select>
        </label>

        {bucket === "scheduled" ? (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="block">
              <span className={labelCls}>วันที่</span>
              <DateField value={date} onChange={setDate} className={fieldCls} aria-label="วันที่ลงคิว" />
            </label>
            <label className="block">
              <span className={labelCls}>เวลา</span>
              <input type="time" step={60} value={time} onChange={(e) => setTime(e.target.value.slice(0, 5))}
                className={`${fieldCls} tnum`} aria-label="เวลา" />
            </label>
            <div className="block col-span-2">
              <span className={labelCls}>ชนิด</span>
              <KindButtons value={kind} onPick={setKind} assessLabel="ประเมิน/คุย" />
            </div>
            <label className="block col-span-2">
              <span className={labelCls}>ระยะเวลาทำงาน (ถ้ามี)</span>
              <GrowText value={durationNote} onChange={(e) => setDurationNote(e.target.value)} placeholder="เช่น ทำ3วัน"
                className={fieldCls} aria-label="ระยะเวลาทำงาน" />
            </label>
          </div>
        ) : (
          <label className="block mb-3">
            <span className={labelCls}>โน้ตเสริม (ถ้ามี)</span>
            <GrowText value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="เช่น รอลูกค้าคอนเฟิร์มทำงาน"
              className={fieldCls} aria-label="โน้ตเสริม" />
          </label>
        )}

        {err && <p role="alert" className="mb-3 text-[14px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-2">
          <button onClick={save} disabled={busy}
            className={`focusable pressable flex-1 rounded-xl py-2.5 text-[15px] font-semibold disabled:opacity-60 min-h-[48px] ${btnPrimary}`}>
            {busy ? "กำลังบันทึก…" : "เพิ่มคิว"}
          </button>
          <button onClick={onClose} disabled={busy}
            className={`focusable pressable rounded-xl px-5 py-2.5 text-[15px] min-h-[48px] ${btnPlain}`}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}
