"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { STAGE_NAMES, STAGE_GROUP, stageName, nextStage, loopTarget, isDone } from "@/lib/stages";

// ปุ่ม "ไปขั้นต่อไป" ของ state machine 24 stage — แสดงในทุกหน้าที่เปิดงาน
// reuse RPC advance_stage (validate forward+1/loop ที่ DB) · sync jobs.status ให้ flow เดิม
export function StageAdvanceButton({ jobId, currentStage, onAdvanced }: {
  jobId: string; currentStage: number; onAdvanced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const next = nextStage(currentStage);
  const loop = loopTarget(currentStage);
  // ขั้นที่ต้องทำผ่านฟอร์มเฉพาะ (ระบบเลื่อน stage ให้อัตโนมัติด้วย trigger) — ห้าม advance ตรง
  const nextForm = next === 8 ? "บันทึกมัดจำในหน้านี้ (กรอกยอด+วันมัดจำ) — ระบบจะเลื่อนไป “รอวัดจริง” ให้อัตโนมัติ"
    : next === 20 ? "ตั้งสถานะ Production เป็น “พร้อมติดตั้ง” ในแท็บ Production — ระบบจะเปิดงานติดตั้ง + เลื่อนขั้นให้"
    : null;

  async function go(to: number) {
    setBusy(true); setErr("");
    try { await api.post(`/jobs/${jobId}/advance`, { to }); onAdvanced(); }
    catch (e) { setErr(e instanceof Error ? e.message : "เปลี่ยนขั้นไม่สำเร็จ"); setBusy(false); }
  }

  return (
    <div className="glass-card rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[11px]" style={{ color: "var(--t-low)" }}>ขั้นตอนปัจจุบัน · {STAGE_GROUP[currentStage]}</div>
          <div className="text-white font-semibold text-sm">
            <span className="tnum">{currentStage}/24</span> · {stageName(currentStage)}
          </div>
        </div>
        {isDone(currentStage) && <span className="text-[12px] px-2 py-1 rounded-full bg-emerald-500/25 text-emerald-100 border border-emerald-300/30">จบงานแล้ว</span>}
      </div>

      {!isDone(currentStage) && nextForm && (
        <div className="text-[12px] rounded-lg bg-sky-500/15 border border-sky-300/25 text-sky-100 px-3 py-2">
          ➜ ขั้นต่อไป ({STAGE_NAMES[next!]}): {nextForm}
        </div>
      )}

      {!isDone(currentStage) && !nextForm && (
        <div className="flex flex-wrap gap-2">
          {next && (
            <button onClick={() => go(next)} disabled={busy}
              className="focusable pressable flex-1 min-w-[180px] inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#1F4E78" }}>
              {busy ? "กำลังทำ…" : `ไปขั้นต่อไป → ${STAGE_NAMES[next]}`}
            </button>
          )}
          {loop && (
            <button onClick={() => go(loop)} disabled={busy}
              className="focusable pressable inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-white/80 border border-white/20 hover:bg-white/10 disabled:opacity-60">
              ↩ ย้อน: {STAGE_NAMES[loop]}
            </button>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-[12px] text-rose-200">{err}</p>}
    </div>
  );
}
