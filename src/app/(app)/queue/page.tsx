"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { QueueModal } from "@/components/queue/QueueModal";
import { LeaveModal } from "@/components/queue/LeaveModal";
import {
  QueueCalendarView, toIsoWeek,
  type AvailRow,
} from "@/components/queue/QueueCalendarView";
import {
  STATUS_META, STATUS_ORDER, JOB_SIZE_META, dayLabel, dayColor, thaiDate,
  detectTeam,
  type QueueEntry, type QueueSales, type QueueStatus, type QueueTeam,
} from "@/lib/queue";

// ---- helpers ----------------------------------------------------------------

const isMapUrl = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
const fmtBaht = (n: number | null) => (n == null ? "" : n.toLocaleString("th-TH"));

function sortKey(e: QueueEntry): string {
  const d = e.queue_date ?? "0000-00-00";
  return `${d} ${e.queue_time ?? "00:00"}`;
}

function thisMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function thisWeek(): string {
  return toIsoWeek(new Date());
}

function isoWeekLabel(w: string): string {
  const m = w.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return w;
  // Monday of that week
  const [, yr, wk] = m;
  const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (Number(wk) - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 5 * 86400000); // Saturday (จ-ส)
  const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const fmt = (d: Date) => `${d.getUTCDate()} ${TH_MON[d.getUTCMonth() + 1]}`;
  return `สัปดาห์ที่ ${m[2]} (${fmt(monday)}–${fmt(sunday)})`;
}

function addWeeks(isoWeek: string, delta: number): string {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return isoWeek;
  const [, yr, wk] = m;
  const jan4 = new Date(Date.UTC(Number(yr), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (Number(wk) - 1) * 7 * 86400000);
  const next = new Date(monday.getTime() + delta * 7 * 86400000);
  return toIsoWeek(new Date(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate()));
}

// "YYYY-MM-DD" → iso week string
function dateToWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoWeek(new Date(y, m - 1, d));
}

// ---- component --------------------------------------------------------------

type ViewMode = "list" | "calendar";

export default function QueuePage() {
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [sales, setSales] = useState<QueueSales[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [unlinked, setUnlinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { entry: QueueEntry | null }>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Filter state
  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [filterWeek, setFilterWeek] = useState(thisWeek());
  const [filterSales, setFilterSales] = useState("");
  const [filterTeam, setFilterTeam] = useState<QueueTeam | "">("");
  const [filterStatus, setFilterStatus] = useState<QueueStatus | "">("");

  // Availability (วันลา) สำหรับ calendar view
  const [avail, setAvail] = useState<AvailRow[]>([]);

  const loadAvail = useCallback(async () => {
    try {
      const res = await api.get<AvailRow[]>("/queue/availability");
      setAvail(res.data ?? []);
    } catch {
      // ไม่ block UI ถ้าโหลดวันลาไม่ได้
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (viewMode === "calendar") {
        params.set("week", filterWeek);
      } else {
        if (filterMonth) params.set("month", filterMonth);
      }
      if (filterSales) params.set("sales", filterSales);
      const res = await api.get<QueueEntry[]>(`/queue?${params.toString()}`);
      setRows(res.data ?? []);
      setSales((res.meta?.sales as QueueSales[]) ?? []);
      setCanWrite(Boolean(res.meta?.can_write));
      setUnlinked(Boolean(res.meta?.unlinked));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [viewMode, filterMonth, filterWeek, filterSales]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAvail(); }, [loadAvail]);

  // ---- client-side filter ----
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return [...rows]
      .filter((e) => {
        // text search
        if (kw) {
          const haystack = [e.customer_name, e.tel, e.address, e.sales?.name, e.queue_date, e.job_type, e.line_contact]
            .filter(Boolean).join(" ").toLowerCase();
          if (!haystack.includes(kw)) return false;
        }
        // team filter
        if (filterTeam) {
          const team = e.sales?.team ?? detectTeam(e.address, e.lat, e.lng);
          if (team !== filterTeam) return false;
        }
        // status filter
        if (filterStatus && e.status !== filterStatus) return false;
        return true;
      })
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [rows, q, filterTeam, filterStatus]);

  // แยก "รอจัดคิว" (queue_date=null) ออกจากที่นัดแล้ว
  const pendingRows = useMemo(() => list.filter((e) => !e.queue_date), [list]);
  const scheduledRows = useMemo(() => list.filter((e) => !!e.queue_date), [list]);

  // จัดกลุ่มตามวัน
  const byDay = useMemo(() => {
    const map = new Map<string, QueueEntry[]>();
    scheduledRows.forEach((e) => {
      const d = e.queue_date!;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    });
    return map;
  }, [scheduledRows]);

  const sortedDays = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  // calendar: entries ในสัปดาห์ที่เลือก (queue_date มีค่า)
  const calEntries = useMemo(() => {
    // เมื่อ viewMode=calendar, load ดึง ?week= มาแล้ว แต่ยังกรองฝั่ง client ด้วย filterTeam/filterStatus/filterSales
    return rows.filter((e) => {
      if (!e.queue_date) return false;
      if (filterTeam) {
        const team = e.sales?.team ?? detectTeam(e.address, e.lat, e.lng);
        if (team !== filterTeam) return false;
      }
      if (filterStatus && e.status !== filterStatus) return false;
      return true;
    });
  }, [rows, filterTeam, filterStatus]);

  // month options
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const base = new Date();
    for (let i = -2; i <= 3; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  const mainSales = sales.filter((s) => s.role !== "ASSISTANT");

  // ---- toggle receipt ----
  async function toggleReceipt(e: QueueEntry, checked: boolean) {
    setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, receipt_done: checked } : r)));
    try {
      await api.patch(`/queue/${e.id}`, { receipt_done: checked });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, receipt_done: !checked } : r)));
      alert(err instanceof Error ? err.message : "อัปเดตใบเสร็จไม่สำเร็จ");
    }
  }

  // ---- sub-components ----
  const StatusBadge = ({ e }: { e: QueueEntry }) => (
    <Badge tone={STATUS_META[e.status].tone} dot>{STATUS_META[e.status].th}</Badge>
  );

  const MapLink = ({ url }: { url: string | null }) =>
    url && /^https?:\/\//i.test(url) ? (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
        className="inline-flex items-center gap-1 text-brand font-medium hover:underline">
        <Icon name={isMapUrl(url) ? "pin" : "external"} size={13} />
        {isMapUrl(url) ? "แผนที่" : "ลิงก์"}
      </a>
    ) : <span className="text-ink-3">—</span>;

  const slotLabel = (t: string | null) => {
    if (!t) return "—";
    const hh = t.slice(0, 5);
    if (hh === "10:00") return "เช้า 10:00";
    if (hh === "14:00") return "บ่าย 14:00";
    return t;
  };

  // ---- render ----
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calendar" size={18} />
          </span>
          คิวงาน
        </h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200/80 text-sm font-semibold">
            <button
              onClick={() => setViewMode("list")}
              className={`press px-3.5 py-2.5 flex items-center gap-1.5 transition-colors ${viewMode === "list" ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
              <Icon name="clipboard" size={15} /> ตาราง
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`press px-3.5 py-2.5 flex items-center gap-1.5 transition-colors ${viewMode === "calendar" ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
              <Icon name="calendar" size={15} /> ปฏิทิน
            </button>
          </div>

          <button onClick={load} disabled={loading}
            className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-brand-dark disabled:opacity-60">
            <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </button>
          {canWrite && (
            <>
              <button onClick={() => setLeaveOpen(true)}
                className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-ink-2">
                <Icon name="calendar" size={16} /> วันลา
              </button>
              <button onClick={() => setModal({ entry: null })}
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
                <Icon name="plus" size={16} /> เพิ่มคิว
              </button>
            </>
          )}
        </div>
      </div>

      {/* แถบสีประจำวัน (คีย์สี) */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"].map((d) => {
          const c = dayColor(dowSample(d));
          return c ? (
            <span key={d} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${c.chip}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />{d}
            </span>
          ) : null;
        })}
      </div>

      <Card className="p-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap mb-4">

          {/* Period filter: month (list) / week (calendar) */}
          {viewMode === "list" ? (
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              <Icon name="calendar" size={14} />
              <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[120px]">
                {monthOptions.map((m) => {
                  const [yr, mo] = m.split("-");
                  return <option key={m} value={m}>{mo}/{yr}</option>;
                })}
              </select>
            </label>
          ) : (
            <div className="flex items-center gap-1 text-sm text-ink-2">
              <button onClick={() => setFilterWeek((w) => addWeeks(w, -1))}
                className="press glass-soft rounded-lg p-1.5 text-ink-2" aria-label="สัปดาห์ก่อน">
                <Icon name="arrowLeft" size={14} />
              </button>
              <span className="glass-soft rounded-lg px-3 py-1.5 text-sm tabular-nums min-w-[200px] text-center">
                {isoWeekLabel(filterWeek)}
              </span>
              <button onClick={() => setFilterWeek((w) => addWeeks(w, 1))}
                className="press glass-soft rounded-lg p-1.5 text-ink-2 rotate-180" aria-label="สัปดาห์ถัดไป">
                <Icon name="arrowLeft" size={14} />
              </button>
              <button onClick={() => setFilterWeek(thisWeek())}
                className="press glass-soft rounded-lg px-2.5 py-1.5 text-xs text-ink-2">
                วันนี้
              </button>
            </div>
          )}

          {/* Sales filter (ADMIN only) */}
          {canWrite && (
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              <Icon name="users" size={14} />
              <select value={filterSales} onChange={(e) => setFilterSales(e.target.value)}
                className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[110px]">
                <option value="">ทุกเซลล์</option>
                {mainSales.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Team filter */}
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="pin" size={14} />
            <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value as QueueTeam | "")}
              className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none">
              <option value="">ทุกพื้นที่</option>
              <option value="BKK">กทม.</option>
              <option value="PHUKET">ภูเก็ต</option>
            </select>
          </label>

          {/* Status filter */}
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="check" size={14} />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as QueueStatus | "")}
              className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[120px]">
              <option value="">ทุกสถานะ</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].th}</option>
              ))}
            </select>
          </label>

          {/* Text search (list mode only) */}
          {viewMode === "list" && (
            <label className="relative block flex-1 min-w-[180px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
                <Icon name="search" size={16} />
              </span>
              <input aria-label="ค้นหาคิว" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหา ชื่อ / เซลล์ / ที่อยู่…"
                className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
            </label>
          )}

          <span className="text-sm text-ink-3 tabular-nums ml-auto">
            {viewMode === "list" ? `${list.length} คิว` : `${calEntries.length} คิว/สัปดาห์`}
          </span>
        </div>

        {/* Error / empty states */}
        {err ? (
          <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span>{err}</span>
            <button onClick={load} className="press font-semibold text-red-800 underline shrink-0">ลองใหม่</button>
          </div>
        ) : unlinked ? (
          <p className="text-center text-ink-3 py-12">
            บัญชีนี้ยังไม่ถูกผูกกับเซลล์ — แจ้งแอดมินให้ผูกบัญชีเพื่อดูคิวของคุณ
          </p>
        ) : loading && rows.length === 0 ? (
          <p className="text-center text-ink-3 py-12">กำลังโหลด…</p>
        ) : viewMode === "calendar" ? (
          /* ===== Calendar View ===== */
          <QueueCalendarView
            week={filterWeek}
            entries={calEntries}
            sales={sales}
            avail={avail}
            onEntryClick={(e) => setModal({ entry: e })}
            filterTeam={filterTeam}
          />
        ) : list.length === 0 ? (
          <p className="text-center text-ink-3 py-12">
            {q || filterTeam || filterStatus ? "ไม่พบรายการที่กรอง" : "ยังไม่มีคิวในช่วงนี้"}
          </p>
        ) : (
          /* ===== List View ===== */
          <>
            {/* กล่อง "รอจัดคิว" */}
            {pendingRows.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
                    <Icon name="calendar" size={14} />
                    รอจัดคิว
                    <span className="tabular-nums ml-1 bg-amber-200/70 rounded-md px-1.5 py-0.5 text-xs">{pendingRows.length}</span>
                  </span>
                </div>
                {/* mobile cards */}
                <div className="xl:hidden space-y-2">
                  {pendingRows.map((e) => <MobileCard key={e.id} e={e} onOpen={setModal} onToggleReceipt={toggleReceipt} canWrite={canWrite} />)}
                </div>
                {/* desktop table */}
                <div className="hidden xl:block overflow-x-auto rounded-xl border border-amber-100">
                  <DesktopTable rows={pendingRows} onOpen={setModal} onToggleReceipt={toggleReceipt} canWrite={canWrite} slotLabel={slotLabel} />
                </div>
              </div>
            )}

            {/* คิวที่นัดแล้ว จัดกลุ่มตามวัน */}
            {sortedDays.length > 0 && (
              <div className="space-y-4">
                {sortedDays.map((d) => {
                  const dayRows = byDay.get(d)!;
                  const c = dayColor(d);
                  const label = `${dayLabel(d)} ${thaiDate(d)}`;
                  return (
                    <div key={d}>
                      {/* Day header */}
                      <div className={`flex items-center gap-2 mb-2 px-2 py-1.5 rounded-xl ${c?.chip ?? "bg-gray-100"}`}>
                        <span className="w-2 h-2 rounded-full" style={{ background: c?.dot }} />
                        <span className="font-semibold text-sm">{label}</span>
                        <span className="tabular-nums text-xs opacity-70 ml-1">{dayRows.length} คิว</span>
                      </div>
                      {/* mobile cards */}
                      <div className="xl:hidden space-y-2">
                        {dayRows.map((e) => <MobileCard key={e.id} e={e} onOpen={setModal} onToggleReceipt={toggleReceipt} canWrite={canWrite} />)}
                      </div>
                      {/* desktop table */}
                      <div className="hidden xl:block overflow-x-auto rounded-xl border border-gray-200/60">
                        <DesktopTable rows={dayRows} onOpen={setModal} onToggleReceipt={toggleReceipt} canWrite={canWrite} slotLabel={slotLabel} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>

      {modal && (
        <QueueModal
          entry={modal.entry}
          salesList={sales}
          readOnly={!canWrite}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {leaveOpen && (
        <LeaveModal
          salesList={sales}
          onClose={() => setLeaveOpen(false)}
          onSaved={() => { setLeaveOpen(false); loadAvail(); }}
        />
      )}
    </div>
  );
}

// ---- sub-components ---------------------------------------------------------

type TableProps = {
  rows: QueueEntry[];
  onOpen: (s: { entry: QueueEntry }) => void;
  onToggleReceipt: (e: QueueEntry, v: boolean) => void;
  canWrite: boolean;
  slotLabel: (t: string | null) => string;
};

function DesktopTable({ rows, onOpen, onToggleReceipt, canWrite, slotLabel }: TableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-ink-3 text-xs border-b border-gray-200/70 whitespace-nowrap bg-white/50">
          <th className="px-2 py-2 font-semibold">สถานะ</th>
          <th className="px-2 py-2 font-semibold">เวลา</th>
          <th className="px-2 py-2 font-semibold">ประเภท</th>
          <th className="px-2 py-2 font-semibold">เซลล์</th>
          <th className="px-2 py-2 font-semibold">ผู้ช่วย</th>
          <th className="px-2 py-2 font-semibold">LINE</th>
          <th className="px-2 py-2 font-semibold">ชื่อ</th>
          <th className="px-2 py-2 font-semibold">เบอร์</th>
          <th className="px-2 py-2 font-semibold">ที่อยู่</th>
          <th className="px-2 py-2 font-semibold">แผนที่</th>
          <th className="px-2 py-2 font-semibold">ขนาด</th>
          <th className="px-2 py-2 font-semibold text-right">ค่าประเมิน</th>
          <th className="px-2 py-2 font-semibold">ชำระ</th>
          <th className="px-2 py-2 font-semibold text-center">ใบเสร็จ</th>
          <th className="px-2 py-2 font-semibold">หมายเหตุ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const c = dayColor(e.queue_date);
          const isMapUrlFn = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
          return (
            <tr key={e.id} onClick={() => onOpen({ entry: e })}
              className={`border-b border-gray-200/50 ${c?.row ?? ""} cursor-pointer hover:brightness-95 align-top`}>
              <td className="px-2 py-2.5">
                <Badge tone={STATUS_META[e.status].tone} dot>{STATUS_META[e.status].th}</Badge>
              </td>
              <td className="px-2 py-2.5 whitespace-nowrap tabular-nums text-ink-2 font-medium">
                {slotLabel(e.queue_time)}
              </td>
              <td className="px-2 py-2.5 text-ink-2">{e.job_type || "—"}</td>
              <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.sales?.name || "—"}</td>
              <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.assistant?.name || "—"}</td>
              <td className="px-2 py-2.5 text-ink-2">{e.line_contact || "—"}</td>
              <td className="px-2 py-2.5 font-medium text-ink whitespace-nowrap">{e.customer_name}</td>
              <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.tel || "—"}</td>
              <td className="px-2 py-2.5 text-ink-2 max-w-[220px] truncate" title={e.address ?? ""}>{e.address || "—"}</td>
              <td className="px-2 py-2.5">
                {e.location_url && /^https?:\/\//i.test(e.location_url) ? (
                  <a href={e.location_url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
                    className="inline-flex items-center gap-1 text-brand font-medium hover:underline">
                    <Icon name={isMapUrlFn(e.location_url) ? "pin" : "external"} size={13} />
                    {isMapUrlFn(e.location_url) ? "แผนที่" : "ลิงก์"}
                  </a>
                ) : <span className="text-ink-3">—</span>}
              </td>
              <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.job_size ? JOB_SIZE_META[e.job_size] : "—"}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-ink-2">{e.assess_fee != null ? e.assess_fee.toLocaleString("th-TH") : "—"}</td>
              <td className="px-2 py-2.5 text-ink-2">{e.payment || "—"}</td>
              <td className="px-2 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                <input type="checkbox" checked={e.receipt_done} disabled={!canWrite}
                  onChange={(ev) => onToggleReceipt(e, ev.target.checked)}
                  className="w-4 h-4 accent-brand" />
              </td>
              <td className="px-2 py-2.5 text-ink-2 max-w-[160px] truncate" title={e.note_admin ?? ""}>{e.note_admin || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type CardProps = {
  e: QueueEntry;
  onOpen: (s: { entry: QueueEntry }) => void;
  onToggleReceipt: (e: QueueEntry, v: boolean) => void;
  canWrite: boolean;
};

function MobileCard({ e, onOpen, onToggleReceipt, canWrite }: CardProps) {
  const c = dayColor(e.queue_date);
  const isMapUrlFn = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
  const slotLabel = (t: string | null) => {
    if (!t) return "";
    const hh = t.slice(0, 5);
    if (hh === "10:00") return " · เช้า 10:00";
    if (hh === "14:00") return " · บ่าย 14:00";
    return ` · ${t}`;
  };
  return (
    <div onClick={() => onOpen({ entry: e })}
      className={`rounded-xl p-3.5 border border-gray-200/60 ${c?.row ?? "bg-white/50"} cursor-pointer`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{e.customer_name}</span>
        <Badge tone={STATUS_META[e.status].tone} dot>{STATUS_META[e.status].th}</Badge>
      </div>
      <div className="text-xs text-ink-3 mt-1">
        {e.queue_date ? `${dayLabel(e.queue_date)} ${thaiDate(e.queue_date)}` : "รอจัดวัน"}
        {slotLabel(e.queue_time)}
        {e.sales?.name ? ` · เซลล์ ${e.sales.name}` : ""}
        {e.assistant?.name ? ` · ผู้ช่วย ${e.assistant.name}` : ""}
        {e.job_type ? ` · ${e.job_type}` : ""}
        {e.job_size ? ` · ${JOB_SIZE_META[e.job_size]}` : ""}
      </div>
      {e.tel && (
        <div className="text-sm text-ink-2 mt-1">
          {e.tel}{e.line_contact ? ` · LINE ${e.line_contact}` : ""}
        </div>
      )}
      {e.address && <div className="text-sm text-ink-2 mt-1">{e.address}</div>}
      <div className="flex items-center justify-between mt-2">
        {e.location_url && /^https?:\/\//i.test(e.location_url) ? (
          <a href={e.location_url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
            className="inline-flex items-center gap-1 text-brand font-medium hover:underline text-sm">
            <Icon name={isMapUrlFn(e.location_url) ? "pin" : "external"} size={13} />
            {isMapUrlFn(e.location_url) ? "แผนที่" : "ลิงก์"}
          </a>
        ) : <span className="text-ink-3 text-sm">—</span>}
        <label className="flex items-center gap-1.5 text-xs text-ink-2" onClick={(ev) => ev.stopPropagation()}>
          <input type="checkbox" checked={e.receipt_done} disabled={!canWrite}
            onChange={(ev) => onToggleReceipt(e, ev.target.checked)}
            className="w-4 h-4 accent-brand" /> ใบเสร็จ
        </label>
      </div>
    </div>
  );
}

// Sample dates per day-of-week for color key (2024-01-01 = Monday)
function dowSample(day: string): string {
  const map: Record<string, string> = {
    "อาทิตย์": "2024-01-07", "จันทร์": "2024-01-01", "อังคาร": "2024-01-02",
    "พุธ": "2024-01-03", "พฤหัสบดี": "2024-01-04", "ศุกร์": "2024-01-05", "เสาร์": "2024-01-06",
  };
  return map[day] ?? "2024-01-01";
}
