"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip } from "@/components/ui/primitives";
import { X, Check, TriangleAlert } from "@/components/ui/icons";
import type { ProdStatus } from "@/lib/database.types";

export type ProdRow = {
  id: string; status: ProdStatus;
  measure_actual: string | null; planned_install_date: string | null;
  production_queued: string | null; production_done: string | null;
  qc_result: "PASSED" | "FAILED" | null; qc_date: string | null; qc_note: string | null;
  job: { job_code: string; customer_name: string; customer_area: string | null } | null;
};

// ลำดับขั้นงานผลิต (happy path)
const FLOW: ProdStatus[] = ["PENDING_MEASURE", "MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM", "QUEUED", "MANUFACTURING", "QC", "READY"];

type StepField = { field: string; label: string; type?: "date" | "qc" | "note" };
const DATE_FOR: Partial<Record<ProdStatus, StepField[]>> = {
  MEASURED: [{ field: "measure_actual", label: "วันวัดจริง" }],
  QUEUED:   [{ field: "production_queued", label: "วันลงคิวผลิต" }],
  QC:       [{ field: "production_done", label: "วันผลิตเสร็จ" }],
  READY: [
    { field: "qc_result", label: "ผลตรวจ QC", type: "qc" },
    { field: "qc_date",   label: "วันตรวจ QC" },
    { field: "qc_note",   label: "หมายเหตุ QC (ไม่บังคับ)", type: "note" },
  ],
};

const today = () => new Date().toISOString().slice(0, 10);

export function ProductionStepModal({ prod, canWrite, onClose, onSaved }: {
  prod: ProdRow; canWrite: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problem, setProblem] = useState("");

  const idx = FLOW.indexOf(prod.status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const nextFields = next ? (DATE_FOR[next] ?? []) : [];

  const [vals, setVals] = useState<Record<string, string>>({});

  useEffect(() => {
    const init: Record<string, string> = {};
    nextFields.forEach(f => {
      if (!f.type || f.type === "date") init[f.field] = today();
    });
    setVals(init);
    setErr(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const patch = async (body: Record<string, unknown>) => {
    setErr(null); setSaving(true);
    try { await api.patch(`/production/${prod.id}`, body); onSaved(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const goNext = () => {
    if (!next) return;
    if (next === "READY" && !vals.qc_result) {
      setErr("กรุณาเลือกผลตรวจ QC"); return;
    }
    const body: Record<string, unknown> = { status: next, ...vals };
    // กรอง field ว่างออก (note ไม่บังคับ)
    Object.keys(body).forEach(k => { if (body[k] === "") delete body[k]; });
    patch(body);
  };

  const reportProblem = () => {
    if (!problem.trim()) { setErr("กรุณาพิมพ์ปัญหาที่เจอ"); return; }
    patch({ status: "ISSUE", notes: problem });
  };

  const big = "min-h-[54px] rounded-2xl text-base font-semibold";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`อัปเดตงาน ${prod.job?.job_code}`}>
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 fade-in max-h-[92dvh] overflow-y-auto">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-white font-bold text-xl tnum">{prod.job?.job_code}</div>
            <div className="text-sm truncate" style={{ color: "var(--t-mid)" }}>{prod.job?.customer_name} · {prod.job?.customer_area ?? "—"}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10 shrink-0"><X size={22} /></button>
        </div>

        {/* สถานะตอนนี้ */}
        <div className="text-center py-2">
          <div className="text-[13px] mb-1.5" style={{ color: "var(--t-low)" }}>ตอนนี้อยู่ขั้น</div>
          <div className="inline-block scale-125"><Chip>{PROD_STATUS[prod.status]}</Chip></div>
        </div>

        {!canWrite ? (
          <p className="text-center text-sm mt-4" style={{ color: "var(--t-low)" }}>บทบาทนี้ดูได้อย่างเดียว</p>
        ) : (
          <>
            {/* ปุ่มใหญ่: ทำขั้นต่อไป */}
            {next ? (
              <div className="mt-4 glass-card rounded-2xl p-4">
                {nextFields.map(f => (
                  <div key={f.field} className="mb-3">
                    <label className="block text-[13px] mb-1.5 font-medium text-white">{f.label}</label>

                    {/* QC toggle */}
                    {f.type === "qc" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setVals(v => ({ ...v, [f.field]: "PASSED" }))}
                          className={`focusable pressable flex-1 min-h-[48px] rounded-xl text-sm font-semibold border transition-colors
                            ${vals[f.field] === "PASSED"
                              ? "bg-emerald-500 border-emerald-400 text-white"
                              : "glass-card border-white/10 text-white/70 hover:border-emerald-400/50"}`}
                        >
                          ผ่าน
                        </button>
                        <button
                          type="button"
                          onClick={() => setVals(v => ({ ...v, [f.field]: "FAILED" }))}
                          className={`focusable pressable flex-1 min-h-[48px] rounded-xl text-sm font-semibold border transition-colors
                            ${vals[f.field] === "FAILED"
                              ? "bg-rose-500 border-rose-400 text-white"
                              : "glass-card border-white/10 text-white/70 hover:border-rose-400/50"}`}
                        >
                          ไม่ผ่าน
                        </button>
                      </div>
                    )}

                    {/* textarea note */}
                    {f.type === "note" && (
                      <textarea
                        value={vals[f.field] ?? ""}
                        onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value }))}
                        rows={2}
                        placeholder="ระบุหมายเหตุ (ถ้ามี)"
                        aria-label={f.label}
                        className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40"
                      />
                    )}

                    {/* date input (type=date หรือ undefined = date) */}
                    {(!f.type || f.type === "date") && (
                      <input
                        type="date"
                        value={vals[f.field] ?? ""}
                        onChange={e => setVals(v => ({ ...v, [f.field]: e.target.value }))}
                        aria-label={f.label}
                        className="focusable w-full glass-card rounded-xl px-4 py-3 text-base text-white outline-none tnum min-h-[52px] [&::-webkit-calendar-picker-indicator]:invert"
                      />
                    )}
                  </div>
                ))}

                <button onClick={goNext} disabled={saving}
                  className={`focusable pressable w-full ${big} bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2`}>
                  {saving ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={22} />}
                  ทำเสร็จ → {PROD_STATUS[next]}
                </button>
              </div>
            ) : (
              <div className="mt-4 bg-emerald-500/15 border border-emerald-300/30 rounded-2xl p-4 text-center">
                <div className="text-emerald-200 font-semibold">พร้อมติดตั้งแล้ว</div>
                <div className="text-[12px] mt-1" style={{ color: "var(--t-mid)" }}>งานนี้ส่งเข้าทีมติดตั้งอัตโนมัติแล้ว</div>
              </div>
            )}

            {/* แจ้งปัญหา */}
            {!problemOpen ? (
              <button onClick={() => setProblemOpen(true)} className="focusable pressable w-full mt-3 min-h-[48px] rounded-2xl border border-amber-300/30 bg-amber-500/12 text-amber-100 font-medium flex items-center justify-center gap-2">
                <TriangleAlert size={18} /> งานนี้มีปัญหา
              </button>
            ) : (
              <div className="mt-3 glass-card rounded-2xl p-4 border border-amber-300/25">
                <label className="block text-[13px] mb-1.5 font-medium text-amber-100">เจอปัญหาอะไร?</label>
                <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={2} placeholder="เช่น กระจกมาผิดขนาด รออะไหล่"
                  className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setProblemOpen(false)} className="focusable pressable flex-1 glass-card text-white rounded-xl py-2.5 text-sm min-h-[44px]">ยกเลิก</button>
                  <button onClick={reportProblem} disabled={saving} className="focusable pressable flex-1 bg-amber-500 hover:bg-amber-400 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60">ส่งแจ้งปัญหา</button>
                </div>
              </div>
            )}

            {/* ประวัติการทำงาน */}
            {(prod.measure_actual || prod.production_queued || prod.production_done || prod.qc_result) && (
              <div className="mt-4 text-[12px] space-y-1" style={{ color: "var(--t-low)" }}>
                {prod.measure_actual   && <div>วัดจริง: <span className="tnum text-white/80">{thDate(prod.measure_actual)}</span></div>}
                {prod.production_queued && <div>ลงคิวผลิต: <span className="tnum text-white/80">{thDate(prod.production_queued)}</span></div>}
                {prod.production_done  && <div>ผลิตเสร็จ: <span className="tnum text-white/80">{thDate(prod.production_done)}</span></div>}
                {prod.qc_result && (
                  <div>
                    QC:{" "}
                    <span className={prod.qc_result === "PASSED" ? "text-emerald-300" : "text-rose-300"}>
                      {prod.qc_result === "PASSED" ? "ผ่าน" : "ไม่ผ่าน"}
                    </span>
                    {prod.qc_date && <span className="tnum text-white/70"> · {thDate(prod.qc_date)}</span>}
                  </div>
                )}
                {prod.qc_note && <div className="text-white/60">หมายเหตุ: {prod.qc_note}</div>}
              </div>
            )}

            {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}
