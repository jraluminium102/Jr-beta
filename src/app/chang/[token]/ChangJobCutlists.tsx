"use client";
import { useCallback, useEffect, useState } from "react";
import { IOS } from "@/app/(app)/(oms)/production-schedule/page";

/**
 * ใบตัดอลูของงานนี้ — ในลิงก์ช่าง (ไม่ต้องล็อกอิน)
 * ช่างเปิด/สร้าง/แก้ได้ · ตัดสต็อกไม่ได้ (ดู src/lib/cutlist/actor.ts)
 * ใช้ /api/cutlists ตัวเดียวกับออฟฟิศ แค่แนบ x-chang-token
 */
type Row = { id: number; code: string | null; name: string; status: string };

export default function ChangJobCutlists({ token, jobId }: { token: string; jobId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const headers = useCallback((extra?: Record<string, string>) => {
    let who = "";
    try { who = localStorage.getItem("chang_name") || ""; } catch { /* ignore */ }
    // encode ก่อนใส่ header — ชื่อไทยดิบ ๆ ทำ fetch throw (header รับแค่ ISO-8859-1)
    return { ...(extra ?? {}), "x-chang-token": token, "x-chang-name": encodeURIComponent(who) };
  }, [token]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/cutlists?job_id=${jobId}`, { headers: headers(), cache: "no-store" });
      const j = await r.json();
      if (r.ok) setRows(j.data ?? []);
    } catch { /* เงียบไว้ — ใบตัดเป็นของเสริมในการ์ด ไม่ควรทำให้ทั้งการ์ดพัง */ }
  }, [jobId, headers]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/cutlists", {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ job_id: jobId, from_job: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "สร้างใบตัดไม่สำเร็จ");
      window.location.href = `/chang/${token}/cutlist/${j.data.id}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างใบตัดไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[12px] px-3 py-2.5" style={{ background: IOS.inset }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold" style={{ color: IOS.ink2 }}>✂️ ใบตัดอลู</span>
        {rows.length === 0 && (
          <button onClick={create} disabled={busy}
            className="rounded-[9px] px-2.5 py-1.5 text-[12px] font-semibold text-white min-h-[34px] disabled:opacity-50"
            style={{ background: IOS.blue }}>
            + สร้างใบตัด
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {rows.map((c) => (
            <a key={c.id} href={`/chang/${token}/cutlist/${c.id}`}
              className="flex items-center justify-between gap-2 rounded-[9px] px-2.5 py-2 bg-white"
              style={{ border: `1px solid ${IOS.line}` }}>
              <span className="text-[13px] font-semibold tnum" style={{ color: IOS.blue }}>{c.code || `CL-${c.id}`}</span>
              <span className="text-[11px]" style={{ color: c.status === "stock_cut" ? IOS.green : IOS.ink3 }}>
                {c.status === "stock_cut" ? "ตัดสต็อกแล้ว" : "ร่าง"}
              </span>
            </a>
          ))}
        </div>
      )}
      {err && <p className="text-[11.5px] mt-1.5" style={{ color: IOS.red }}>{err}</p>}
    </div>
  );
}
