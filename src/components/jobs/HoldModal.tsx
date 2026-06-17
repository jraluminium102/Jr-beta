"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";

// ────────────────────────────────────────────────────────────────────────────
// เหตุผลพักงาน
// ────────────────────────────────────────────────────────────────────────────
const PRESET_REASONS = [
  "ไม่จ่ายค่าประเมิน",
  "ลูกค้าขอยกเลิกกลางคัน",
  "อื่นๆ",
] as const;

type PresetReason = (typeof PRESET_REASONS)[number];

// ────────────────────────────────────────────────────────────────────────────
// Props
// zone: 'light' = หน้า designer/quotation-checklist (glass-soft บน light bg)
//       'dark'  = หน้า follow-up/ปิดการขาย (glass-dark บน dark bg)
// ────────────────────────────────────────────────────────────────────────────
type Props = {
  jobId: string;
  jobCode?: string | null;
  customerName?: string;
  onDone: () => void;
  onClose: () => void;
  zone?: "light" | "dark";
};

export function HoldModal({
  jobId,
  jobCode,
  customerName,
  onDone,
  onClose,
  zone = "dark",
}: Props) {
  const [preset, setPreset] = useState<PresetReason>("ไม่จ่ายค่าประเมิน");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ปิดด้วย Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const finalReason = preset === "อื่นๆ" ? custom.trim() : preset;

  async function handleConfirm() {
    if (!finalReason) { setErrMsg("กรุณาระบุเหตุผลพักงาน"); return; }
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: finalReason }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "พักงานไม่สำเร็จ");
      onDone();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "พักงานไม่สำเร็จ");
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  const card =
    zone === "light"
      ? "relative w-full max-w-sm glass rounded-3xl p-6 fade-in text-ink"
      : "relative w-full max-w-sm glass-dark rounded-3xl p-6 fade-in text-white";

  const textMid =
    zone === "light" ? "text-ink-3" : "text-white/60";

  const labelCls =
    zone === "light"
      ? "text-sm font-medium text-ink-2"
      : "text-sm font-medium text-white/80";

  const inputCls =
    zone === "light"
      ? "w-full rounded-xl px-3 py-2.5 text-sm glass-soft outline-none focus:ring-2 focus:ring-brand/40 text-ink resize-none placeholder-ink-3"
      : "w-full rounded-xl px-3 py-2.5 text-sm glass-card text-white outline-none focus:ring-2 focus:ring-white/30 resize-none placeholder-white/35";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="พักงาน (HOLD)"
    >
      {/* backdrop */}
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />

      <div className={card}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0 bg-amber-400/20 text-amber-400">
              <Icon name="warn" size={18} />
            </span>
            <h2 className="text-base font-bold">พักงาน (HOLD)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl hover:bg-white/10 shrink-0"
            style={{ color: zone === "light" ? "var(--ink-3)" : "rgba(255,255,255,0.6)" }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Job info */}
        {(jobCode || customerName) && (
          <div className={`rounded-xl px-4 py-3 mb-4 space-y-0.5 ${zone === "light" ? "glass-soft" : "glass-card"}`}>
            <div className={`text-[12px] ${textMid}`}>งาน</div>
            <div className={`font-semibold tnum text-sm ${zone === "light" ? "text-ink" : "text-white"}`}>
              {[jobCode, customerName].filter(Boolean).join(" · ")}
            </div>
          </div>
        )}

        {/* Description */}
        <p className={`text-[13px] mb-4 ${textMid}`}>
          งานจะหายจาก active ไปอยู่หมวด "พัก (HOLD)" ทุกหน้า<br />
          ข้อมูลครบถ้วน — กด "เอากลับมาทำ" ได้ตลอด
        </p>

        {/* เหตุผล */}
        <div className="space-y-3 mb-4">
          <label className={labelCls}>เหตุผลพักงาน</label>
          <div className="space-y-2">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setPreset(r)}
                className={[
                  "focusable pressable w-full text-left rounded-xl px-3.5 py-2.5 text-sm border transition-all min-h-[44px]",
                  preset === r
                    ? zone === "light"
                      ? "border-amber-500 bg-amber-50 text-amber-800 font-semibold"
                      : "border-amber-400/60 bg-amber-400/20 text-amber-200 font-semibold"
                    : zone === "light"
                    ? "border-gray-200/70 glass-soft text-ink-2 hover:border-amber-300"
                    : "border-white/15 glass-card text-white/70 hover:bg-white/10",
                ].join(" ")}
              >
                {r}
              </button>
            ))}
          </div>

          {/* textarea เฉพาะ "อื่นๆ" */}
          {preset === "อื่นๆ" && (
            <textarea
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              rows={3}
              autoFocus
              placeholder="ระบุเหตุผล…"
              className={inputCls}
            />
          )}
        </div>

        {/* Error */}
        {errMsg && (
          <div className="mb-3 rounded-xl bg-rose-500/20 border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200">
            {errMsg}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`focusable pressable flex-1 rounded-xl py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50 ${
              zone === "light"
                ? "glass-soft text-ink-2 hover:text-ink border border-gray-200/70"
                : "glass-card text-white/70 hover:text-white"
            }`}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || (preset === "อื่นๆ" && !custom.trim())}
            className="focusable pressable flex-1 rounded-xl py-2.5 text-sm font-semibold min-h-[44px] bg-amber-400/90 hover:bg-amber-400 text-amber-950 disabled:opacity-60"
          >
            {busy ? "กำลังบันทึก…" : "ยืนยัน พักงาน"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
