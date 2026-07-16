"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus } from "@/components/ui/icons";

/**
 * ใบตัดของ "งานนี้" — โชว์ในหน้างาน/โมดัลผลิต (เจ้าของสั่ง: "บันทึกในข้อมูลชื่อลูกค้า")
 * เดิมใบตัดผูก job_id อยู่แล้ว แต่เปิดได้จากเมนูใบตัดที่เดียว ต้องไล่หาเอง
 */
type Row = { id: number; code: string | null; name: string; status: string; created_at: string; stock_cut_at: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "ร่าง",        cls: "bg-white/10 text-white/70" },
  stock_cut: { label: "ตัดสต็อกแล้ว", cls: "bg-emerald-500/20 text-emerald-200" },
};

export default function JobCutlists({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const key = ["job-cutlists", jobId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api.get<Row[]>(`/cutlists?job_id=${jobId}`),
  });
  const rows = data?.data ?? [];
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  async function create(fromJob: boolean) {
    setBusy(true); setErrMsg("");
    try {
      const r = await api.post<{ id: number }>("/cutlists", { job_id: jobId, from_job: fromJob });
      qc.invalidateQueries({ queryKey: key });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (r as any).meta;
      const skipped: string[] = meta?.skipped ?? [];
      if (skipped.length) alert(`สร้างแล้ว แต่มี ${skipped.length} ข้อที่ยังไม่มีสูตรตัด (ต้องกรอกมือ):\n• ${skipped.join("\n• ")}`);
      window.location.href = `/cutlist/${r.data.id}`;
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "สร้างใบตัดไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-base font-semibold text-white">ใบตัดอลู / BOQ</span>
        <Link href="/cutlist" className="text-[12px] text-sky-300/80 underline shrink-0">ดูทั้งหมด</Link>
      </div>

      {isLoading ? (
        <div className="text-[13px] py-2" style={{ color: "var(--t-low)" }}>กำลังโหลด…</div>
      ) : error ? (
        <div className="text-[12.5px] text-amber-100 bg-amber-500/15 border border-amber-300/30 rounded-lg px-3 py-2">
          {error instanceof Error ? error.message : "โหลดใบตัดไม่สำเร็จ"}
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="text-[13px] py-1.5 mb-2" style={{ color: "var(--t-low)" }}>ยังไม่มีใบตัดของงานนี้</div>
          ) : (
            <div className="space-y-1.5 mb-2.5">
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, cls: "bg-white/10 text-white/70" };
                return (
                  <Link key={r.id} href={`/cutlist/${r.id}`}
                    className="flex items-center justify-between gap-2 bg-white/6 border border-white/10 rounded-lg px-2.5 py-2 hover:bg-white/10">
                    <span className="min-w-0">
                      <span className="font-mono text-[13px] text-white">{r.code || `CL-${r.id}`}</span>
                      {r.name && <span className="text-[12.5px] text-white/60 ml-2 truncate">{r.name}</span>}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => create(true)} disabled={busy}
                className="focusable pressable inline-flex items-center gap-1 text-[13px] bg-sky-500/80 hover:bg-sky-400 text-white rounded-lg px-2.5 py-2 min-h-[38px] disabled:opacity-50">
                <Plus size={14} /> สร้างจากใบเสนอ
              </button>
              <button onClick={() => create(false)} disabled={busy}
                className="focusable pressable text-[13px] bg-white/10 hover:bg-white/16 text-white/85 rounded-lg px-2.5 py-2 min-h-[38px] disabled:opacity-50">
                + ใบเปล่า
              </button>
            </div>
          )}
          {errMsg && (
            <div role="alert" className="mt-2 text-[12px] text-rose-200 bg-rose-900/40 border border-rose-500/30 rounded-lg px-2.5 py-2">{errMsg}</div>
          )}
        </>
      )}
    </div>
  );
}
