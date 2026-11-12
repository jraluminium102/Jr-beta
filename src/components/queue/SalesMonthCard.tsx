"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { computeFieldStats, type FieldAvail, type FieldEntry, type FieldOffice } from "@/lib/field-stats";
import type { QueueSales } from "@/lib/queue";

/**
 * การ์ด "เซลล์เดือนนี้" บนหน้าคิวงาน (เจ้าของสั่ง 12 พ.ย.69)
 *   ออกหน้างานกี่วัน (เต็ม/ครึ่ง · ตจว.) · ออกติดกันมากี่วันทำงาน (เตือนเมื่อ ≥ เกณฑ์) · ตั้งออฟฟิศแล้วกี่วัน / ต้องกี่วัน · ลา
 *   นับเฉพาะเซลล์หลัก · โหลดคิวของเดือน + เดือนก่อน (นับสายต่อเนื่องข้ามเดือน) แยกจากรายการหลักของหน้า
 */
export type QueueSettingsLite = { office_days_required: number; field_streak_warn: number; migrated?: boolean };

const prevMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`; };
const fmtHalf = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function SalesMonthCard({ sales, avail, month, today, settings, onOpenOffice, refreshKey }: {
  sales: QueueSales[]; avail: FieldAvail[]; month: string; today: string; settings: QueueSettingsLite;
  onOpenOffice?: () => void; refreshKey?: number;
}) {
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          api.get<FieldEntry[]>(`/queue?month=${month}`),
          api.get<FieldEntry[]>(`/queue?month=${prevMonth(month)}`),
        ]);
        if (alive) setEntries([...(b.data ?? []), ...(a.data ?? [])]);
      } catch { if (alive) setEntries([]); }
    })();
    return () => { alive = false; };
  }, [month, refreshKey]);

  const mains = useMemo(() => sales.filter((s) => s.role !== "ASSISTANT"), [sales]);
  const stats = useMemo(() => computeFieldStats({
    salesIds: mains.map((s) => s.id),
    entries, avail, month, today,
    officeBySales: Object.fromEntries(mains.map((s) => [s.id, (s.office_overrides ?? []) as FieldOffice[]])),
    requiredDays: settings.office_days_required,
    requiredBySales: Object.fromEntries(mains.map((s) => [s.id, (s as QueueSales & { office_days_required?: number | null }).office_days_required ?? null])),
    streakWarn: settings.field_streak_warn,
  }), [mains, entries, avail, month, today, settings]);
  const byId = new Map(stats.map((x) => [x.sales_id, x]));
  const isCurrent = month === today.slice(0, 7);
  const daysLeft = (() => { const [y, m] = month.split("-").map(Number); const last = new Date(y, m, 0).getDate(); return last - Number(today.slice(8, 10)); })();

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => setOpen((v) => !v)} className="press flex items-center gap-2 text-sm font-bold text-brand-dark">
          <Icon name="users" size={16} /> เซลล์เดือนนี้ <span className="text-ink-3 font-medium text-xs">ออกหน้างาน · ติดกัน · ออฟฟิศ · ลา</span>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} className="text-ink-3" />
        </button>
        {onOpenOffice && (
          <button onClick={onOpenOffice} className="press text-xs font-semibold text-brand underline decoration-dotted">ตั้งวันออฟฟิศ</button>
        )}
      </div>
      {open && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
              <th className="py-1.5 font-semibold">เซลล์</th>
              <th className="font-semibold text-center">ออกหน้างาน (วัน)</th>
              <th className="font-semibold text-center">ติดกันตอนนี้</th>
              <th className="font-semibold text-center">ติดกันยาวสุด</th>
              <th className="font-semibold text-center">อยู่ออฟฟิศ</th>
              <th className="font-semibold text-center">ลา/หยุด</th>
            </tr></thead>
            <tbody>
              {mains.map((s) => {
                const x = byId.get(s.id); if (!x) return null;
                const short = x.office_required - x.office_days;
                const nearEnd = isCurrent && daysLeft <= 7 && short > 0;
                return (
                  <tr key={s.id} className={`border-b border-gray-100 last:border-0 ${x.streak_warn ? "bg-orange-50" : ""}`}>
                    <td className="py-2 font-semibold text-ink-2">{s.name}{s.team === "PHUKET" && <span className="ml-1 text-[10px] text-ink-3">ภูเก็ต</span>}</td>
                    <td className="text-center tabular-nums">
                      <b>{fmtHalf(x.field_days)}</b>
                      <div className="text-[10.5px] text-ink-3">เต็ม {x.full_days} · ครึ่ง {x.half_days}{x.upcountry_days ? ` · ตจว. ${x.upcountry_days}` : ""}</div>
                    </td>
                    <td className={`text-center tabular-nums font-bold ${x.streak_warn ? "text-orange-700" : "text-ink-2"}`}>
                      {x.streak_now}{x.streak_warn && <div className="text-[10.5px] font-semibold text-orange-700">ออกติดกันเกิน {settings.field_streak_warn} วัน</div>}
                    </td>
                    <td className="text-center tabular-nums text-ink-2">{x.streak_max}</td>
                    <td className={`text-center tabular-nums ${short <= 0 ? "text-emerald-700 font-semibold" : nearEnd ? "text-red-700 font-semibold" : "text-ink-2"}`}>
                      {fmtHalf(x.office_days)} / {x.office_required}
                      <div className="text-[10.5px] font-normal">{short <= 0 ? "ครบแล้ว" : `ขาด ${fmtHalf(short)} วัน${nearEnd ? " · เหลือไม่กี่วันแล้ว" : ""}`}</div>
                    </td>
                    <td className="text-center tabular-nums text-ink-3">{x.leave_days ? fmtHalf(x.leave_days) : "–"}</td>
                  </tr>
                );
              })}
              {mains.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-ink-3">ไม่มีเซลล์</td></tr>}
            </tbody>
          </table>
          <p className="text-[11px] text-ink-3 mt-2 leading-relaxed">
            ออกหน้างาน: เช้า/บ่าย = ครึ่งวัน · เต็มวันหรือต่างจังหวัด (นอก กทม.+นนทบุรี+ปทุมธานี+สมุทรปราการ+สมุทรสาคร+นครปฐม) = 1 วัน · โชว์รูมไม่นับ · วันอาทิตย์ไม่นับไม่ตัดสาย ·
            ติดกัน = วันทำงานที่ออกต่อเนื่อง (ลา/ออฟฟิศทั้งวัน/ไม่มีคิว = ตัด) · เตือนเมื่อ ≥ {settings.field_streak_warn} วัน · ต้องอยู่ออฟฟิศ {settings.office_days_required} วัน/เดือน (ทั้งวัน 1 · ครึ่งวัน 0.5)
            {settings.migrated === false && <span className="text-amber-700"> · ยังไม่ได้รัน migration 0174 (ใช้ค่าตั้งต้น 4 / 6)</span>}
          </p>
        </div>
      )}
    </Card>
  );
}
