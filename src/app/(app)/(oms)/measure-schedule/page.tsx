"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";
import { thDate } from "@/lib/format";

// ── types ────────────────────────────────────────────────────────────────────

type MeasureEntry = {
  production_id: string;
  job_id: string;
  job_code: string | null;
  customer_name: string | null;
  customer_area: string | null;
  customer_tel: string | null;
  location_url: string | null;   // ลิงก์แผนที่ (จากคิวประเมิน) — ไว้ก๊อปส่งช่างวัด
  measure_scheduled: string | null;
  measure_time: string | null;
  measure_actual: string | null;
  measure_actual_time: string | null;
  measured_by_name: string | null;
  measurer_name: string | null;
  measurer_id: string | null;
  status: "PENDING_MEASURE" | "MEASURED";
  is_overdue: boolean;
};

type ApiData = {
  scheduled: MeasureEntry[];
  unscheduled: MeasureEntry[];
  measured: MeasureEntry[];
  today: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thaiDateFull(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `${TH_DOW[dow]} ${d} ${TH_MON[m]} ${y}`;
  } catch {
    return iso;
  }
}

function dayLabel(iso: string, today: string): { label: string; extra: string; isToday: boolean; isTomorrow: boolean; isOverdue: boolean } {
  const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().slice(0, 10);
  const isToday = iso === today;
  const isTomorrow = iso === tomorrow;
  const isOverdue = iso < today;
  let extra = "";
  if (isToday) extra = "วันนี้";
  else if (isTomorrow) extra = "พรุ่งนี้";
  else if (isOverdue) extra = "เลยกำหนด";
  return { label: thaiDateFull(iso), extra, isToday, isTomorrow, isOverdue };
}

/** แปลง "9.30"→"09:30", "10.00"→"10:00", "09:30"→"09:30" กัน import จุดทำโชว์เพี้ยน */
function fmtTime(t: string | null): string {
  if (!t) return "—";
  const s = t.trim().replace(".", ":");
  const [h, m] = s.split(":");
  if (!h) return "—";
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

// ── คัดลอกข้อมูลลูกค้าเป็นฟอร์ม (ส่งช่างวัดทาง Line) ──────────────────────────
// ดึง ชื่อ/เบอร์/ที่อยู่หน้างาน/ลิงก์แผนที่ ที่ระบบเก็บไว้ → จัดฟอร์มก๊อปได้ทันที
function buildContactCopy(e: MeasureEntry): string {
  const lines: string[] = [];
  if (e.measure_scheduled) {
    const t = e.measure_time ? ` ${fmtTime(e.measure_time)} น.` : "";
    lines.push(`📅 นัดวัด ${thaiDateFull(e.measure_scheduled)}${t}`);
  }
  lines.push(`👤 ${e.customer_name ?? "—"}`);
  if (e.customer_tel) lines.push(`📞 ${e.customer_tel}`);
  if (e.customer_area) lines.push(`📍 ${e.customer_area}`);
  if (e.location_url) lines.push(`🗺️ ${e.location_url}`);
  if (e.job_code) lines.push(`(${e.job_code})`);
  return lines.join("\n");
}

// ฟอร์มคัดลอกทั้งวัน/ทั้งช่าง (เลียนแบบก๊อปคิวเซลล์หน้าคิวประเมิน — buildSalesDayCopy)
function buildMeasureDayCopy(date: string, measurerName: string, entries: MeasureEntry[]): string {
  const head = `คิววัดงาน ${thaiDateFull(date)} (${measurerName})`;
  const blocks = entries
    .slice()
    .sort((a, b) => (a.measure_time ?? "99").localeCompare(b.measure_time ?? "99"))
    .map((e) => [
      `${e.measure_time ? fmtTime(e.measure_time) : "-"} น. วัดงาน ${e.customer_name ?? "-"}`,
      "",
      `${e.customer_name ?? "-"} ${e.customer_tel?.trim() || "-"}`,
      e.customer_area?.trim() || "-",
      "",
      e.location_url?.trim() || "-",
    ].join("\n"));
  return head + "\n\n" + blocks.join("\n\n\n");
}

/** ปุ่มคัดลอกทั้งช่าง/ทั้งวัน (grouped) — ใช้ที่หัววัน (list) + เซลล์ปฏิทิน (compact) */
function CopyGroupButton({ date, measurerName, entries, compact = false }: { date: string; measurerName: string; entries: MeasureEntry[]; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (ev: React.MouseEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(buildMeasureDayCopy(date, measurerName, entries));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { alert("คัดลอกไม่สำเร็จ ลองใหม่"); }
  };
  return (
    <button onClick={onCopy} title={`คัดลอกคิววัดงาน ${measurerName} (${entries.length} นัด) ไว้ส่ง Line`}
      className={compact
        ? "focusable pressable inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-white/15 hover:bg-white/30 border border-white/20 text-white"
        : "focusable pressable inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold bg-white/15 hover:bg-white/25 border border-white/20 text-white"}>
      <Icon name={copied ? "check" : "clipboard"} size={compact ? 10 : 12} />
      {copied ? "คัดลอกแล้ว" : (compact ? "คัดลอก" : `คัดลอก ${measurerName}`)}
    </button>
  );
}

/** ปุ่มคัดลอกข้อมูลลูกค้า — compact=ไอคอนล้วน (ใช้ในปฏิทิน) */
function CopyContactButton({ entry, compact = false }: { entry: MeasureEntry; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (ev: React.MouseEvent) => {
    ev.preventDefault(); ev.stopPropagation();   // กันไปกดลิงก์เปิดงาน
    try {
      await navigator.clipboard.writeText(buildContactCopy(entry));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { alert("คัดลอกไม่สำเร็จ ลองใหม่"); }
  };
  if (compact) {
    return (
      <button onClick={onCopy} title="คัดลอกข้อมูลลูกค้า (ชื่อ/เบอร์/ที่อยู่/แผนที่)" aria-label="คัดลอกข้อมูลลูกค้า"
        className="focusable pressable inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/15 hover:bg-white/30 border border-white/20">
        <Icon name={copied ? "check" : "clipboard"} size={11} />
      </button>
    );
  }
  return (
    <button onClick={onCopy} title="คัดลอกข้อมูลลูกค้า (ชื่อ/เบอร์/ที่อยู่/แผนที่) ไว้ส่งช่างวัดทาง Line"
      className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/18 border border-white/15 text-white text-[12px] font-medium min-h-[36px]">
      <Icon name={copied ? "check" : "clipboard"} size={13} /> {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

// ── ตั้ง/แก้นัดวัด ในหน้านี้เลย (ไม่ต้องไปหน้าผลิต · ลิงก์กัน = production เดียวกัน) ──
function MeasureBookModal({ entry, measurers, onClose, onSaved }: {
  entry: MeasureEntry;
  measurers: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(entry.measure_scheduled ?? "");
  const [time, setTime] = useState(entry.measure_time ? fmtTime(entry.measure_time) : "");
  const [measurer, setMeasurer] = useState(entry.measurer_name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    try {
      // PATCH production เดิม (ไม่เปลี่ยน status) → หน้าผลิตเห็นเหมือนกัน
      await api.patch(`/production/${entry.production_id}`, {
        measure_scheduled: date || null,
        measure_time: time || null,
        measurer_name: measurer.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  };

  const inputCls = "focusable w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none min-h-[48px]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-md glass rounded-2xl p-5 fade-in">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white flex items-center gap-2"><Icon name="ruler" size={16} /> ตั้งนัดวัด</h3>
          <button onClick={onClose} aria-label="ปิด" className="text-white/60 hover:text-white"><Icon name="close" size={18} /></button>
        </div>
        <div className="text-sm text-white/85 mb-3">
          {entry.customer_name ?? "—"}
          {entry.customer_area && <span className="block text-[12px] mt-0.5" style={{ color: "var(--t-low)" }}>{entry.customer_area}</span>}
          {entry.job_code && <span className="text-[11px]" style={{ color: "var(--t-low)" }}>{entry.job_code}</span>}
        </div>

        <div className="flex gap-2 mb-3">
          <label className="flex-1 min-w-0">
            <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>วันที่นัด</span>
            <DateField value={date} onChange={setDate} aria-label="วันที่นัดวัด" className={inputCls} />
          </label>
          <label className="w-28 shrink-0">
            <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>เวลา</span>
            <input type="time" step={60} value={time} onChange={(e) => setTime(e.target.value.slice(0, 5))} aria-label="เวลานัดวัด"
              className={`${inputCls} tnum [&::-webkit-calendar-picker-indicator]:invert`} />
          </label>
        </div>
        <label className="block mb-4">
          <span className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ช่างที่วัด</span>
          <input list="measure-book-measurers" value={measurer} onChange={(e) => setMeasurer(e.target.value)}
            placeholder="เช่น เป, เนียน" aria-label="ช่างที่วัด" className={`${inputCls} placeholder-white/35`} />
          <datalist id="measure-book-measurers">
            {measurers.map((m) => <option key={m} value={m} />)}
            <option value="เป" /><option value="เนียน" />
          </datalist>
        </label>

        {err && <p role="alert" className="mb-3 text-sm text-rose-200 bg-rose-500/15 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-2">
          <button onClick={save} disabled={busy}
            className="focusable pressable flex-1 rounded-xl py-2.5 text-sm font-semibold text-[#1F4E78] bg-white hover:bg-white/90 disabled:opacity-60 min-h-[48px]">
            {busy ? "กำลังบันทึก…" : "บันทึกนัด"}
          </button>
          <button onClick={onClose} disabled={busy}
            className="focusable pressable glass-card border border-white/15 rounded-xl px-5 py-2.5 text-sm text-white/80 min-h-[48px]">ยกเลิก</button>
        </div>
        <p className="text-[11px] mt-2.5" style={{ color: "var(--t-low)" }}>บันทึกที่นี่ = ลิงก์กับหน้าผลิตอัตโนมัติ (งานเดียวกัน) · เว้นวันที่ว่าง = กลับไปรอนัด</p>
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function EntryRow({ entry, canWrite, onBook }: { entry: MeasureEntry; canWrite?: boolean; onBook?: (e: MeasureEntry) => void }) {
  const overdue = entry.is_overdue;
  return (
    <div className={`rounded-xl px-4 py-3 border flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 transition-colors
      ${overdue
        ? "bg-rose-500/15 border-rose-300/30"
        : "glass-card border-white/10"
      }`}
    >
      {/* เวลา */}
      <div className="shrink-0 w-16 text-sm tabular-nums font-bold text-white">
        {entry.measure_time ? fmtTime(entry.measure_time) : <span style={{ color: "var(--t-low)" }}>—</span>}
      </div>

      {/* ลูกค้า */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white">{entry.customer_name ?? "—"}</span>
          {entry.customer_area && (
            <span className="text-[12px] px-1.5 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/15">
              {entry.customer_area}
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-rose-400/25 border border-rose-300/30 text-rose-200 font-semibold">
              <Icon name="warn" size={10} /> เลยนัด
            </span>
          )}
          {entry.status === "MEASURED" && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-emerald-400/20 border border-emerald-300/30 text-emerald-200 font-semibold">
              <Icon name="check" size={10} /> วัดแล้ว
            </span>
          )}
        </div>
        <div className="text-[12px] mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "var(--t-low)" }}>
          {entry.customer_tel && (
            <span className="flex items-center gap-1">
              <Icon name="users" size={11} /> {entry.customer_tel}
            </span>
          )}
          {entry.measurer_name && (
            <span className="flex items-center gap-1">
              <Icon name="wrench" size={11} /> ช่าง: {entry.measurer_name}
            </span>
          )}
          {entry.job_code && (
            <span className="flex items-center gap-1">
              <Icon name="file" size={11} /> {entry.job_code}
            </span>
          )}
        </div>
      </div>

      {/* ปุ่มคัดลอก + แก้นัด + เปิดงาน */}
      <div className="shrink-0 flex items-center gap-1.5">
        <CopyContactButton entry={entry} />
        {canWrite && onBook && (
          <button onClick={() => onBook(entry)} title="แก้วัน/เวลา/ช่างที่นัดวัด"
            className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/25 hover:bg-sky-500/40 border border-sky-300/30 text-sky-50 text-[12px] font-medium min-h-[36px]">
            <Icon name="calendar" size={13} /> แก้นัด
          </button>
        )}
        <Link
          href={`/production?open=${entry.production_id}`}
          className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/18 border border-white/15 text-white text-[12px] font-medium min-h-[36px]"
        >
          <Icon name="external" size={13} /> เปิดงาน
        </Link>
      </div>
    </div>
  );
}

// ── P2-1B: ปฏิทินช่าง — Desktop matrix ──────────────────────────────────────

/** บล็อกนัดวัดในปฏิทิน */
function CalendarBlock({ entry, today }: { entry: MeasureEntry; today: string }) {
  const d = entry.measure_scheduled ?? "";
  const isOverdue = d < today && d !== "";
  const isToday = d === today;
  const bgCls = isOverdue
    ? "bg-rose-500/25 border-rose-300/35 text-rose-100"
    : isToday
    ? "bg-sky-500/25 border-sky-300/35 text-sky-100"
    : "glass-card border-white/15 text-white";

  return (
    <div className="relative">
      <Link
        href={`/production?open=${entry.production_id}`}
        className={`focusable pressable block rounded-xl pl-2.5 pr-8 py-2 border text-left transition-colors hover:opacity-80 ${bgCls}`}
      >
        {entry.measure_time && (
          <div className="text-[11px] font-bold tabular-nums mb-0.5">{fmtTime(entry.measure_time)}</div>
        )}
        <div className="text-[12px] font-semibold leading-tight truncate">{entry.customer_name ?? "—"}</div>
        {entry.customer_area && (
          <div className="text-[11px] opacity-70 truncate">{entry.customer_area}</div>
        )}
      </Link>
      {/* คัดลอกข้อมูลลูกค้า (มุมขวาบน · ไม่ไปกดเปิดงาน) */}
      <div className="absolute top-1.5 right-1.5">
        <CopyContactButton entry={entry} compact />
      </div>
    </div>
  );
}

/** Desktop matrix: วัน × ช่าง */
function CalendarMatrixDesktop({
  scheduled,
  days,
  measurers,
  today,
  measurerFilter,
}: {
  scheduled: MeasureEntry[];
  days: string[];
  measurers: string[]; // ช่างทั้งหมด (จาก allMeasurers)
  today: string;
  measurerFilter: string | null;
}) {
  // คอลัมน์ = ช่างที่กรองแล้ว + "ยังไม่ระบุ"
  const cols = measurerFilter
    ? [measurerFilter, ""]   // "" = ยังไม่ระบุ
    : [...measurers, ""];    // "" = ยังไม่ระบุ

  const colLabels = cols.map((c) => c || "ยังไม่ระบุช่าง");

  return (
    <div className="overflow-x-auto pb-2">
      <table className="w-full border-separate border-spacing-1.5 min-w-[500px]">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-semibold px-2 py-1.5 rounded-lg glass-card border border-white/10 text-white/70 w-36 shrink-0">
              วัน
            </th>
            {colLabels.map((label, i) => (
              <th
                key={cols[i]}
                className="text-left text-[12px] font-semibold px-2.5 py-1.5 rounded-lg glass-card border border-white/10 text-white min-w-[160px]"
              >
                <div className="flex items-center gap-1.5">
                  <Icon name="wrench" size={12} className="opacity-60 shrink-0" />
                  {label}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const { label, extra, isToday, isTomorrow, isOverdue } = dayLabel(d, today);
            const dayEntries = scheduled.filter((e) => e.measure_scheduled === d);

            const rowHeaderCls = isToday
              ? "bg-sky-400/20 border-sky-300/25 text-sky-100"
              : isTomorrow
              ? "bg-white/10 border-white/15 text-white"
              : isOverdue
              ? "bg-rose-500/20 border-rose-300/25 text-rose-100"
              : "glass-card border-white/10 text-white/80";

            return (
              <tr key={d} id={`cal-day-${d}`}>
                {/* Day header cell */}
                <td className={`align-top text-left rounded-xl px-2.5 py-2 border text-[12px] font-semibold ${rowHeaderCls}`}>
                  <div>{label}</div>
                  {extra && (
                    <div className={`text-[10px] font-semibold mt-0.5 ${
                      isToday ? "text-sky-200" : isTomorrow ? "text-white/70" : isOverdue ? "text-rose-200" : "text-white/50"
                    }`}>
                      {extra}
                    </div>
                  )}
                </td>
                {/* Entry cells per measurer */}
                {cols.map((col) => {
                  const cellEntries = dayEntries.filter((e) =>
                    col === ""
                      ? !e.measurer_name || e.measurer_name.trim() === ""
                      : (e.measurer_name ?? "").trim() === col,
                  );
                  return (
                    <td key={col} className="align-top">
                      {cellEntries.length === 0 ? (
                        <div className="text-center text-white/20 text-[13px] py-2">—</div>
                      ) : (
                        <div className="space-y-1.5">
                          {/* คัดลอกทั้งช่างของวันนี้ (ทั้งเซลล์) */}
                          <div className="flex justify-end">
                            <CopyGroupButton date={d} measurerName={col || "ยังไม่ระบุช่าง"} entries={cellEntries} compact />
                          </div>
                          {cellEntries.map((e) => (
                            <CalendarBlock key={e.production_id} entry={e} today={today} />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile calendar: เลือกช่าง → timeline วัน/เวลา */
function CalendarMobile({
  scheduledFiltered,
  byDay,
  days,
  today,
  measurerFilter,
  allMeasurers,
  setMeasurerFilter,
}: {
  scheduledFiltered: MeasureEntry[];
  byDay: Map<string, MeasureEntry[]>;
  days: string[];
  today: string;
  measurerFilter: string | null;
  allMeasurers: string[];
  setMeasurerFilter: (v: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      {/* chip filter ช่าง */}
      {allMeasurers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMeasurerFilter(null)}
            className={`focusable pressable px-3 py-1.5 rounded-xl text-[13px] font-medium min-h-[36px] border transition-colors ${
              measurerFilter === null
                ? "bg-white text-[#1F4E78] border-white"
                : "glass-card border-white/15 text-white/80"
            }`}
          >
            ทั้งหมด
          </button>
          {allMeasurers.map((name) => (
            <button
              key={name}
              onClick={() => setMeasurerFilter(measurerFilter === name ? null : name)}
              className={`focusable pressable px-3 py-1.5 rounded-xl text-[13px] font-medium min-h-[36px] border transition-colors ${
                measurerFilter === name
                  ? "bg-white text-[#1F4E78] border-white"
                  : "glass-card border-white/15 text-white/80"
              }`}
            >
              <Icon name="wrench" size={12} className="inline mr-1 opacity-70" />
              {name}
            </button>
          ))}
        </div>
      )}
      {/* timeline */}
      {days.length === 0 ? (
        <EmptyState title="ไม่มีนัดในเงื่อนไขนี้" sub="เลือกช่างหรือเปลี่ยน filter" />
      ) : (
        <div className="space-y-4">
          {days.map((d) => {
            const entries = byDay.get(d) ?? [];
            const { label, extra, isToday, isTomorrow, isOverdue } = dayLabel(d, today);
            const headerCls = isToday
              ? "bg-sky-400/20 border-sky-300/30 text-sky-100"
              : isTomorrow
              ? "bg-white/10 border-white/15 text-white"
              : isOverdue
              ? "bg-rose-500/20 border-rose-300/30 text-rose-100"
              : "bg-white/8 border-white/12 text-white/85";
            return (
              <div key={d} id={`cal-mob-day-${d}`}>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border mb-2 ${headerCls}`}>
                  <Icon name="calendar" size={14} className="shrink-0" />
                  <span className="font-semibold text-sm">{label}</span>
                  {extra && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ml-1 ${
                      isToday ? "bg-sky-300/25" :
                      isTomorrow ? "bg-white/15" :
                      isOverdue ? "bg-rose-300/25" :
                      "bg-white/10"
                    }`}>
                      {extra}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums opacity-70">{entries.length} นัด</span>
                </div>
                <div className="space-y-2">
                  {entries.map((e) => (
                    <EntryRow key={e.production_id} entry={e} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {scheduledFiltered.length === 0 && days.length === 0 && (
        <EmptyState title="ยังไม่มีนัดวัด" sub="งานที่อยู่ในขั้น รอวัดจริง จะแสดงที่นี่เมื่อตั้งนัดแล้ว" />
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function MeasureSchedulePage() {
  const [showMeasured, setShowMeasured] = useState(false);
  // P2-1B: toggle view
  const [view, setView] = useState<"list" | "calendar">("list");
  // filter ช่าง
  const [measurerFilter, setMeasurerFilter] = useState<string | null>(null);
  // filter card active
  const [cardFilter, setCardFilter] = useState<"overdue" | "unscheduled" | null>(null);
  const unscheduledRef = useRef<HTMLDivElement | null>(null);

  const { data: res, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["measure-schedule"],
    queryFn: () => api.get<ApiData>("/measure-schedule"),
    staleTime: 30_000,
  });

  const apiData = res?.data;
  const canWrite = (res?.meta?.can_write as boolean) ?? false;
  const today = apiData?.today ?? new Date().toISOString().slice(0, 10);

  // ตั้ง/แก้นัดในหน้านี้ (modal) — entry ที่กำลังตั้งนัด
  const [booking, setBooking] = useState<MeasureEntry | null>(null);
  const onBook = useCallback((e: MeasureEntry) => setBooking(e), []);

  // distinct ช่างจาก scheduled + unscheduled
  const allMeasurers = useMemo(() => {
    const set = new Set<string>();
    [...(apiData?.scheduled ?? []), ...(apiData?.unscheduled ?? [])].forEach((e) => {
      if (e.measurer_name) set.add(e.measurer_name);
    });
    return [...set].sort();
  }, [apiData]);

  // กรองด้วย measurerFilter (scheduled + unscheduled)
  const scheduledFiltered = useMemo(() => {
    let list = apiData?.scheduled ?? [];
    if (measurerFilter) list = list.filter((e) => e.measurer_name === measurerFilter);
    if (cardFilter === "overdue") list = list.filter((e) => e.is_overdue);
    return list;
  }, [apiData?.scheduled, measurerFilter, cardFilter]);

  const unscheduledFiltered = useMemo(() => {
    let list = apiData?.unscheduled ?? [];
    if (measurerFilter) list = list.filter((e) => e.measurer_name === measurerFilter);
    return list;
  }, [apiData?.unscheduled, measurerFilter]);

  // จัดกลุ่ม scheduled ตามวัน
  const byDay = useMemo(() => {
    const map = new Map<string, MeasureEntry[]>();
    scheduledFiltered.forEach((e) => {
      const d = e.measure_scheduled!;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    });
    return map;
  }, [scheduledFiltered]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  const totalScheduled = apiData?.scheduled.length ?? 0;
  const totalUnscheduled = apiData?.unscheduled.length ?? 0;
  const totalOverdue = (apiData?.scheduled ?? []).filter((e) => e.is_overdue).length;

  // P2-1B: วันทั้งหมดสำหรับ calendar (ไม่ขึ้นกับ filter card overdue)
  const calendarDays = useMemo(() => {
    const set = new Set<string>();
    scheduledFiltered.forEach((e) => { if (e.measure_scheduled) set.add(e.measure_scheduled); });
    // overdue บนสุด + อนาคต
    return [...set].sort((a, b) => {
      const ao = a < today, bo = b < today;
      if (ao && !bo) return -1;
      if (!ao && bo) return 1;
      return a.localeCompare(b);
    });
  }, [scheduledFiltered, today]);

  // ปุ่ม "วันนี้"
  const hasTodayJob = days.includes(today);

  const scrollToToday = () => {
    const el = document.getElementById(view === "calendar" ? `cal-day-${today}` : `day-${today}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToUnscheduled = () => {
    unscheduledRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  if (isLoading) return <Spinner label="กำลังโหลดนัดวัด…" />;
  if (error) return (
    <div role="alert" className="glass-card rounded-2xl p-6 text-center">
      <p className="text-rose-200 mb-3">{error instanceof Error ? error.message : "โหลดไม่สำเร็จ"}</p>
      <button onClick={handleRefresh} className="focusable pressable px-4 py-2 rounded-xl bg-white/10 hover:bg-white/18 text-white text-sm min-h-[44px]">
        ลองใหม่
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center bg-sky-500/30 border border-sky-300/30 text-sky-100">
            <Icon name="ruler" size={18} />
          </span>
          นัดวัดจริง
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* P2-1B: toggle view */}
          <div className="flex gap-1 glass-card rounded-xl p-1 border border-white/10">
            <button
              onClick={() => setView("list")}
              className={`focusable pressable px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] transition-colors ${
                view === "list" ? "bg-white text-[#1F4E78]" : "text-white/70 hover:text-white"
              }`}
            >
              <Icon name="file" size={13} className="inline mr-1 -mt-0.5" />
              รายการ
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`focusable pressable px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] transition-colors ${
                view === "calendar" ? "bg-white text-[#1F4E78]" : "text-white/70 hover:text-white"
              }`}
            >
              <Icon name="calendar" size={13} className="inline mr-1 -mt-0.5" />
              ปฏิทินช่าง
            </button>
          </div>
          {/* ปุ่ม "วันนี้" */}
          <button
            onClick={scrollToToday}
            disabled={!hasTodayJob}
            className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl glass-card border border-white/15 text-white text-sm font-medium min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
            title={hasTodayJob ? "ไปวันนี้" : "ไม่มีนัดวันนี้"}
          >
            <Icon name="calendar" size={15} /> วันนี้
          </button>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="focusable pressable inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl glass-card border border-white/15 text-white text-sm font-medium min-h-[44px] disabled:opacity-60"
          >
            <Icon name="refresh" size={15} className={isFetching ? "animate-spin" : ""} />
            รีเฟรช
          </button>
        </div>
      </div>

      {/* Summary bar — การ์ดคลิกได้ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* นัดแล้ว → ล้าง filter */}
        <button
          onClick={() => { setCardFilter(null); setMeasurerFilter(null); }}
          className={`glass-card rounded-2xl p-4 border text-left focusable pressable transition-all ${cardFilter === null && !measurerFilter ? "border-white/40 ring-1 ring-white/25" : "border-white/10"}`}
        >
          <div className="text-[11px] font-medium mb-1" style={{ color: "var(--t-low)" }}>นัดแล้ว (รอวัด)</div>
          <div className="text-2xl font-bold tabular-nums text-white">{totalScheduled}</div>
        </button>
        {/* เลยนัด → กรองเฉพาะ overdue */}
        <button
          onClick={() => setCardFilter(cardFilter === "overdue" ? null : "overdue")}
          className={`glass-card rounded-2xl p-4 border text-left focusable pressable transition-all ${
            totalOverdue > 0 ? "border-rose-300/35 bg-rose-500/12" : "border-white/10"
          } ${cardFilter === "overdue" ? "ring-1 ring-rose-300/50" : ""}`}
        >
          <div className="text-[11px] font-medium mb-1" style={{ color: "var(--t-low)" }}>เลยนัดแล้วยังไม่วัด</div>
          <div className={`text-2xl font-bold tabular-nums ${totalOverdue > 0 ? "text-rose-200" : "text-white"}`}>{totalOverdue}</div>
        </button>
        {/* รอนัดวัด → scroll ไปบล็อก unscheduled */}
        <button
          onClick={() => { setCardFilter(cardFilter === "unscheduled" ? null : "unscheduled"); scrollToUnscheduled(); }}
          className={`glass-card rounded-2xl p-4 border col-span-2 sm:col-span-1 text-left focusable pressable transition-all ${
            totalUnscheduled > 0 ? "border-amber-300/35 bg-amber-500/10" : "border-white/10"
          } ${cardFilter === "unscheduled" ? "ring-1 ring-amber-300/50" : ""}`}
        >
          <div className="text-[11px] font-medium mb-1" style={{ color: "var(--t-low)" }}>รอนัดวัด</div>
          <div className={`text-2xl font-bold tabular-nums ${totalUnscheduled > 0 ? "text-amber-200" : "text-white"}`}>{totalUnscheduled}</div>
        </button>
      </div>

      {/* chip filter ช่าง (มุมมองรายการ) */}
      {view === "list" && allMeasurers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMeasurerFilter(null)}
            className={`focusable pressable px-3 py-1.5 rounded-xl text-[13px] font-medium min-h-[36px] border transition-colors ${
              measurerFilter === null
                ? "bg-white text-[#1F4E78] border-white"
                : "glass-card border-white/15 text-white/80"
            }`}
          >
            ทั้งหมด
          </button>
          {allMeasurers.map((name) => (
            <button
              key={name}
              onClick={() => setMeasurerFilter(measurerFilter === name ? null : name)}
              className={`focusable pressable px-3 py-1.5 rounded-xl text-[13px] font-medium min-h-[36px] border transition-colors ${
                measurerFilter === name
                  ? "bg-white text-[#1F4E78] border-white"
                  : "glass-card border-white/15 text-white/80"
              }`}
            >
              <Icon name="wrench" size={12} className="inline mr-1 opacity-70" />
              {name}
            </button>
          ))}
        </div>
      )}

      {/* งานรอนัด */}
      {(totalUnscheduled > 0 || cardFilter === "unscheduled") && (
        <div ref={unscheduledRef} className="glass-card rounded-2xl p-4 border border-amber-300/25">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="warn" size={15} className="text-amber-300 shrink-0" />
            <span className="font-semibold text-amber-100 text-sm">
              รอนัดวัด {unscheduledFiltered.length} งาน — ยังไม่ได้ตั้งวันนัด
            </span>
          </div>
          <div className="space-y-2">
            {unscheduledFiltered.length > 0 ? unscheduledFiltered.map((e) => (
              <div key={e.production_id}
                className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 bg-amber-500/10 border border-amber-300/20"
              >
                <div className="min-w-0">
                  <span className="font-medium text-white text-sm">{e.customer_name ?? "—"}</span>
                  {e.customer_area && <span className="ml-2 text-[12px]" style={{ color: "var(--t-low)" }}>{e.customer_area}</span>}
                  {e.job_code && <span className="ml-2 text-[11px]" style={{ color: "var(--t-low)" }}>{e.job_code}</span>}
                  {e.measurer_name && <span className="ml-2 text-[11px]" style={{ color: "var(--t-low)" }}>ช่าง: {e.measurer_name}</span>}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <CopyContactButton entry={e} />
                  {canWrite && (
                    <button onClick={() => onBook(e)} title="ตั้งวัน/เวลา/ช่างที่นัดวัด"
                      className="focusable pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/30 hover:bg-sky-500/45 border border-sky-300/35 text-sky-50 text-[12px] font-semibold min-h-[36px]">
                      <Icon name="calendar" size={12} /> ตั้งนัด
                    </button>
                  )}
                  <Link
                    href={`/production?open=${e.production_id}`}
                    className="focusable pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/18 border border-white/15 text-white text-[12px] font-medium min-h-[36px]"
                  >
                    <Icon name="external" size={12} /> เปิดงาน
                  </Link>
                </div>
              </div>
            )) : (
              <div className="text-[13px] text-center py-3" style={{ color: "var(--t-low)" }}>ไม่มีงานในเงื่อนไขนี้</div>
            )}
          </div>
        </div>
      )}

      {/* ── P2-1B: มุมมองปฏิทินช่าง ── */}
      {view === "calendar" && (
        <div className="space-y-4">
          {calendarDays.length === 0 ? (
            <EmptyState title="ยังไม่มีนัดวัด" sub="งานที่อยู่ในขั้น รอวัดจริง จะแสดงที่นี่เมื่อตั้งนัดแล้ว" />
          ) : (
            <>
              {/* Desktop: matrix */}
              <div className="hidden md:block">
                <CalendarMatrixDesktop
                  scheduled={scheduledFiltered}
                  days={calendarDays}
                  measurers={allMeasurers}
                  today={today}
                  measurerFilter={measurerFilter}
                />
              </div>
              {/* Mobile: timeline พร้อม filter ช่าง */}
              <div className="md:hidden">
                <CalendarMobile
                  scheduledFiltered={scheduledFiltered}
                  byDay={byDay}
                  days={days}
                  today={today}
                  measurerFilter={measurerFilter}
                  allMeasurers={allMeasurers}
                  setMeasurerFilter={setMeasurerFilter}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── มุมมองรายการ (เดิม) ── */}
      {view === "list" && (
        <>
          {/* นัดวัดตามวัน */}
          {days.length === 0 && unscheduledFiltered.length === 0 && cardFilter !== "unscheduled" ? (
            <EmptyState title="ยังไม่มีนัดวัด" sub="งานที่อยู่ในขั้น รอวัดจริง จะแสดงที่นี่เมื่อตั้งนัดแล้ว" />
          ) : (
            <div className="space-y-4">
              {days.map((d) => {
                const entries = byDay.get(d) ?? [];
                const { label, extra, isToday, isTomorrow, isOverdue } = dayLabel(d, today);
                const headerCls = isToday
                  ? "bg-sky-400/20 border-sky-300/30 text-sky-100"
                  : isTomorrow
                  ? "bg-white/10 border-white/15 text-white"
                  : isOverdue
                  ? "bg-rose-500/20 border-rose-300/30 text-rose-100"
                  : "bg-white/8 border-white/12 text-white/85";
                return (
                  <div key={d} id={`day-${d}`}>
                    {/* Day header */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border mb-2 ${headerCls}`}>
                      <Icon name="calendar" size={14} className="shrink-0" />
                      <span className="font-semibold text-sm">{label}</span>
                      {extra && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ml-1 ${
                          isToday ? "bg-sky-300/25" :
                          isTomorrow ? "bg-white/15" :
                          isOverdue ? "bg-rose-300/25" :
                          "bg-white/10"
                        }`}>
                          {extra}
                        </span>
                      )}
                      {/* ปุ่มคัดลอกทั้งช่างของวันนี้ (แบบก๊อปคิวเซลล์) */}
                      <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                        {(() => {
                          const groups = new Map<string, MeasureEntry[]>();
                          for (const e of entries) {
                            const k = (e.measurer_name ?? "").trim() || "ยังไม่ระบุช่าง";
                            if (!groups.has(k)) groups.set(k, []);
                            groups.get(k)!.push(e);
                          }
                          return [...groups.entries()].map(([name, es]) => (
                            <CopyGroupButton key={name} date={d} measurerName={name} entries={es} />
                          ));
                        })()}
                        <span className="text-[11px] tabular-nums opacity-70">{entries.length} นัด</span>
                      </div>
                    </div>
                    {/* Entries */}
                    <div className="space-y-2">
                      {entries.map((e) => (
                        <EntryRow key={e.production_id} entry={e} canWrite={canWrite} onBook={onBook} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* วัดแล้วล่าสุด (toggle) */}
      {(apiData?.measured?.length ?? 0) > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowMeasured((v) => !v)}
            className="focusable pressable inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2.5 rounded-xl glass-card border border-white/12 text-white/70 hover:text-white min-h-[44px]"
          >
            <Icon name="check" size={14} />
            วัดแล้ว 7 วันล่าสุด ({apiData?.measured.length} งาน)
            <Icon name="arrowLeft" size={13} className={`transition-transform ${showMeasured ? "-rotate-90" : "rotate-180"}`} />
          </button>
          {showMeasured && (
            <div className="mt-3 space-y-2">
              {(apiData?.measured ?? []).map((e) => (
                <div key={e.production_id}
                  className="glass-card rounded-xl px-4 py-3 border border-white/8 flex items-center justify-between gap-3 opacity-70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{e.customer_name ?? "—"}</span>
                      {e.customer_area && <span className="text-[11px]" style={{ color: "var(--t-low)" }}>{e.customer_area}</span>}
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-emerald-400/20 border border-emerald-300/25 text-emerald-200">
                        <Icon name="check" size={9} /> วัดแล้ว {thDate(e.measure_actual)}
                        {e.measure_actual_time && <span className="tabular-nums ml-0.5">{fmtTime(e.measure_actual_time)}</span>}
                      </span>
                    </div>
                    {(e.measured_by_name || e.measurer_name) && (
                      <div className="text-[12px] mt-0.5 flex items-center gap-1" style={{ color: "var(--t-low)" }}>
                        <Icon name="wrench" size={11} />
                        วัดโดย: {e.measured_by_name ?? e.measurer_name}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/production?open=${e.production_id}`}
                    className="focusable pressable shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/12 text-white/70 text-[12px] min-h-[36px]"
                  >
                    <Icon name="external" size={12} /> เปิด
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ตั้ง/แก้นัดในหน้านี้ (ลิงก์กับหน้าผลิต) */}
      {booking && (
        <MeasureBookModal
          entry={booking}
          measurers={allMeasurers}
          onClose={() => setBooking(null)}
          onSaved={() => { setBooking(null); refetch(); }}
        />
      )}
    </div>
  );
}
