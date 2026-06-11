"use client";

import { useMemo } from "react";
import Icon from "@/components/Icon";
import {
  dayColor, thaiDate,
  type QueueEntry, type QueueSales, type QueueTeam,
} from "@/lib/queue";

// ---- helpers ----------------------------------------------------------------

const DOW_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const DOW_FULL  = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const STATUS_ABBR: Record<string, string> = {
  PENDING:   "รอ",
  PROPOSED:  "เสนอ",
  CONFIRMED: "ยืนยัน",
  DONE:      "เสร็จ",
  CANCELLED: "ยกเลิก",
};
const STATUS_CLR: Record<string, string> = {
  PENDING:   "bg-gray-100 text-gray-700",
  PROPOSED:  "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  DONE:      "bg-teal-100 text-teal-800",
  CANCELLED: "bg-red-100 text-red-700 line-through",
};

/** ISO "YYYY-Www" สำหรับวันที่ใด ๆ */
export function toIsoWeek(date: Date): string {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
  const jan1 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((tmp.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

/** ISO week → [Monday…Saturday] as ISO date strings */
function weekDays(isoWeek: string): string[] {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return [];
  const [, yr, wk] = m;
  const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (Number(wk) - 1) * 7 * 86400000);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  });
}

/** queue_time → นาที — รองรับ "09:30"/"9:30"/"14.00"/"9.30" (import เก่าใช้ "." + ชม.หลักเดียว) */
function timeToMin(t: string | null): number | null {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** queue_time → "H:MM" สำหรับแสดงบนการ์ด (normalize จุด→ทวิภาค, ตัด leading zero ชม.) */
function fmtTime(t: string | null): string {
  const min = timeToMin(t);
  if (min == null) return "";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** แปลง ISO date → label วันที่ไทย กระชับ */
function dayHeaderLabel(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dow = new Date(y, mo - 1, d).getDay();
  const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${DOW_SHORT[dow]} ${d} ${TH_MON[mo]}`;
}

export type AvailRow = {
  id: string;
  sales_id: string;
  date: string;
  kind: string;
  half: string | null;
};

// ---- component --------------------------------------------------------------

type Props = {
  week: string;             // "YYYY-Www"
  entries: QueueEntry[];    // เฉพาะสัปดาห์นี้ (+ null queue_date ไม่เกี่ยว)
  sales: QueueSales[];
  avail: AvailRow[];
  onEntryClick: (e: QueueEntry) => void;
  onAddSlot?: (date: string, slot: string, salesId: string) => void;
  filterTeam?: QueueTeam | "";
};

export function QueueCalendarView({ week, entries, sales, avail, onEntryClick, onAddSlot, filterTeam }: Props) {
  const days = useMemo(() => weekDays(week), [week]);

  // แสดงเฉพาะ MAIN sales rep, กรองตาม team ถ้ามี
  const salesRows = useMemo(
    () => sales.filter((s) => s.role !== "ASSISTANT" && (!filterTeam || s.team === filterTeam)),
    [sales, filterTeam]
  );

  // index: [salesId][date][slot] → QueueEntry[]
  const grid = useMemo(() => {
    const m: Record<string, Record<string, Record<string, QueueEntry[]>>> = {};
    salesRows.forEach((s) => {
      m[s.id] = {};
      days.forEach((d) => {
        m[s.id][d] = { "10:00": [], "14:00": [] };
      });
    });
    entries.forEach((e) => {
      if (!e.queue_date) return;
      const min = timeToMin(e.queue_time);
      // ไม่มีเวลา → ลงช่องเช้าไว้ก่อน (ให้โผล่ ไม่หาย); มีเวลา → < 12:00 เช้า, ≥ 12:00 บ่าย
      const slot = min == null || min < 12 * 60 ? "10:00" : "14:00";
      const sid = e.sales_id;
      if (!sid || !m[sid]) return;
      if (!m[sid][e.queue_date]) return;
      m[sid][e.queue_date][slot].push(e);
    });
    // เรียงคิวในแต่ละช่องตามเวลา (เช้าหลายคิว 9:00 < 10:00 < 11:00)
    Object.values(m).forEach((byDate) =>
      Object.values(byDate).forEach((bySlot) =>
        Object.values(bySlot).forEach((arr) =>
          arr.sort((a, b) => (timeToMin(a.queue_time) ?? 9999) - (timeToMin(b.queue_time) ?? 9999))
        )
      )
    );
    return m;
  }, [entries, salesRows, days]);

  // index: [salesId][date] → avail kind
  const availIndex = useMemo(() => {
    const m: Record<string, Record<string, AvailRow>> = {};
    avail.forEach((a) => {
      if (!m[a.sales_id]) m[a.sales_id] = {};
      m[a.sales_id][a.date] = a;
    });
    return m;
  }, [avail]);

  // (0030) วันอยู่ออฟฟิศประจำ: [salesId] → Set("<weekday>-AM"/"<weekday>-PM")
  const officeIndex = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    salesRows.forEach((s) => {
      m[s.id] = new Set((s.office_slots ?? []).map((o) => `${o.weekday}-${o.half}`));
    });
    return m;
  }, [salesRows]);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (!salesRows.length) {
    return (
      <div className="text-center py-12 text-ink-3 text-sm">
        ไม่มีเซลล์ที่ตรงเงื่อนไข
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse text-xs min-w-[640px]">
        {/* หัว: วัน จ-ส */}
        <thead>
          <tr>
            <th className="w-20 min-w-[72px] px-2 py-2 text-left text-ink-3 font-semibold border-b border-gray-200/70 sticky left-0 bg-white/80 backdrop-blur z-10">
              เซลล์
            </th>
            {days.map((d) => {
              const [y, mo, dd] = d.split("-").map(Number);
              const dow = new Date(y, mo - 1, dd).getDay();
              const c = dayColor(d);
              const isToday = d === todayStr;
              const isSun = dow === 0;
              return (
                <th key={d}
                  className={`px-1.5 py-2 text-center font-semibold border-b border-gray-200/70 ${isSun ? "opacity-40" : ""}`}
                  colSpan={2}>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${c?.chip ?? ""} ${isToday ? "ring-2 ring-brand" : ""}`}>
                    {dayHeaderLabel(d)}
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                  </span>
                </th>
              );
            })}
          </tr>
          {/* sub-header: slot 10:00 / 14:00 */}
          <tr className="text-[10px] text-ink-3">
            <th className="sticky left-0 bg-white/80 backdrop-blur z-10 border-b border-gray-100" />
            {days.map((d) => (
              <>
                <th key={`${d}-am`}
                  className="px-1 py-1 text-center font-medium border-b border-gray-100 bg-sky-50/60 border-r border-gray-100/70">
                  เช้า 10:00
                </th>
                <th key={`${d}-pm`}
                  className="px-1 py-1 text-center font-medium border-b border-gray-100 bg-amber-50/60">
                  บ่าย 14:00
                </th>
              </>
            ))}
          </tr>
        </thead>

        {/* body: แต่ละ sales rep */}
        <tbody>
          {salesRows.map((s, si) => (
            <tr key={s.id}
              className={`${si % 2 === 0 ? "bg-white/30" : "bg-gray-50/40"} hover:bg-brand/5 transition-colors`}>
              {/* ชื่อเซลล์ */}
              <td className="px-2 py-1.5 font-semibold text-ink sticky left-0 bg-white/80 backdrop-blur z-10 border-r border-gray-200/60 whitespace-nowrap">
                <div className="truncate max-w-[72px]" title={s.name}>{s.name}</div>
                <div className="text-[10px] text-ink-3 font-normal">{s.team === "PHUKET" ? "ภูเก็ต" : "กทม."}</div>
              </td>

              {days.map((d) => {
                const [y, mo, dd] = d.split("-").map(Number);
                const dow = new Date(y, mo - 1, dd).getDay();
                const isSun = dow === 0;
                const av = availIndex[s.id]?.[d];
                const isFullLeave = av && (av.kind === "LEAVE_FULL" || av.kind === "HOLIDAY");
                const isAMLeave = av && ((av.kind === "LEAVE_HALF" && av.half === "AM") || av.kind === "OFFICE_HALF");
                const isPMLeave = av && av.kind === "LEAVE_HALF" && av.half === "PM";
                // (0030) วันอยู่ออฟฟิศประจำ (soft — ยังลงคิวทับได้ แต่จะเตือน)
                const isOfficeAM = officeIndex[s.id]?.has(`${dow}-AM`) ?? false;
                const isOfficePM = officeIndex[s.id]?.has(`${dow}-PM`) ?? false;

                return (
                  <>
                    {/* Slot เช้า 10:00 */}
                    <td key={`${s.id}-${d}-am`}
                      className={`px-1 py-1 align-top border-r border-gray-100/70 ${isSun || isFullLeave || isAMLeave ? "opacity-40 bg-gray-100/60" : "bg-sky-50/30"}`}>
                      {!isSun && !isFullLeave && !isAMLeave
                        ? <SlotCell entries={grid[s.id]?.[d]?.["10:00"] ?? []} office={isOfficeAM} onClick={onEntryClick} onAdd={onAddSlot ? () => onAddSlot(d, "10:00", s.id) : undefined} />
                        : <LeaveTag av={av} isSun={isSun} />}
                    </td>
                    {/* Slot บ่าย 14:00 */}
                    <td key={`${s.id}-${d}-pm`}
                      className={`px-1 py-1 align-top border-r border-gray-100/30 ${isSun || isFullLeave || isPMLeave ? "opacity-40 bg-gray-100/60" : "bg-amber-50/30"}`}>
                      {!isSun && !isFullLeave && !isPMLeave
                        ? <SlotCell entries={grid[s.id]?.[d]?.["14:00"] ?? []} office={isOfficePM} onClick={onEntryClick} onAdd={onAddSlot ? () => onAddSlot(d, "14:00", s.id) : undefined} />
                        : <LeaveTag av={av} isSun={isSun} />}
                    </td>
                  </>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- sub-components ---------------------------------------------------------

function SlotCell({ entries, onClick, onAdd, office }: { entries: QueueEntry[]; onClick: (e: QueueEntry) => void; onAdd?: () => void; office?: boolean }) {
  if (!entries.length) {
    // (0030) วันอยู่ออฟฟิศประจำ — แสดงป้าย แต่ยังกดลงคิวทับได้ (soft, จะเตือนในฟอร์ม)
    if (office) {
      const tag = (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 font-medium">
          <Icon name="building" size={9} /> อยู่ออฟฟิศ
        </span>
      );
      return onAdd ? (
        <button type="button" onClick={onAdd} title="อยู่ออฟฟิศประจำ — กดเพื่อลงคิวทับ (จะเตือน)"
          className="press h-8 w-full flex items-center justify-center hover:brightness-95 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          {tag}
        </button>
      ) : (
        <div className="h-8 flex items-center justify-center">{tag}</div>
      );
    }
    if (onAdd) {
      return (
        <button
          type="button"
          onClick={onAdd}
          aria-label="เพิ่มคิวในช่องนี้"
          className="press h-8 w-full flex items-center justify-center text-gray-300 text-[10px] hover:text-brand hover:bg-brand/5 rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          ว่าง
        </button>
      );
    }
    return <div className="h-8 flex items-center justify-center text-gray-300 text-[10px]">ว่าง</div>;
  }
  return (
    <div className="space-y-0.5 min-h-[32px]">
      {entries.map((e) => {
        const tlabel = fmtTime(e.queue_time);
        // โชว์เวลาเฉพาะคิวที่ไม่ตรง slot มาตรฐาน (เช่น 9:30, 11:00, 13:00) ให้สังเกตง่าย
        const showTime = tlabel && tlabel !== "10:00" && tlabel !== "14:00";
        return (
          <button key={e.id}
            onClick={() => onClick(e)}
            title={`${tlabel ? tlabel + " " : ""}${e.customer_name} — ${STATUS_ABBR[e.status] ?? e.status}`}
            className={`press w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate block leading-tight
              ${STATUS_CLR[e.status] ?? "bg-gray-100 text-gray-700"}
              ${e.status === "CANCELLED" ? "opacity-60" : ""}
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}>
            {showTime && <span className="tabular-nums font-semibold mr-0.5">{tlabel}</span>}
            <span className="font-medium">{e.customer_name}</span>
            {e.status !== "CONFIRMED" && e.status !== "DONE" && (
              <span className="ml-1 opacity-70">[{STATUS_ABBR[e.status]}]</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function LeaveTag({ av, isSun }: { av?: AvailRow; isSun?: boolean }) {
  if (isSun) return <div className="h-8 flex items-center justify-center text-[10px] text-gray-400">หยุด</div>;
  if (!av) return null;
  const labels: Record<string, string> = {
    LEAVE_FULL:  "ลา",
    LEAVE_HALF:  "ลาครึ่ง",
    OFFICE_HALF: "อยู่ออฟ.",
    HOLIDAY:     "วันหยุด",
  };
  return (
    <div className="h-8 flex items-center justify-center">
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-200/60 rounded px-1.5 py-0.5">
        <Icon name="calendar" size={9} />
        {labels[av.kind] ?? av.kind}
      </span>
    </div>
  );
}
