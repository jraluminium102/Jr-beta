"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import Icon from "@/components/Icon";
import { thDate } from "@/lib/format";

// ── types ────────────────────────────────────────────────────────────────────

type MeasureEntry = {
  production_id: string;
  job_id: string;
  job_code: string | null;
  customer_name: string | null;
  customer_area: string | null;
  customer_tel: string | null;
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

// ── sub-components ────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: MeasureEntry }) {
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

      {/* ปุ่มเปิดงาน */}
      <div className="shrink-0">
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
    <Link
      href={`/production?open=${entry.production_id}`}
      className={`focusable pressable block rounded-xl px-2.5 py-2 border text-left transition-colors hover:opacity-80 ${bgCls}`}
    >
      {entry.measure_time && (
        <div className="text-[11px] font-bold tabular-nums mb-0.5">{fmtTime(entry.measure_time)}</div>
      )}
      <div className="text-[12px] font-semibold leading-tight truncate">{entry.customer_name ?? "—"}</div>
      {entry.customer_area && (
        <div className="text-[11px] opacity-70 truncate">{entry.customer_area}</div>
      )}
    </Link>
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
  const today = apiData?.today ?? new Date().toISOString().slice(0, 10);

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
                <Link
                  href={`/production?open=${e.production_id}`}
                  className="focusable pressable shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/18 border border-white/15 text-white text-[12px] font-medium min-h-[36px]"
                >
                  <Icon name="external" size={12} /> เปิดงาน
                </Link>
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
                      <span className="ml-auto text-[11px] tabular-nums opacity-70">{entries.length} นัด</span>
                    </div>
                    {/* Entries */}
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
    </div>
  );
}
