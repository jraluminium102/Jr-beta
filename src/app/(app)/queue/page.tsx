"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { QueueModal } from "@/components/queue/QueueModal";
import { LeaveModal } from "@/components/queue/LeaveModal";
import {
  STATUS_META, JOB_SIZE_META, dayLabel, dayColor, thaiDate,
  type QueueEntry, type QueueSales,
} from "@/lib/queue";

const isMapUrl = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);
const fmtBaht = (n: number | null) => (n == null ? "" : n.toLocaleString("th-TH"));

function sortKey(e: QueueEntry): string {
  const d = e.queue_date ?? "0000-00-00";
  return `${d} ${e.queue_time ?? "00:00"}`;
}

// "YYYY-MM-DD" → "YYYY-MM"
function toMonth(iso: string): string { return iso.slice(0, 7); }

// current month as "YYYY-MM"
function thisMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

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

  // Filter state
  const [filterMonth, setFilterMonth] = useState(thisMonth());  // "YYYY-MM"
  const [filterSales, setFilterSales] = useState("");           // uuid or ""

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (filterMonth) params.set("month", filterMonth);
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
  }, [filterMonth, filterSales]);

  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return [...rows]
      .filter((e) => {
        if (kw === "") return true;
        return [e.customer_name, e.tel, e.address, e.sales?.name, e.queue_date, e.job_type, e.line_contact]
          .filter(Boolean).join(" ").toLowerCase().includes(kw);
      })
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [rows, q]);

  async function toggleReceipt(e: QueueEntry, checked: boolean) {
    setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, receipt_done: checked } : r)));
    try {
      await api.patch(`/queue/${e.id}`, { receipt_done: checked });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, receipt_done: !checked } : r)));
      alert(err instanceof Error ? err.message : "อัปเดตใบเสร็จไม่สำเร็จ");
    }
  }

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

  // Generate list of months for filter dropdown (current - 2 months … current + 2 months)
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const base = new Date();
    for (let i = -2; i <= 3; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  // Main sales reps only for filter dropdown
  const mainSales = sales.filter((s) => s.role !== "ASSISTANT");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calendar" size={18} />
          </span>
          คิวงาน
        </h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
          {/* Month filter */}
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <Icon name="calendar" size={14} />
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[120px]"
            >
              {monthOptions.map((m) => {
                const [yr, mo] = m.split("-");
                const label = `${mo}/${yr}`;
                return <option key={m} value={m}>{label}</option>;
              })}
            </select>
          </label>

          {/* Sales filter (ADMIN only) */}
          {canWrite && (
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              <Icon name="users" size={14} />
              <select
                value={filterSales}
                onChange={(e) => setFilterSales(e.target.value)}
                className="glass-soft rounded-lg px-2.5 py-1.5 text-sm outline-none min-w-[120px]"
              >
                <option value="">ทุกเซลล์</option>
                {mainSales.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Text search */}
          <label className="relative block flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              <Icon name="search" size={16} />
            </span>
            <input aria-label="ค้นหาคิว" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา ชื่อลูกค้า / เซลล์ / ที่อยู่…"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
          </label>
          <span className="text-sm text-ink-3 tabular-nums">{list.length} คิว</span>
        </div>

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
        ) : list.length === 0 ? (
          <p className="text-center text-ink-3 py-12">
            {q ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีคิวในช่วงนี้"}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-3 text-xs border-b border-gray-200/70 whitespace-nowrap">
                    <th className="px-2 py-2 font-semibold">สถานะ</th>
                    <th className="px-2 py-2 font-semibold">วันที่</th>
                    <th className="px-2 py-2 font-semibold">วัน</th>
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
                  {list.map((e) => {
                    const c = dayColor(e.queue_date);
                    return (
                      <tr key={e.id} onClick={() => setModal({ entry: e })}
                        className={`border-b border-gray-200/50 ${c?.row ?? ""} cursor-pointer hover:brightness-95 align-top`}>
                        <td className="px-2 py-2.5"><StatusBadge e={e} /></td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-ink-2">{thaiDate(e.queue_date) || "—"}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap">
                          {e.queue_date && c
                            ? <span className={`px-1.5 py-0.5 rounded ${c.chip} text-[11px]`}>{dayLabel(e.queue_date)}</span>
                            : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-ink-2">{e.queue_time || "—"}</td>
                        <td className="px-2 py-2.5 text-ink-2">{e.job_type || "—"}</td>
                        <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.sales?.name || "—"}</td>
                        <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.assistant?.name || "—"}</td>
                        <td className="px-2 py-2.5 text-ink-2">{e.line_contact || "—"}</td>
                        <td className="px-2 py-2.5 font-medium text-ink whitespace-nowrap">{e.customer_name}</td>
                        <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.tel || "—"}</td>
                        <td className="px-2 py-2.5 text-ink-2 max-w-[220px] truncate" title={e.address ?? ""}>{e.address || "—"}</td>
                        <td className="px-2 py-2.5"><MapLink url={e.location_url} /></td>
                        <td className="px-2 py-2.5 text-ink-2 whitespace-nowrap">{e.job_size ? JOB_SIZE_META[e.job_size] : "—"}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-ink-2">{fmtBaht(e.assess_fee) || "—"}</td>
                        <td className="px-2 py-2.5 text-ink-2">{e.payment || "—"}</td>
                        <td className="px-2 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" checked={e.receipt_done} disabled={!canWrite}
                            onChange={(ev) => toggleReceipt(e, ev.target.checked)}
                            className="w-4 h-4 accent-brand" />
                        </td>
                        <td className="px-2 py-2.5 text-ink-2 max-w-[160px] truncate" title={e.note_admin ?? ""}>{e.note_admin || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet cards */}
            <div className="xl:hidden space-y-3">
              {list.map((e) => {
                const c = dayColor(e.queue_date);
                return (
                  <div key={e.id} onClick={() => setModal({ entry: e })}
                    className={`rounded-xl p-3.5 border border-gray-200/60 ${c?.row ?? "bg-white/50"} cursor-pointer`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{e.customer_name}</span>
                      <StatusBadge e={e} />
                    </div>
                    <div className="text-xs text-ink-3 mt-1">
                      {e.queue_date ? `${dayLabel(e.queue_date)} ${thaiDate(e.queue_date)}` : "รอจัดวัน"}
                      {e.queue_time ? ` · ${e.queue_time}` : ""}
                      {e.sales?.name ? ` · เซลล์ ${e.sales.name}` : ""}
                      {e.assistant?.name ? ` · ผู้ช่วย ${(e.assistant as any).name}` : ""}
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
                      <MapLink url={e.location_url} />
                      <label className="flex items-center gap-1.5 text-xs text-ink-2" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" checked={e.receipt_done} disabled={!canWrite}
                          onChange={(ev) => toggleReceipt(e, ev.target.checked)}
                          className="w-4 h-4 accent-brand" /> ใบเสร็จ
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
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
          onSaved={() => { setLeaveOpen(false); }}
        />
      )}
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
