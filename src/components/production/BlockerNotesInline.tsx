"use client";
// วงเล็บโน้ตเด่นหลังชื่อลูกค้า ในหน้างานผลิต (ส่วนออฟฟิศ) — "ทำไมงานนี้ยังวัด/ผลิตไม่ได้"
// เจ้าของ: "เอาแบบคนกด" (chip สำเร็จรูป) ไม่พิมพ์เอง ยกเว้น "อื่นๆ" ที่พิมพ์ข้อความได้ + กดใส่/เอาออกเร็วจากหน้ารายการ (migration 0098)
import { useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "@/lib/api";
import { Plus, X, Trash2 } from "@/components/ui/icons";

export type BlockerNote = {
  id: number;
  tag: "floor_work" | "wait_ykk" | "wait_tostem" | "other";
  note: string;
  source: "manual" | "auto";   // manual = คนกดเอง (ตอนนี้ใช้ทางเดียว) · auto = จุดต่ออนาคต ยังไม่ใช้งานจริง
  created_at: string;
};

const TAG_META: Record<BlockerNote["tag"], { label: string }> = {
  floor_work:  { label: "ติดงานพื้น" },
  wait_ykk:    { label: "รอ YKK" },
  wait_tostem: { label: "รอ TOSTEM" },
  other:       { label: "อื่นๆ" },
};
const PRESET_TAGS: BlockerNote["tag"][] = ["floor_work", "wait_ykk", "wait_tostem"];

function noteLabel(n: BlockerNote): string {
  return n.tag === "other" ? n.note : TAG_META[n.tag].label;
}

export function BlockerNotesInline({
  jobId, customerName, notes, canWrite, onChanged,
}: {
  jobId: string;
  customerName: string;
  notes: BlockerNote[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!canWrite && notes.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label={notes.length > 0 ? `ดู/แก้โน้ต ${customerName}` : `เพิ่มโน้ต ${customerName}`}
        className="focusable pressable inline-flex items-center gap-1 text-[12px] font-semibold px-1.5 py-0.5 rounded-md hover:bg-white/10"
        style={{ color: notes.length > 0 ? "#fcd34d" : "var(--t-low)" }}
      >
        {notes.length > 0
          ? <>({notes.map(noteLabel).join(" · ")})</>
          : <><Plus size={11} /> โน้ต</>}
      </button>
      {open && (
        <BlockerNotesPopover
          jobId={jobId} customerName={customerName} notes={notes} canWrite={canWrite}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function BlockerNotesPopover({
  jobId, customerName, notes, canWrite, onClose, onChanged,
}: {
  jobId: string; customerName: string; notes: BlockerNote[]; canWrite: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [otherText, setOtherText] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);

  const usedPresets = new Set(notes.filter((n) => n.tag !== "other").map((n) => n.tag));

  async function addTag(tag: BlockerNote["tag"], note?: string) {
    setBusy(true); setErr("");
    try {
      await api.post(`/jobs/${jobId}/blocker-notes`, { tag, note });
      setOtherText(""); setShowOtherInput(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "เพิ่มโน้ตไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function removeNote(id: number) {
    setBusy(true); setErr("");
    try {
      await api.del(`/jobs/${jobId}/blocker-notes/${id}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "ลบโน้ตไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    // ครอบ .app-bg เหมือน ProductionStepModal — portal หลุด scope กระจกมืด ต้องประกาศใหม่ให้ .glass อ่านออก
    <div className="app-bg" style={{ background: "transparent", minHeight: 0 }}>
      <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`โน้ต ${customerName}`}>
        <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
        <div className="relative w-full sm:max-w-sm glass rounded-t-3xl sm:rounded-3xl p-5 fade-in max-h-[85dvh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="text-white font-bold text-base">โน้ตงานนี้</div>
              <div className="text-[13px] truncate" style={{ color: "var(--t-mid)" }}>{customerName}</div>
            </div>
            <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-9 h-9 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10 shrink-0"><X size={18} /></button>
          </div>

          {/* โน้ตที่ติดอยู่ตอนนี้ */}
          {notes.length > 0 ? (
            <div className="space-y-1.5 mb-4">
              {notes.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 bg-amber-500/15 border border-amber-300/25">
                  <span className="text-[13px] text-amber-100 min-w-0 truncate">{noteLabel(n)}</span>
                  {canWrite && (
                    <button onClick={() => removeNote(n.id)} disabled={busy} aria-label={`เอา ${noteLabel(n)} ออก`}
                      className="focusable pressable w-8 h-8 inline-flex items-center justify-center rounded-lg text-amber-200 hover:bg-amber-500/20 shrink-0 disabled:opacity-40">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] mb-4" style={{ color: "var(--t-low)" }}>ยังไม่มีโน้ต</div>
          )}

          {canWrite && (
            <>
              <div className="text-[12px] font-medium mb-1.5" style={{ color: "var(--t-low)" }}>เพิ่มโน้ต</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_TAGS.filter((t) => !usedPresets.has(t)).map((t) => (
                  <button key={t} onClick={() => addTag(t)} disabled={busy}
                    className="focusable pressable min-h-[38px] px-3 rounded-xl text-[13px] font-semibold bg-white/10 text-white/90 border border-white/15 hover:bg-white/15 disabled:opacity-40">
                    + {TAG_META[t].label}
                  </button>
                ))}
                {!showOtherInput && (
                  <button onClick={() => setShowOtherInput(true)} disabled={busy}
                    className="focusable pressable min-h-[38px] px-3 rounded-xl text-[13px] font-semibold bg-white/10 text-white/90 border border-white/15 hover:bg-white/15 disabled:opacity-40">
                    + อื่นๆ
                  </button>
                )}
              </div>
              {showOtherInput && (
                <div className="flex items-center gap-1.5 mb-2">
                  <input value={otherText} onChange={(e) => setOtherText(e.target.value)} disabled={busy}
                    placeholder="พิมพ์เหตุผล เช่น รอลูกค้าเลือกสี"
                    className="flex-1 min-h-[38px] rounded-xl px-3 text-[13px] bg-white/10 text-white placeholder-white/40 border border-white/15 outline-none"
                    onKeyDown={(e) => { if (e.key === "Enter" && otherText.trim()) addTag("other", otherText.trim()); }} />
                  <button onClick={() => otherText.trim() && addTag("other", otherText.trim())} disabled={busy || !otherText.trim()}
                    className="focusable pressable min-h-[38px] px-3 rounded-xl text-[13px] font-semibold bg-brand text-white disabled:opacity-40">
                    เพิ่ม
                  </button>
                </div>
              )}
            </>
          )}

          {err && <div className="text-[13px] text-rose-300 mt-1">⚠ {err}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
