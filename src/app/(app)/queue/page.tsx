"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";

type QueueData = { headers: string[]; rows: string[][] };

const isUrl = (v: string) => /^https?:\/\//i.test(v.trim());
const isMapUrl = (v: string) => /(maps\.app\.goo\.gl|google\.[^/]+\/maps)/i.test(v);

// เลือก tone ของ Badge ตามข้อความสถานะ
function statusTone(v: string): "emerald" | "amber" | "sky" | "gray" {
  if (/เสร็จ|จัดแล้ว|อนุมัติ|ชำระ/.test(v)) return "emerald";
  if (/รอ|ค้าง|pending/i.test(v)) return "amber";
  if (/ยกเลิก|ปัญหา/.test(v)) return "gray";
  return "sky";
}

export default function QueuePage() {
  const [data, setData] = useState<QueueData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setData(json.data as QueueData);
      setFetchedAt((json.meta?.fetched_at as string) ?? new Date().toISOString());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const headers = data?.headers ?? [];
  const statusIdx = headers.findIndex((h) => /สถานะ/.test(h));
  const rows = (data?.rows ?? []).filter((r) =>
    q.trim() === "" ? true : r.join(" ").toLowerCase().includes(q.trim().toLowerCase())
  );

  const fetchedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  function renderCell(value: string, colIdx: number) {
    const v = value ?? "";
    if (isUrl(v)) {
      return (
        <a href={v} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-brand font-medium hover:underline">
          <Icon name={isMapUrl(v) ? "pin" : "external"} size={14} />
          {isMapUrl(v) ? "แผนที่" : "ลิงก์"}
        </a>
      );
    }
    if (colIdx === statusIdx && v.trim() !== "") {
      return <Badge tone={statusTone(v)} dot>{v}</Badge>;
    }
    return v.trim() === "" ? <span className="text-ink-3">—</span> : v;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calendar" size={18} />
          </span>
          คิวงาน
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3 hidden sm:inline">
            อัปเดตล่าสุด: {loading ? "กำลังโหลด…" : fetchedLabel}
          </span>
          <button onClick={load} disabled={loading}
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
            <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "กำลังรีเฟรช…" : "รีเฟรช"}
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <label className="relative block flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
            <input aria-label="ค้นหาคิวงาน" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา ชื่อลูกค้า / เซลล์ / ที่อยู่ / วันที่…"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
          </label>
          <span className="text-sm text-ink-3 tabular-nums">{rows.length} รายการ</span>
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
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-gray-200/60 last:border-0 hover:bg-white/50 align-top">
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-2.5 text-ink-2">{renderCell(r[ci], ci)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet cards */}
            <div className="lg:hidden space-y-3">
              {rows.map((r, ri) => (
                <div key={ri} className="glass-soft rounded-xl p-3.5 space-y-1.5">
                  {headers.map((h, ci) =>
                    (r[ci] ?? "").trim() === "" ? null : (
                      <div key={ci} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-ink-3 shrink-0">{h}</span>
                        <span className="text-ink-2 text-right break-words min-w-0">{renderCell(r[ci], ci)}</span>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
