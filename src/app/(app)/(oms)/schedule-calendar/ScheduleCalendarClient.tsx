"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

export type CalItem = {
  id: string;
  type: "measure" | "floor";
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM หรือ ""
  title: string;     // ชื่อลูกค้า
  line2: string;     // บรรทัด 2 บนนัด — measure=ช่างวัด, floor=ไปทำอะไร
  sub: string;       // รายละเอียดเต็ม (เขต/ช่างวัด/ระยะเวลา) โชว์ใน modal
  done: boolean;     // วัดแล้ว (MEASURED)
  href: string;      // กดแล้วไปหน้าต้นทาง
};

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const WEEKDAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const pad2 = (n: number) => String(n).padStart(2, "0");

// สี/ป้ายต่อชนิดนัด
const TYPE = {
  measure: { label: "นัดวัดจริง", dot: "#0284c7", chip: "bg-sky-100 text-sky-900 border-sky-300", sub: "text-sky-700", head: "bg-sky-500" },
  floor: { label: "จัดคิวงานพื้น", dot: "#b45309", chip: "bg-amber-100 text-amber-900 border-amber-300", sub: "text-amber-800", head: "bg-amber-500" },
} as const;

export default function ScheduleCalendarClient({
  year, month0, items, prevKey, nextKey, todayIso,
}: { year: number; month0: number; items: CalItem[]; prevKey: string; nextKey: string; todayIso: string }) {
  const [show, setShow] = useState<{ measure: boolean; floor: boolean }>({ measure: true, floor: true });
  const [dayOpen, setDayOpen] = useState<string | null>(null); // วันที่กดดูรายละเอียดเต็ม (mobile / ล้น)

  // ปิด modal ด้วยปุ่ม Escape (ตาม convention เดิมของระบบ)
  useEffect(() => {
    if (!dayOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDayOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayOpen]);

  const monthKey = `${year}-${pad2(month0 + 1)}`;
  const isThisMonth = monthKey === todayIso.slice(0, 7); // todayIso = วันนี้เวลาไทย (จาก server)

  // จัดนัดตามวันที่ (กรองตาม filter + เรียงตามเวลา)
  const byDate = useMemo(() => {
    const m: Record<string, CalItem[]> = {};
    for (const it of items) {
      if (!show[it.type]) continue;
      (m[it.date] ??= []).push(it);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    return m;
  }, [items, show]);

  const counts = useMemo(() => ({
    measure: items.filter((i) => i.type === "measure").length,
    floor: items.filter((i) => i.type === "floor").length,
  }), [items]);

  // สร้างช่องปฏิทิน (จันทร์เป็นวันแรก)
  const cells = useMemo(() => {
    const firstDow = (new Date(year, month0, 1).getDay() + 6) % 7; // 0=จันทร์
    const days = new Date(year, month0 + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month0]);

  const dateKeyOf = (d: number) => `${year}-${pad2(month0 + 1)}-${pad2(d)}`;

  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
      {/* หัวข้อ + นำทางเดือน */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calendar" size={18} />
          </span>
          ปฏิทินนัด — วัดจริง + งานพื้น
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/schedule-calendar?m=${prevKey}`} className="press rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink-2">‹ เดือนก่อน</Link>
          <span className="font-bold text-brand-dark tabular-nums min-w-[130px] text-center">{TH_MONTHS[month0]} {year + 543}</span>
          <Link href={`/schedule-calendar?m=${nextKey}`} className="press rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink-2">เดือนถัดไป ›</Link>
          {!isThisMonth && <Link href="/schedule-calendar" className="press rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand-dark">วันนี้</Link>}
        </div>
      </div>

      {/* ตัวกรองชนิดนัด */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        {(["measure", "floor"] as const).map((t) => (
          <button key={t} onClick={() => setShow((s) => ({ ...s, [t]: !s[t] }))}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition ${show[t] ? TYPE[t].chip : "bg-gray-50 text-gray-400 border-gray-200 line-through"}`}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: show[t] ? TYPE[t].dot : "#cbd5e1" }} />
            {TYPE[t].label} ({t === "measure" ? counts.measure : counts.floor})
          </button>
        ))}
      </div>

      {/* ปฏิทิน — เลื่อนแนวนอนได้บนจอแคบ */}
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-t-lg overflow-hidden">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`bg-amber-50 text-center py-2 text-xs font-semibold ${i >= 5 ? "text-rose-500" : "text-ink-2"}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 border-x border-b border-gray-200 rounded-b-lg overflow-hidden">
            {cells.map((d, idx) => {
              if (d === null) return <div key={idx} className="bg-gray-50 min-h-[136px]" />;
              const key = dateKeyOf(d);
              const list = byDate[key] ?? [];
              const isToday = key === todayIso;
              const dow = idx % 7;
              const shown = list.slice(0, 3);
              const more = list.length - shown.length;
              return (
                <div key={idx} className={`bg-white min-h-[136px] p-1.5 flex flex-col gap-1 ${isToday ? "ring-2 ring-inset ring-brand" : ""}`}>
                  <div className={`text-xs font-bold tabular-nums ${isToday ? "text-brand-dark" : dow >= 5 ? "text-rose-500" : "text-ink-2"}`}>
                    {isToday ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand text-white">{d}</span> : d}
                  </div>
                  {shown.map((it) => (
                    <Link key={it.id} href={it.href} title={`${it.time ? it.time + " น. · " : ""}${it.title}${it.sub ? " · " + it.sub : ""}`}
                      className={`block rounded-md border px-1.5 py-1 text-xs leading-snug ${TYPE[it.type].chip} ${it.done ? "opacity-60" : ""} hover:brightness-95`}>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE[it.type].dot }} />
                        {it.time && <span className="tabular-nums font-bold shrink-0">{it.time}</span>}
                        <span className="truncate font-semibold">{it.title}{it.done ? " ✓" : ""}</span>
                      </div>
                      {it.line2 && <div className={`truncate ml-2.5 text-[11px] ${TYPE[it.type].sub}`}>{it.line2}</div>}
                    </Link>
                  ))}
                  {more > 0 && (
                    <button onClick={() => setDayOpen(key)} className="text-[11px] text-brand-dark font-medium text-left hover:underline px-1.5 py-1 -mx-1.5 rounded hover:bg-gray-50">+ อีก {more} นัด</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-3">กดที่นัด → ไปหน้าต้นทาง (นัดวัดจริง / จัดคิวงานพื้น) · ✓ = วัดแล้ว · เสาร์-อาทิตย์เป็นสีแดง</p>

      {/* รายละเอียดวันที่กด "+ อีก N นัด" */}
      {dayOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={() => setDayOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label="รายการนัดของวันที่เลือก" className="w-full max-w-md rounded-2xl bg-white p-4 max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-brand-dark">นัดวันที่ {Number(dayOpen.slice(8))} {TH_MONTHS[month0]}</div>
              <button onClick={() => setDayOpen(null)} className="text-sm text-ink-3">ปิด</button>
            </div>
            <div className="space-y-1.5">
              {(byDate[dayOpen] ?? []).map((it) => (
                <Link key={it.id} href={it.href} className={`block rounded-lg border px-3 py-2 text-sm ${TYPE[it.type].chip} ${it.done ? "opacity-55" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE[it.type].dot }} />
                    {it.time && <span className="tabular-nums font-semibold">{it.time} น.</span>}
                    <span className="font-medium">{it.title}{it.done ? " ✓" : ""}</span>
                  </div>
                  {it.sub && <div className="text-xs opacity-80 mt-0.5 ml-3.5">{it.sub}</div>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
