"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { baht, thDate } from "@/lib/format";
import { X } from "@/components/ui/icons";

export function VoidDialog({ entry, onClose, onVoided }: {
  entry: { id: string; amount: number; payment_date: string; type: string; job_code?: string };
  onClose: () => void; onVoided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api.post(`/finance/${entry.id}/void`, { reason });
      onVoided();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "ยกเลิกรายการไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ยกเลิกรายการรับเงิน">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-sm glass rounded-3xl p-6 fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">ยกเลิกรายการ (Void)</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
        </div>

        <div className="glass-card rounded-xl px-3.5 py-3 mb-4">
          <div className="text-white text-sm font-medium tnum">{entry.job_code} · {entry.type}</div>
          <div className="text-[12px] mt-0.5 tnum" style={{ color: "var(--t-low)" }}>{thDate(entry.payment_date)} · {baht(entry.amount)} ฿</div>
        </div>

        <div className="flex items-start gap-2 text-[12px] text-amber-200 bg-amber-500/15 border border-amber-300/25 rounded-xl px-3 py-2.5 mb-4">
          รายการจะถูกทำเครื่องหมาย void (ไม่ลบจริง) — ยอดค้างรับจะถูกคำนวณใหม่ และมีบันทึกใน audit log
        </div>

        <label className="block text-[12px] mb-1.5" style={{ color: "var(--t-low)" }} htmlFor="rs">เหตุผล <span className="text-rose-300">*</span></label>
        <textarea id="rs" required value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder-white/40 resize-none" placeholder="เช่น บันทึกซ้ำ / ลูกค้าโอนผิดบัญชี" />

        {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]">ยกเลิก</button>
          <button type="submit" disabled={saving || !reason.trim()} className="focusable pressable flex-1 bg-rose-500/90 hover:bg-rose-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />} ยืนยัน void
          </button>
        </div>
      </form>
    </div>
  );
}
