"use client";
import { useState } from "react";
import { api } from "@/lib/api";

/**
 * CutlistChip — ชิปใบตัดบนการ์ดงานผลิต (ใช้ร่วมหน้าผลิตออฟฟิศ + ลิงก์ช่าง)
 * โชว์ใบตัดของงานนั้น (กดเปิดได้) + ปุ่ม "+ ใบตัด" สร้างใหม่ผูกงานลูกค้าให้เลย
 * รู้เองว่าอยู่หน้าช่าง (/chang/<token>) หรือออฟฟิศ จาก pathname (แนวเดียวกับ api.ts)
 *   ช่าง → /chang/<token>/cutlist/<id> · ออฟฟิศ → /cutlist/<id>
 */
export type CutBrief = { id: number; code: string | null; name: string; status: string };

function changTokenFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/chang\/([^/]+)/);
  return m ? m[1] : null;
}

export default function CutlistChip({ jobId, customerName, cutlists, canWrite }: {
  jobId: string | null;
  customerName: string;
  cutlists?: CutBrief[];
  canWrite: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const cuts = cutlists ?? [];
  const token = changTokenFromPath();
  const href = (id: number) => (token ? `/chang/${token}/cutlist/${id}` : `/cutlist/${id}`);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const create = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!jobId || busy) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>("/cutlists", { job_id: jobId, name: customerName || "ใบตัด" });
      window.location.href = href(r.data.id);
    } catch {
      setBusy(false);
    }
  };

  const linkCls = "text-[11px] rounded-md px-1.5 py-0.5 font-medium tnum inline-flex items-center gap-0.5";

  if (cuts.length === 0) {
    if (!canWrite || !jobId) return null;
    return (
      <button type="button" onClick={create} disabled={busy}
        className={`${linkCls} disabled:opacity-50`}
        style={{ background: "#eef6ff", color: "#0a63c9", border: "1px solid #cfe4ff" }}>
        ✂️ + ใบตัด
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 flex-wrap" onClick={stop}>
      {cuts.map((c) => (
        <a key={c.id} href={href(c.id)} onClick={stop} className={linkCls}
          style={c.status === "stock_cut"
            ? { background: "#e8f8ee", color: "#1a7d4f", border: "1px solid #bfe8cf" }
            : { background: "#eef6ff", color: "#0a63c9", border: "1px solid #cfe4ff" }}>
          ✂️ {c.code || `CL-${c.id}`}{c.status === "stock_cut" ? " ✓" : ""}
        </a>
      ))}
      {canWrite && jobId && (
        <button type="button" onClick={create} disabled={busy}
          className="text-[11px] rounded-md px-1.5 py-0.5 font-bold disabled:opacity-50"
          style={{ background: "#f1f1f4", color: "#636366" }}>+</button>
      )}
    </span>
  );
}
