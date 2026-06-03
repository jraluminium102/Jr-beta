"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { AddQueueModal } from "@/components/queue/AddQueueModal";
import {
  colIndex, parseLeave, parseQuota, salesList, normThaiDate,
  type Sheet, type QueueData,
} from "@/lib/queue";

const isMapUrl = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps|\/maps\/)/i.test(v);

function statusTone(v: string): "emerald" | "amber" | "sky" | "gray" {
  if (/เสร็จ|จัดแล้ว|อนุมัติ|ชำระ/.test(v)) return "emerald";
  if (/รอ|ค้าง|pending/i.test(v)) return "amber";
  if (/ยกเลิก|ปัญหา/.test(v)) return "gray";
  return "sky";
}

// d/m/yyyy(พ.ศ.) -> ตัวเลขเรียงได้ yyyymmdd
function dateSortKey(thai: string): number {
  const [d, m, y] = normThaiDate(thai).split("/").map(Number);
  if (!d || !m || !y) return 0;
  return y * 10000 + m * 100 + d;
}

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setData(json.data as QueueData);
      setFetchedAt((json.meta?.fetched_at as string) ?? new Date().toISOString());
      setSheetUrl((json.meta?.sheet_url as string) ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const queue: Sheet = data?.queue ?? { headers: [], rows: [] };
  const leave = useMemo(() => (data ? parseLeave(data.leave) : []), [data]);
  const quota = useMemo(() => (data ? parseQuota(data.quota) : []), [data]);
  const sales = useMemo(() => salesList(quota, queue), [quota, queue]);

  // index คอลัมน์สำคัญของ Tab คิวลูกค้า
  const idx = useMemo(() => {
    const h = queue.headers;
    return {
      status: colIndex(h, "สถานะ"), dow: colIndex(h, "วัน"), date: colIndex(h, "วันที่"),
      time: colIndex(h, "เวลา"), type: colIndex(h, "ประเภท"), sales: colIndex(h, "เซลล์"),
      channel: colIndex(h, "Line", "FB", "IG", "ช่องทาง"), customer: colIndex(h, "ชื่อลูกค้า"),
      tel: colIndex(h, "เบอร์"), address: colIndex(h, "ที่อยู่"), location: colIndex(h, "โลเคชั่น", "แผนที่"),
      note: colIndex(h, "หมายเหตุ admin"),
    };
  }, [queue.headers]);

  // กรอง + เรียงตามวันที่/เวลา
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return queue.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => (kw === "" ? true : r.join(" ").toLowerCase().includes(kw)))
      .sort((a, b) => {
        const dk = dateSortKey(a.r[idx.date] ?? "") - dateSortKey(b.r[idx.date] ?? "");
        if (dk !== 0) return dk;
        return (a.r[idx.time] ?? "").localeCompare(b.r[idx.time] ?? "");
      });
  }, [queue.rows, q, idx]);

  const fetchedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const cell = (v: string | undefined) => (v && v.trim() !== "" ? v : "—");
  const MapLink = ({ url }: { url: string }) =>
    isMapUrl(url) || /^https?:\/\//i.test(url) ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand font-medium hover:underline">
        <Icon name={isMapUrl(url) ? "pin" : "external"} size={13} /> {isMapUrl(url) ? "แผนที่" : "ลิงก์"}
      </a>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calendar" size={18} />
          </span>
          คิวงาน
        </h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xs text-ink-3 hidden md:inline">อัปเดต: {loading ? "…" : fetchedLabel}</span>
          <button onClick={load} disabled={loading}
            className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-brand-dark disabled:opacity-60">
            <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{loading ? "กำลังรีเฟรช…" : "รีเฟรช"}</span>
          </button>
          <button onClick={() => setAdding(true)} disabled={!data}
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
            <Icon name="plus" size={16} /> เพิ่มคิว
          </button>
        </div>
      </div>

      {/* การ์ดโควตา/สถานะเซลล์ */}
      {quota.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quota.map((qa) => (
            <Card key={qa.sales} className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-brand-dark">{qa.sales}</span>
                <span className="text-xs text-ink-3">เหลือ {qa.remaining}</span>
              </div>
              <div className="text-xs text-ink-3 mt-1">ประเมิน {qa.assessed} · โชว์รูม {qa.showroom}</div>
              {(qa.r2 || qa.r3) && (
                <div className="text-[11px] mt-2 flex flex-wrap gap-1">
                  {qa.r2 && <Badge tone={qa.r2.includes("⚠️") ? "amber" : "emerald"}>R2 {qa.r2.replace(/⚠️|✅/g, "").trim()}</Badge>}
                  {qa.r3 && <Badge tone={qa.r3.includes("⚠️") ? "amber" : "emerald"}>R3 {qa.r3.replace(/⚠️|✅/g, "").trim()}</Badge>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <label className="relative block flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
            <input aria-label="ค้นหาคิวงาน" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา ชื่อลูกค้า / เซลล์ / ที่อยู่ / วันที่…"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
          </label>
          <span className="text-sm text-ink-3 tabular-nums">{rows.length} คิว</span>
        </div>

        {err ? (
          <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span>{err}</span>
            <button onClick={load} className="press font-semibold text-red-800 underline shrink-0">ลองใหม่</button>
          </div>
        ) : loading && !data ? (
          <p className="text-center text-ink-3 py-12">กำลังโหลดคิวงาน…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-ink-3 py-12">{q ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีคิวงาน"}</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-3 text-xs border-b border-gray-200/70">
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">วัน/เวลา</th>
                    <th className="px-3 py-2 font-semibold">เซลล์</th>
                    <th className="px-3 py-2 font-semibold">ลูกค้า</th>
                    <th className="px-3 py-2 font-semibold">ที่อยู่</th>
                    <th className="px-3 py-2 font-semibold">แผนที่</th>
                    <th className="px-3 py-2 font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ r, i }) => (
                    <tr key={i} className="border-b border-gray-200/60 last:border-0 hover:bg-white/50 align-top">
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">
                        <div className="font-medium text-brand-dark">{cell(r[idx.date])}</div>
                        <div className="text-xs text-ink-3">{cell(r[idx.dow])} · {cell(r[idx.time])}</div>
                        {idx.type >= 0 && (r[idx.type] ?? "").trim() && <div className="text-xs text-sky-700">{r[idx.type]}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{cell(r[idx.sales])}</td>
                      <td className="px-3 py-2.5 text-ink-2">
                        <div className="font-medium">{cell(r[idx.customer])}</div>
                        <div className="text-xs text-ink-3">
                          {idx.tel >= 0 && (r[idx.tel] ?? "").trim() ? r[idx.tel] : ""}
                          {idx.channel >= 0 && (r[idx.channel] ?? "").trim() ? ` · ${r[idx.channel]}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2 max-w-[320px]">{cell(r[idx.address])}</td>
                      <td className="px-3 py-2.5"><MapLink url={r[idx.location] ?? ""} /></td>
                      <td className="px-3 py-2.5">
                        {(r[idx.status] ?? "").trim()
                          ? <Badge tone={statusTone(r[idx.status] ?? "")} dot>{r[idx.status]}</Badge>
                          : <span className="text-ink-3">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet cards */}
            <div className="lg:hidden space-y-3">
              {rows.map(({ r, i }) => (
                <div key={i} className="glass-soft rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand-dark">{cell(r[idx.customer])}</span>
                    {(r[idx.status] ?? "").trim() ? <Badge tone={statusTone(r[idx.status] ?? "")} dot>{r[idx.status]}</Badge> : null}
                  </div>
                  <div className="text-xs text-ink-3 mt-1">
                    {cell(r[idx.dow])} {cell(r[idx.date])} · {cell(r[idx.time])} · เซลล์ {cell(r[idx.sales])}
                    {idx.type >= 0 && (r[idx.type] ?? "").trim() ? ` · ${r[idx.type]}` : ""}
                  </div>
                  {idx.tel >= 0 && (r[idx.tel] ?? "").trim() ? <div className="text-sm text-ink-2 mt-1">{r[idx.tel]}</div> : null}
                  {idx.address >= 0 && (r[idx.address] ?? "").trim() ? <div className="text-sm text-ink-2 mt-1">{r[idx.address]}</div> : null}
                  <div className="mt-2"><MapLink url={r[idx.location] ?? ""} /></div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {adding && data && (
        <AddQueueModal
          queue={queue} leave={leave} quota={quota} salesList={sales}
          sheetUrl={sheetUrl} onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
