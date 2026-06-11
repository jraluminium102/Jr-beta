"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { thaiDate, dayLabel, type QueueSales } from "@/lib/queue";
import type { AvailRow } from "@/components/queue/QueueCalendarView";

const KIND_META: Record<string, { th: string; cls: string; isLeave: boolean }> = {
  LEAVE_FULL:  { th: "ลาทั้งวัน", cls: "bg-red-50 text-red-700 border-red-200", isLeave: true },
  LEAVE_HALF:  { th: "ลาครึ่งวัน", cls: "bg-orange-50 text-orange-700 border-orange-200", isLeave: true },
  HOLIDAY:     { th: "วันหยุด", cls: "bg-gray-100 text-gray-600 border-gray-200", isLeave: true },
  OFFICE_HALF: { th: "อยู่ออฟฟิศเช้า", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", isLeave: false },
};

// "YYYY-MM" + delta เดือน
function addMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${TH[mo]} ${y + 543}`;
}

export function LeaveSummaryModal({
  salesList, avail, month: initialMonth, onClose,
}: {
  salesList: QueueSales[];
  avail: AvailRow[];
  month: string;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const nameOf = (id: string) => salesList.find((s) => s.id === id)?.name ?? "—";

  const rows = useMemo(() =>
    avail
      .filter((a) => a.date.startsWith(month))
      .sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.sales_id).localeCompare(nameOf(b.sales_id), "th")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [avail, month]);

  // นับ "วันลา" ต่อเซลล์ (เฉพาะลา/หยุด ไม่นับอยู่ออฟฟิศ; ครึ่งวัน = 0.5)
  const tally = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => {
      const meta = KIND_META[a.kind];
      if (!meta?.isLeave) return;
      const add = a.kind === "LEAVE_HALF" ? 0.5 : 1;
      m.set(a.sales_id, (m.get(a.sales_id) ?? 0) + add);
    });
    return [...m.entries()].map(([sid, n]) => ({ name: nameOf(sid), n })).sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={17} /> สรุปวันลา / อยู่ออฟฟิศ
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1">
            <Icon name="close" size={17} />
          </button>
        </div>

        {/* month nav */}
        <div className="flex items-center justify-center gap-1 mb-4 text-sm">
          <button onClick={() => setMonth((m) => addMonth(m, -1))}
            className="press glass-soft rounded-lg p-1.5 text-ink-2" aria-label="เดือนก่อน">
            <Icon name="arrowLeft" size={14} />
          </button>
          <span className="glass-soft rounded-lg px-4 py-1.5 min-w-[120px] text-center font-semibold">{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => addMonth(m, 1))}
            className="press glass-soft rounded-lg p-1.5 text-ink-2 rotate-180" aria-label="เดือนถัดไป">
            <Icon name="arrowLeft" size={14} />
          </button>
        </div>

        {/* tally วันลา/คน */}
        {tally.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tally.map((t) => (
              <span key={t.name} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                <span className="font-semibold">{t.name}</span> ลา {t.n} วัน
              </span>
            ))}
          </div>
        )}

        {/* รายวัน */}
        {rows.length === 0 ? (
          <p className="text-center text-ink-3 py-10 text-sm">ไม่มีวันลา/อยู่ออฟฟิศที่บันทึกไว้เดือนนี้</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((a) => {
              const k = KIND_META[a.kind] ?? { th: a.kind, cls: "bg-gray-100 text-gray-600 border-gray-200" };
              const half = a.kind === "LEAVE_HALF" && a.half ? (a.half === "AM" ? " เช้า" : " บ่าย") : "";
              return (
                <div key={a.id} className="flex items-center gap-2 text-sm py-1 border-b border-gray-100 last:border-0">
                  <span className="tabular-nums text-ink-2 w-28 shrink-0">{dayLabel(a.date)} {thaiDate(a.date)}</span>
                  <span className="font-semibold text-ink">{nameOf(a.sales_id)}</span>
                  <span className={`ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] ${k.cls}`}>{k.th}{half}</span>
                  {a.note && <span className="text-xs text-ink-3 max-w-[120px] truncate" title={a.note}>{a.note}</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2">ปิด</button>
        </div>
      </div>
    </div>
  );
}
