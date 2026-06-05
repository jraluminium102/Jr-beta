"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { X, TriangleAlert } from "@/components/ui/icons";
import type { ClosureRow } from "@/app/api/sales-closure/route";

// ─── Confirm modal for "ส่งไปแก้แบบ" ────────────────────────────────────────

function ReviseModal({
  job,
  onClose,
  onDone,
}: {
  job: ClosureRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Close on Escape
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  const handleRevise = async () => {
    setBusy(true);
    setErr(null);
    try {
      // 1) Set design_state → REVISING (ส่งงานเข้าบอร์ด designer + นับรอบแก้)
      await api.patch(`/designer/${job.id}`, { state: "REVISING", note: "ส่งแก้แบบจากหน้าปิดการขาย" });

      // 2) If current_stage = 6 (เจรจาราคา) → loop back to 5 (ทำใบเสนอราคา)
      //    advance_stage RPC whitelist already allows 6→5
      if (job.current_stage === 6) {
        await api.post(`/jobs/${job.id}/advance`, { to: 5, note: "ส่งแก้แบบ — ย้อนกลับขั้น 5" });
      }

      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revise-title"
      onKeyDown={handleKey}
    >
      {/* Scrim */}
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />

      <div className="relative w-full max-w-sm glass rounded-3xl p-6 fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 shrink-0">
              <TriangleAlert size={18} />
            </span>
            <h2 id="revise-title" className="text-base font-bold text-white">
              ยืนยันส่งแก้แบบ?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Job info */}
        <div className="glass-card rounded-xl px-4 py-3 mb-4 space-y-1">
          <div className="text-[12px]" style={{ color: "var(--t-low)" }}>งาน</div>
          <div className="text-white font-semibold tnum">
            {job.job_code ?? "—"} · {job.customer_name}
          </div>
          <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>
            ขั้นปัจจุบัน: {job.stage_name}
          </div>
        </div>

        {/* What will happen */}
        <ul className="text-[13px] space-y-1.5 mb-5" style={{ color: "var(--t-mid)" }}>
          <li>• ตั้งสถานะงานแบบเป็น <span className="text-amber-300 font-medium">REVISING</span> (นับรอบแก้)</li>
          <li>• งานเข้าบอร์ด Designer ทันที</li>
          {job.current_stage === 6 && (
            <li>• ย้อนขั้นกลับไป <span className="text-sky-300 font-medium">ขั้น 5 (ทำใบเสนอราคา)</span></li>
          )}
        </ul>

        {/* Error */}
        {err && (
          <div className="mb-4 rounded-xl bg-rose-500/20 border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200">
            {err}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="focusable pressable flex-1 rounded-xl py-2.5 text-sm font-medium glass-card text-white/70 hover:text-white min-h-[44px] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleRevise}
            disabled={busy}
            className="focusable pressable flex-1 rounded-xl py-2.5 text-sm font-semibold bg-amber-400/90 hover:bg-amber-400 text-amber-950 min-h-[44px] disabled:opacity-60"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-900/40 border-t-amber-900 animate-spin" />
                กำลังส่ง…
              </span>
            ) : (
              "ยืนยัน ส่งแก้แบบ"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action buttons cell (rendered per row) ──────────────────────────────────

export function ClosureActions({
  job,
  onRevised,
}: {
  job: ClosureRow;
  onRevised: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!job.can_revise) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[36px] transition"
        aria-label={`ส่งงาน ${job.job_code ?? ""} แก้แบบ`}
      >
        <TriangleAlert size={13} />
        ส่งแก้แบบ
      </button>

      {modalOpen && (
        <ReviseModal
          job={job}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            setModalOpen(false);
            onRevised();
          }}
        />
      )}
    </>
  );
}
