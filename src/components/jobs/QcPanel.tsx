"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Spinner } from "@/components/ui/primitives";

type QC = {
  id: string; stage: "FACTORY" | "INSTALL" | "CUSTOMER"; result: "PASSED" | "FAILED";
  defects: string | null; photo_url: string | null; checked_at: string;
  checker: { full_name: string | null } | null;
};
const STAGE: Record<string, string> = { FACTORY: "โรงงาน", INSTALL: "หน้างาน", CUSTOMER: "ลูกค้าตรวจ" };

export function QcPanel({ jobId }: { jobId: string }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["qc", jobId], queryFn: () => api.get<QC[]>(`/qc?job_id=${jobId}`) });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;

  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState("FACTORY");
  const [result, setResult] = useState("PASSED");
  const [defects, setDefects] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await api.post("/qc", { job_id: jobId, stage, result, defects: defects || undefined });
      setAdding(false); setDefects(""); setResult("PASSED"); setStage("FACTORY"); refetch();
    } finally { setBusy(false); }
  }
  const fld = "focusable w-full glass-card rounded-lg px-3 py-2 text-sm text-white outline-none min-h-[40px] placeholder-white/40 [&>option]:text-gray-800";

  if (isLoading) return <Spinner />;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">QC / ตรวจงาน ({rows.length})</span>
        {canWrite && !adding && <button onClick={() => setAdding(true)} className="focusable pressable text-[12px] bg-white/15 text-white rounded-lg px-3 py-1.5 min-h-[34px]">+ บันทึกผลตรวจ</button>}
      </div>
      {adding && (
        <div className="glass-card rounded-xl p-3 space-y-2 mb-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={fld}>{Object.entries(STAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={result} onChange={(e) => setResult(e.target.value)} className={fld}><option value="PASSED">ผ่าน</option><option value="FAILED">ไม่ผ่าน</option></select>
          </div>
          <input value={defects} onChange={(e) => setDefects(e.target.value)} placeholder="ข้อบกพร่อง/หมายเหตุ (ถ้ามี)" className={fld} />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="focusable pressable flex-1 glass-card text-white rounded-lg px-3 py-2 text-sm min-h-[40px]">ยกเลิก</button>
            <button onClick={add} disabled={busy} className="focusable pressable flex-1 bg-emerald-500/90 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 min-h-[40px]">บันทึก</button>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {rows.length === 0 && !adding && <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ยังไม่มีผลตรวจ</div>}
        {rows.map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-2 bg-white/8 border border-white/10 rounded-xl px-3 py-2">
            <div>
              <span className="text-[13px] text-white">{STAGE[q.stage]}</span>
              {q.defects && <div className="text-[12px] mt-0.5" style={{ color: "var(--t-low)" }}>{q.defects}</div>}
              <div className="text-[11px] mt-0.5" style={{ color: "var(--t-low)" }}>{thDate(q.checked_at)}{q.checker?.full_name ? ` · ${q.checker.full_name}` : ""}</div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${q.result === "PASSED" ? "bg-emerald-500/25 text-emerald-100 border-emerald-300/30" : "bg-rose-500/25 text-rose-100 border-rose-300/30"}`}>{q.result === "PASSED" ? "ผ่าน" : "ไม่ผ่าน"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
