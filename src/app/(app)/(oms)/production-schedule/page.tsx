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

export type ProdSet = {
  id: number; set_label: string; seq: number;
  design_received: string; frame_done: string; glass_installed: string;
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
  due_date: string | null;       // วันกำหนดผลิตเสร็จ = หัววัน/เรียงในตาราง
  install_date: string | null;
  producer_note: string | null;
  status: string;
  sets?: ProdSet[];
};

const today = () => new Date().toISOString().slice(0, 10);
const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
// ISO → "จ. 28/07/2026" (ค.ศ. เต็ม)
export function thHead(d: string | null) {
  if (!d) return "ยังไม่กำหนดวันเสร็จ";
  const dt = new Date(d + "T00:00:00");
  const [y, m, day] = d.split("-");
  return `${WD[dt.getDay()]}. ${day}/${m}/${y}`;
}
const thShort = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ── ค่ามาตรฐาน (ตรงกับ ProductionSetsSection / Excel) ──
const V_DESIGN_DONE = "ได้รับแบบ";
const V_DESIGN_UNDONE = "ยังไม่ได้รับแบบ";
const V_FRAME_DONE = "ผลิตเสร็จ";
const V_GLASS_DONE = "ใส่แล้ว";
const V_GLASS_UNDONE = "ยังไม่ใส่";
const V_QC_PASS = "ผ่าน";
const V_SCREEN_DONE = "ใส่แล้ว"; // ตรง SCREEN_INST ฝั่งออฟฟิศ (แยก constant กันพังเงียบ)

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

// สไตล์ iOS — พื้นสว่าง การ์ดขาว ตัวเข้ม สีน้อยแต่คม
export const IOS = {
  page: "#f2f2f7", card: "#ffffff", inset: "#f4f4f7",
  ink: "#1c1c1e", ink2: "#636366", ink3: "#a1a1a8", line: "#e5e5ea",
  blue: "#007aff", green: "#34c759", red: "#ff3b30", orange: "#ff9500",
};
// สีประจำวันแบบไทย — dot=จุดสด · deep=ตัวอักษรบนพื้นขาว
export const DAY_COLOR = [
  { dot: "#ff453a", deep: "#c0392b" }, // อาทิตย์ แดง
  { dot: "#ffcc00", deep: "#b7791f" }, // จันทร์ เหลือง
  { dot: "#ff2d92", deep: "#be3d8a" }, // อังคาร ชมพู
  { dot: "#34c759", deep: "#1a7d4f" }, // พุธ เขียว
  { dot: "#ff9500", deep: "#c2410c" }, // พฤหัสบดี ส้ม
  { dot: "#0a84ff", deep: "#0369a1" }, // ศุกร์ ฟ้า
  { dot: "#bf5af2", deep: "#7e3ba3" }, // เสาร์ ม่วง
];
export const dayColorOf = (dateKey: string) =>
  (!dateKey || dateKey === "zzz") ? null : DAY_COLOR[new Date(dateKey + "T00:00:00").getDay()];

export default function ProductionSchedulePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["production-schedule"],
    queryFn: () => api.get<SchedRow[]>("/production-schedule"),
  });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const isChang = (data?.meta?.role as string) === "CHANG"; // ช่างผลิต — ไม่มีโหมดออฟฟิศ/ปุ่มเพิ่ม
  // โหมดดู: "chang" = ช่างเช็คลิสต์ (ค่าเริ่มต้น ซ่อนปุ่มออฟฟิศ) · "office" = จัดการเต็ม
  const [mode, setMode] = useState<"chang" | "office">("chang");
  const officeMode = canWrite && !isChang && mode === "office";
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
      const key = r.due_date ?? "zzz";       // จัดกลุ่มตามวันกำหนดเสร็จ (เดดไลน์) ด่วนสุดก่อน
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, producerFilter]);

  // นับชุดที่ผลิตเสร็จแล้วแต่ยังรอ QC ตรวจก่อนใส่กระจก (แจ้งเตือนเด่นๆ บนสุด)
  const waitQcCount = useMemo(
    () => rows.reduce((n, r) => n + (r.sets ?? []).filter(
      (s) => s.frame_done === "ผลิตเสร็จ" && s.qc_before_glass !== "ผ่าน" && s.glass_installed !== "ใส่แล้ว"
    ).length, 0),
    [rows]
  );

  const v = (r: SchedRow, k: keyof SchedRow) => (draft[r.id]?.[k] ?? r[k] ?? "") as string;

  // ── มาร์คเช็คลิสต์ช่าง (เขียนลง production_sets ช่องเดียว — ออฟฟิศเห็นทันที) ──
  const [savingSetIds, setSavingSetIds] = useState<Set<number>>(new Set());
  const markSet = async (setId: number, patch: Record<string, string | null>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setSavingSetIds((p) => new Set(p).add(setId));
    try {
      await api.patch(`/production-sets/${setId}`, patch);
      await refetch();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ — เช็คเน็ตแล้วลองอีกครั้ง");
    } finally {
      setSavingSetIds((p) => { const n = new Set(p); n.delete(setId); return n; });
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

  // ทุกชุดพร้อมส่งติดตั้ง = QC หลังใส่กระจก "ผ่าน" + ใส่มุ้งครบ (ชุดที่มีมุ้ง) ทุกชุด
  const allSetsReady = (r: SchedRow) =>
    !!r.sets && r.sets.length > 0 &&
    r.sets.every((s) => s.qc_after_glass === "ผ่าน" && (!s.screen_type?.trim() || s.screen_installed === "ใส่แล้ว"));

  // ปุ่มเลื่อนสถานะสำหรับงานในระบบ (kind==='job') — QC ทำในเช็คลิสต์การ์ด ไม่มีเฟส รอ QC แยก
  const JOB_NEXT: Record<string, { label: string; nextStatus: string; confirmMsg: (title: string) => string }> = {
    QUEUED:        { label: "เริ่มผลิต",  nextStatus: "MANUFACTURING", confirmMsg: (t) => `เริ่มผลิต "${t}" ใช่ไหม?` },
    MANUFACTURING: { label: "ส่งติดตั้ง", nextStatus: "READY",         confirmMsg: (t) => `ส่ง "${t}" เข้าติดตั้ง (QC ผ่านครบทุกชุดแล้ว) ใช่ไหม?` },
    QC:            { label: "ส่งติดตั้ง", nextStatus: "READY",         confirmMsg: (t) => `ส่ง "${t}" เข้าติดตั้ง ใช่ไหม?` },
  };

  const advanceJobStatus = async (r: SchedRow) => {
    const cfg = JOB_NEXT[r.status];
    if (!cfg) return;
    // เริ่มผลิต (ช่าง): ต้องมีวันกำหนดเสร็จ + วันติดตั้งก่อน (ออฟฟิศกรอกในหน้า "ผลิต")
    if (cfg.nextStatus === "MANUFACTURING" && (!r.due_date || !r.install_date)) {
      const miss = [!r.due_date && "วันกำหนดเสร็จ", !r.install_date && "วันติดตั้ง"].filter(Boolean).join(" + ");
      alert(`ยังเริ่มผลิตไม่ได้ — ออฟฟิศต้องกรอก ${miss} ก่อน (เปิดงานนี้ในหน้า "ผลิต")`);
      return;
    }
    // ส่งติดตั้ง: ต้อง QC หลังใส่กระจก "ผ่าน" + ใส่มุ้งครบ ทุกชุดก่อน
    if (cfg.nextStatus === "READY" && !allSetsReady(r)) {
      alert(`ยังส่งติดตั้งไม่ได้ — ทุกชุดต้อง QC หลังใส่กระจก "ผ่าน" และใส่มุ้งครบก่อน`);
      return;
    }
    if (!confirm(cfg.confirmMsg(r.title))) return;
    setSavingId(r.id);
    try {
      const body: Record<string, string> = { status: cfg.nextStatus };
      if (cfg.nextStatus === "READY") {
        // QC ทำในเช็คลิสต์แล้ว — บันทึกผลรวม + วันที่เพื่อ audit/รายงาน
        body.qc_result = "PASSED";
        body.qc_date = today();
        body.production_done = today();
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

  const dateCls = "rounded-lg px-2 py-1.5 text-[13px] outline-none min-h-[40px] border border-[#e5e5ea] bg-white text-[#1c1c1e] disabled:opacity-50";
  const txtCls = "rounded-lg px-2.5 py-1.5 text-[13px] outline-none min-h-[40px] border border-[#e5e5ea] bg-white text-[#1c1c1e] placeholder-[#a1a1a8] disabled:opacity-50";

  // datalist id
  const DATALIST_ID = "producers-list";

  return (
    <div className="p-4 sm:p-6 fade-in rounded-2xl" style={{ background: IOS.page, minHeight: "calc(100vh - 24px)", color: IOS.ink }}>
      {/* ── หัว: title + filter ช่าง + ปุ่มเพิ่ม ── */}
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2 mr-auto" style={{ color: IOS.ink, letterSpacing: "-.01em" }}><CalendarDays size={22} /> ตารางผลิต</h1>

        {/* สลับโหมด ช่าง/ออฟฟิศ — segmented control แบบ iOS (ช่างผลิตไม่เห็น) */}
        {canWrite && !isChang && (
          <div className="flex gap-0.5 rounded-[10px] p-0.5" style={{ background: "#e9e9ee" }}>
            {([["chang", "ช่าง"], ["office", "ออฟฟิศ"]] as const).map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)}
                className="focusable px-4 py-1.5 rounded-lg text-[13px] font-semibold min-h-[34px] transition"
                style={mode === m ? { background: "#fff", color: IOS.ink, boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : { color: IOS.ink2 }}>{l}</button>
            ))}
          </div>
        )}

        {/* filter ช่าง */}
        <select
          value={producerFilter}
          onChange={(e) => setProducerFilter(e.target.value)}
          className="rounded-[10px] px-3 py-1.5 text-[13px] outline-none min-h-[34px] appearance-none border"
          style={{ background: "#fff", color: IOS.ink, borderColor: IOS.line }}
          aria-label="กรองตามช่างผลิต"
        >
          <option value="">ช่างทั้งหมด</option>
          {producerList.map((name) => (<option key={name} value={name}>{name}</option>))}
        </select>

        {canWrite && !isChang && (
          <button onClick={() => setAddOpen(true)} className="focusable inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold min-h-[34px] text-white" style={{ background: IOS.blue }}>
            <Plus size={16} /> เพิ่มงาน
          </button>
        )}
      </div>
      <p className="text-[13px] mb-3" style={{ color: IOS.ink2 }}>ตารางงานสำหรับช่าง · แตะปุ่มเพื่ออัปเดตงาน · จุดสี = สีประจำวัน</p>

      {/* คีย์สีประจำวันไทย */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5 text-[11px]">
        {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 font-medium" style={{ color: DAY_COLOR[i].deep }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: DAY_COLOR[i].dot }} />{d}
          </span>
        ))}
      </div>

      {/* 🔔 แจ้งเตือนรวม: ชุดที่ผลิตเสร็จแล้วรอ QC ตรวจก่อนใส่กระจก */}
      {waitQcCount > 0 && (
        <div className="rounded-xl px-4 py-3 mb-4 font-bold text-[15px] flex items-center gap-2"
          style={{ background: "#fff0e0", color: "#c2410c", border: "2px solid #ff9500" }}>
          🔔 มี {waitQcCount} ชุด <span style={{ textDecoration: "underline" }}>รอ QC ตรวจก่อนใส่กระจก</span>
        </div>
      )}

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
            groups.map(([dateKey, items]) => {
              const dc = dayColorOf(dateKey);
              const isToday = dateKey === today();
              return (
              <div key={dateKey}>
                {/* หัวข้อวัน — iOS section header (จุดสีวัน + วันที่) */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  {dc && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dc.dot }} />}
                  <span className="text-[11px] font-semibold" style={{ color: IOS.ink3 }}>กำหนดเสร็จ</span>
                  <span className="text-[15px] font-bold" style={{ color: dc ? dc.deep : IOS.ink }}>{thHead(dateKey === "zzz" ? null : dateKey)}</span>
                  {isToday && <span className="text-[10px] rounded-full px-2 py-0.5 font-bold text-white" style={{ background: IOS.green }}>วันนี้</span>}
                  <span className="ml-auto text-[12px] tnum font-medium" style={{ color: IOS.ink3 }}>{items.length} งาน</span>
                </div>
                <div className="space-y-2.5">
                  {items.map((r) => (
                    <div key={r.id} className="rounded-[18px] p-4 space-y-3"
                      style={{ background: IOS.card, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 6px 16px rgba(0,0,0,.04)" }}>
                      <div className={officeMode ? "grid grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.2fr_1fr_auto] gap-2 lg:items-center" : ""}>
                      {/* งาน/ลูกค้า */}
                      <div className="col-span-2 lg:col-span-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[16px] truncate" style={{ color: IOS.ink, letterSpacing: "-.01em" }}>{r.title}</span>
                          {r.kind === "job" ? (
                            <span className="text-[10px] tnum rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "#eaf3ff", color: IOS.blue }}>{r.job_code}</span>
                          ) : (
                            <span className="text-[10px] rounded-md px-1.5 py-0.5 font-semibold" style={{ background: "#fff3e0", color: IOS.orange }}>จดเอง</span>
                          )}
                          {r.kind === "job" && officeMode && (
                            <a href={`/production/${r.id}/print`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                              aria-label={`พิมพ์ใบงาน ${r.job_code ?? r.title}`}
                              className="focusable inline-flex items-center gap-1 text-[11px] rounded-lg px-2 py-1 min-h-[28px]" style={{ background: IOS.inset, color: IOS.ink2 }}>
                              <Printer size={12} /> ใบงาน
                            </a>
                          )}
                        </div>
                        {(r.customer_area || r.subtitle) && (
                          <div className="text-[12.5px] truncate mt-0.5" style={{ color: IOS.ink2 }}>📍 {r.customer_area || r.subtitle}</div>
                        )}
                        {!officeMode && r.install_date && (
                          <div className="text-[12px] tnum mt-0.5" style={{ color: IOS.ink2 }}>🔧 ติดตั้ง {thShort(r.install_date)}</div>
                        )}
                      </div>

                      {/* โหมดช่าง: เริ่มผลิต (QUEUED) / ส่งติดตั้ง (MANUFACTURING/QC เมื่อ QC ครบ) — กดเอง */}
                      {!officeMode && r.kind === "job" && canWrite && JOB_NEXT[r.status] && (() => {
                        const isStart = r.status === "QUEUED";
                        const blocked = isStart ? (!r.due_date || !r.install_date) : !allSetsReady(r);
                        const warn = isStart
                          ? `⏳ รอออฟฟิศกรอก${!r.due_date ? " วันกำหนดเสร็จ" : ""}${(!r.due_date && !r.install_date) ? " +" : ""}${!r.install_date ? " วันติดตั้ง" : ""} ก่อนเริ่มผลิต`
                          : "⏳ ต้อง QC หลังใส่กระจก “ผ่าน” + ใส่มุ้งครบทุกชุดก่อนส่งติดตั้ง";
                        return (
                          <div className="mt-1">
                            {blocked && (
                              <div className="text-[11.5px] rounded-lg px-2.5 py-1.5 mb-1" style={{ background: "#fff4e0", color: "#b45309", border: "1px solid #fde0b0" }}>{warn}</div>
                            )}
                            <button onClick={() => advanceJobStatus(r)} disabled={savingId === r.id}
                              className="focusable pressable w-full inline-flex items-center justify-center gap-1.5 rounded-xl text-white text-[14px] font-bold min-h-[48px] disabled:opacity-50"
                              style={{ background: blocked ? "#c7c7cc" : (isStart ? IOS.orange : IOS.green) }}>
                              {savingId === r.id ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : (isStart ? "▶ " : "📦 ")}
                              {JOB_NEXT[r.status].label}
                            </button>
                          </div>
                        );
                      })()}

                      {officeMode && (<>
                      {/* วันผลิต */}
                      <label className="block">
                        <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: IOS.ink2 }}>วันผลิต</span>
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
                        <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: IOS.ink2 }}>ช่างผลิต</span>
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
                        <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 self-start" style={{ background: IOS.inset, color: IOS.ink2 }}>{r.kind === "job" ? PROD_STATUS[r.status as ProdStatus] : "งานจดเอง"}</span>
                        {r.install_date && <span className="text-[11px] tnum" style={{ color: IOS.ink3 }}>ติดตั้ง {thShort(r.install_date)}</span>}
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
                          <span className="text-[11px]" style={{ color: IOS.ink3 }}>
                            {r.status === "READY" ? "พร้อมติดตั้งแล้ว" : "จัดการที่หน้า \"ผลิต\""}
                          </span>
                        )}
                      </div>
                      </>)}
                      </div>
                      {r.kind === "job" && r.sets && r.sets.length > 0 && (
                        <ChangChecklist sets={r.sets} savingSetIds={savingSetIds} mark={markSet} canMark={canWrite} />
                      )}
                      {r.kind === "job" && r.job_id && (!r.sets || r.sets.length === 0) && (
                        <p className="text-[12px] rounded-xl px-3 py-2" style={{ background: "#fff4e0", color: "#b45309", border: "1px solid #fde0b0" }}>⚠️ ยังไม่มีชุดงาน — ออฟฟิศลงรายละเอียดที่หน้า “ผลิต” (คลิกงานนี้) ก่อน ช่างถึงจะเห็นเช็คลิสต์</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {addOpen && <AddModal producerList={producerList} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refetch(); }} />}
    </div>
  );
}

// ════════ เช็คลิสต์ชุดงานสำหรับช่าง (มือถือ) ════════
export function ChangChecklist({ sets, savingSetIds, mark, canMark }: {
  sets: ProdSet[];
  savingSetIds: Set<number>;
  mark: (setId: number, patch: Record<string, string | null>, confirmMsg?: string) => void;
  canMark: boolean;
}) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-2.5">
      {sets.map((s) => <SetCard key={s.id} s={s} saving={savingSetIds.has(s.id)} mark={mark} canMark={canMark} />)}
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
  const dlTone: Record<string, { bg: string; fg: string }> = {
    over: { bg: "#ffe5e5", fg: "#ff3b30" },
    today: { bg: "#e3f8ea", fg: "#1a8f3c" },
    soon: { bg: "#fff1dd", fg: "#c2410c" },
    normal: { bg: "#eceef2", fg: "#636366" },
    none: { bg: "#eceef2", fg: "#a1a1a8" },
    done: { bg: "#e3f8ea", fg: "#1a8f3c" },
  };
  const hasScreen = !!(s.screen_type && s.screen_type.trim());
  const screenNotInstalled = hasScreen && s.screen_installed !== V_SCREEN_DONE;

  const designDone = s.design_received === V_DESIGN_DONE;
  const frameDone = s.frame_done === V_FRAME_DONE;
  const glassDone = s.glass_installed === V_GLASS_DONE;
  const screenDone = s.screen_installed === V_SCREEN_DONE;
  const qcBefore = s.qc_before_glass === V_QC_PASS;
  const qcAfter = s.qc_after_glass === V_QC_PASS;
  const qcDone = qcBefore && qcAfter;
  // เฟรมผลิตเสร็จแล้ว แต่ QC ก่อนใส่กระจกยังไม่ตรวจ + ยังไม่ใส่กระจก → เตือน QC เด่นๆ
  const waitQcBefore = frameDone && !qcBefore && !glassDone;
  const tone = dlTone[dl.tone];

  return (
    <div className="rounded-2xl p-3.5" style={{ background: IOS.inset, opacity: done ? 0.6 : 1 }}>
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className="font-bold text-[16px]" style={{ color: IOS.ink }}>{s.set_label || "ชุดงาน"}</span>
        <span className="text-[12.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: tone.bg, color: tone.fg }}>
          {dl.tone === "over" && "🔴 "}{dl.tone === "soon" && "⚠️ "}{dl.text}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 text-[12.5px]">
        {s.must_finish_date && <span className="tnum font-medium" style={{ color: IOS.ink }}>⏰ ต้องเสร็จ {thShort(s.must_finish_date)}</span>}
        {s.install_date && <span className="tnum" style={{ color: IOS.ink2 }}>🔧 ติดตั้ง {thShort(s.install_date)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {hasScreen ? (
          <>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold rounded-full px-2.5 py-0.5" style={{ background: "#e6f3ff", color: IOS.blue }}>🪟 {s.screen_type}</span>
            {screenNotInstalled && <span className="text-[12px] font-bold rounded-full px-2.5 py-0.5" style={{ background: "#fff0e0", color: IOS.orange }}>⚠️ ยังไม่ใส่มุ้ง</span>}
          </>
        ) : (
          <span className="text-[11px]" style={{ color: IOS.ink3 }}>ไม่มีมุ้ง</span>
        )}
        {s.glass_spec && <span className="text-[12px] truncate max-w-[55%]" style={{ color: IOS.ink2 }}>🟦 {s.glass_spec}</span>}
      </div>

      {canMark ? (
        <div className="space-y-2">
          {/* แถวช่าง: ได้แบบ / ผลิตเสร็จ / ใส่กระจก / ใส่มุ้ง */}
          <div className="grid grid-cols-2 gap-1.5">
            <MarkBtn label={designDone ? "ได้แบบแล้ว" : "ได้แบบ"} done={designDone} saving={saving}
              onClick={() => designDone
                ? mark(s.id, { design_received: V_DESIGN_UNDONE }, "ยกเลิก “ได้แบบแล้ว” ?")
                : mark(s.id, { design_received: V_DESIGN_DONE })} />
            <MarkBtn label={frameDone ? "ผลิตเสร็จแล้ว" : "ผลิตเสร็จ"} done={frameDone} saving={saving}
              onClick={() => frameDone
                ? mark(s.id, { frame_done: "" }, "ยกเลิก “ผลิตเสร็จ” ?")
                : mark(s.id, { frame_done: V_FRAME_DONE })} />
            <MarkBtn label={glassDone ? "ใส่กระจกแล้ว" : "ใส่กระจก"} done={glassDone} saving={saving}
              onClick={() => glassDone
                ? mark(s.id, { glass_installed: V_GLASS_UNDONE }, "ยกเลิก “ใส่กระจกแล้ว” ?")
                : mark(s.id, { glass_installed: V_GLASS_DONE })} />
            {hasScreen && (
              <MarkBtn label={screenDone ? "ใส่มุ้งแล้ว" : "ใส่มุ้ง"} done={screenDone} saving={saving}
                onClick={() => screenDone
                  ? mark(s.id, { screen_installed: "ยังไม่ใส่" }, "ยกเลิก “ใส่มุ้งแล้ว” ?")
                  : mark(s.id, { screen_installed: V_SCREEN_DONE })} />
            )}
          </div>
          {/* 🔔 เตือน QC เด่นๆ เมื่อผลิตเสร็จแต่ยังไม่ตรวจก่อนใส่กระจก */}
          {waitQcBefore && (
            <div className="rounded-xl px-3 py-2.5 text-[13.5px] font-bold flex items-center gap-2 qc-alert"
              style={{ background: "#fff0e0", color: "#c2410c", border: "2px solid #ff9500" }}>
              🔔 ผลิตเสร็จแล้ว — QC ต้องมาตรวจ <u>ก่อนใส่กระจก</u>!
            </div>
          )}
          {/* QC: คนตรวจกดตรงนี้ — ก่อน/หลังใส่กระจก ผ่าน/ไม่ผ่าน */}
          <div className="rounded-xl p-2.5 space-y-1.5" style={{ background: "#fff", border: waitQcBefore ? "2px solid #ff9500" : `1px solid ${IOS.line}` }}>
            <div className="text-[11px] font-bold" style={{ color: IOS.ink3 }}>✓ QC (คนตรวจกดตรงนี้)</div>
            <QcRow label="ก่อนใส่กระจก" value={s.qc_before_glass} saving={saving} onSet={(v) => mark(s.id, { qc_before_glass: v })} />
            <QcRow label="หลังใส่กระจก" value={s.qc_after_glass} saving={saving} onSet={(v) => mark(s.id, { qc_after_glass: v })} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <StatusPill ok={designDone} label="แบบ" />
          <StatusPill ok={glassDone} label="กระจก" />
          {hasScreen && <StatusPill ok={screenDone} label="มุ้ง" />}
          <StatusPill ok={qcBefore} label="QCก่อน" />
          <StatusPill ok={qcAfter} label="QCหลัง" />
        </div>
      )}

      <button onClick={() => setShowMore((x) => !x)} className="focusable pressable mt-2 text-[12px] font-medium min-h-[32px]" style={{ color: IOS.blue }}>
        {showMore ? "ซ่อนรายละเอียด" : "ดูรายละเอียดทั้งหมด"}
      </button>
      {showMore && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
          <RoRow label="คนวัด" v={s.measurer_name} />
          <RoRow label="วันวัด" v={s.measure_actual ? thShort(s.measure_actual) : ""} />
          <RoRow label="โครง/โรงงาน" v={s.frame_status} />
          <RoRow label="สั่งกระจก" v={s.glass_order} />
          <RoRow label="อุปกรณ์" v={s.mat_equipment} />
          <RoRow label="อลู ปกติ" v={s.mat_alu_normal} />
          <RoRow label="อลู อบสี" v={s.mat_alu_painted} />
          <RoRow label="ใส่กระจกเสร็จ" v={s.glass_done_date ? thShort(s.glass_done_date) : ""} />
          <RoRow label="เสร็จจริง" v={s.actual_done_date ? thShort(s.actual_done_date) : ""} />
          {s.note && <div className="col-span-2"><RoRow label="หมายเหตุ" v={s.note} /></div>}
        </div>
      )}
    </div>
  );
}

function MarkBtn({ label, done, half, saving, sub, onClick }: { label: string; done: boolean; half?: boolean; saving: boolean; sub?: ReactNode; onClick: () => void }) {
  const st = done
    ? { background: "#34c759", color: "#fff", border: "none" }
    : half
    ? { background: "#ff9500", color: "#fff", border: "none" }
    : { background: "#fff", color: "#1c1c1e", border: "1px solid #d9d9df" };
  return (
    <button onClick={onClick} disabled={saving}
      className="focusable pressable rounded-2xl min-h-[58px] px-1 flex flex-col items-center justify-center gap-0.5 text-[12.5px] font-semibold disabled:opacity-60 transition active:scale-[.97]"
      style={st}>
      {saving ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
        : <>{done && <Check size={16} />}<span className="leading-tight text-center">{label}</span>{sub}</>}
    </button>
  );
}

// แถว QC: ผ่าน(เขียว)/ไม่ผ่าน(แดง=รอแก้ ตรวจใหม่) — กดซ้ำตัวที่เลือก = ยกเลิก
function QcRow({ label, value, saving, onSet }: { label: string; value: string; saving: boolean; onSet: (v: string) => void }) {
  const pass = value === "ผ่าน";
  const fail = value === "ไม่ผ่าน";
  const btn = (active: boolean, color: string) => active
    ? { background: color, color: "#fff", border: "none" }
    : { background: "#fff", color: "#636366", border: "1px solid #d9d9df" };
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex-1 text-[12.5px] font-medium" style={{ color: "#1c1c1e" }}>
        {label}
        {fail && <span className="ml-1 font-bold" style={{ color: "#ff3b30" }}>· รอแก้ ตรวจใหม่</span>}
      </span>
      <button type="button" disabled={saving} onClick={() => onSet(pass ? "" : "ผ่าน")}
        className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold disabled:opacity-50 active:scale-[.97]" style={btn(pass, "#34c759")}>ผ่าน</button>
      <button type="button" disabled={saving} onClick={() => onSet(fail ? "" : "ไม่ผ่าน")}
        className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold disabled:opacity-50 active:scale-[.97]" style={btn(fail, "#ff3b30")}>ไม่ผ่าน</button>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={ok ? { background: "#e3f8ea", color: "#1a8f3c" } : { background: "#eceef2", color: "#a1a1a8" }}>
      {ok ? <Check size={12} /> : "○"} {label}
    </span>
  );
}

function RoRow({ label, v }: { label: string; v: string }) {
  return <div><span style={{ color: "#a1a1a8" }}>{label}: </span><span style={{ color: "#1c1c1e" }}>{v || "—"}</span></div>;
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
        if (!pdate) { setErr("กรุณากรอกวันกำหนดเสร็จ"); setSaving(false); return; }
        // ส่งเข้า "รอลงผลิต" (QUEUED) พร้อมวันกำหนดเสร็จ → โผล่ในตารางช่างถูกกลุ่ม + ช่างเริ่มผลิตได้
        await api.patch(`/production/${pickId}`, { status: "QUEUED", production_due_date: pdate, ...(idate ? { planned_install_date: idate } : {}) });
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
                <div><label className="block text-[13px] mb-1 text-white">วันกำหนดเสร็จ *</label>
                  <DateField value={pdate} onChange={(iso) => setPdate(iso)} className={dinp} aria-label="วันกำหนดเสร็จ" /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง</label>
                  <DateField value={idate} onChange={(iso) => setIdate(iso)} className={dinp} aria-label="วันติดตั้ง" /></div>
              </div>
              <p className="text-[12px]" style={{ color: "var(--t-low)" }}>เลือกแล้วงานจะเข้าสถานะ "รอลงผลิต" + ใส่วันกำหนดเสร็จให้ · ช่างกดเริ่มผลิตเองในตาราง</p>
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
