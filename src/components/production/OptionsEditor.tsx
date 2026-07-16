"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Plus, X } from "@/components/ui/icons";
import type { SetOption } from "@/app/api/production-set-options/route";

/**
 * แผงจัดการตัวเลือกดรอปดาวน์ 1 ช่อง — เพิ่ม/ลบเองได้ (0099)
 * ลบไม่ได้ 2 กรณี: (1) ค่าที่ระบบใช้ตัดสินใจ (is_locked) (2) ยังมีชุดงานใช้ค่านั้นอยู่ — server เป็นคนตัดสิน
 */
export default function OptionsEditor({
  label, fieldKey, options, migrated, fallback, onClose, onChanged,
}: {
  label: string;
  fieldKey: string;
  options: SetOption[];
  /** 0099 รันแล้วหรือยัง — ยังไม่รัน = ดรอปดาวน์ยังใช้ค่าสำรองในโค้ด แก้ไม่ได้ */
  migrated: boolean;
  /** ค่าสำรองในโค้ด — โชว์ให้เห็นว่าตอนนี้ดรอปดาวน์มีอะไรบ้าง (ตอนยังไม่รัน migration) */
  fallback: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  async function add() {
    const v = text.trim();
    if (!v) return;
    setBusy(true); setErrMsg("");
    try {
      await api.post("/production-set-options", { field_key: fieldKey, value: v });
      setText("");
      onChanged();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function del(o: SetOption) {
    if (!confirm(`ลบตัวเลือก "${o.value}" ออกจาก "${label}"?`)) return;
    setBusy(true); setErrMsg("");
    try {
      await api.del(`/production-set-options/${o.id}`);
      onChanged();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`จัดการตัวเลือก ${label}`}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-sm glass rounded-2xl p-4 fade-in max-h-[80dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[15px] font-semibold text-white">ตัวเลือกของ &quot;{label}&quot;</span>
          <button onClick={onClose} aria-label="ปิด" className="text-white/50 hover:text-white p-1"><X size={16} /></button>
        </div>
        <p className="text-[11.5px] mb-3" style={{ color: "var(--t-low)" }}>
          เพิ่ม/ลบได้เอง มีผลกับทุกงาน · ตัวที่มี 🔒 ระบบใช้ตัดสินใจ ลบไม่ได้
        </p>

        {/* ยังไม่ได้รัน 0099 → ห้ามโชว์ลิสต์ว่างให้เข้าใจผิดว่า "ไม่มีตัวเลือก"
            ของจริงตอนนี้ดรอปดาวน์ใช้ค่าสำรองในโค้ดอยู่ ต้องบอกตามตรง */}
        {!migrated ? (
          <div className="text-[12.5px] rounded-lg px-3 py-2.5 mb-1 text-amber-100 bg-amber-500/15 border border-amber-300/30">
            ยังแก้ตัวเลือกไม่ได้ — ต้องรัน migration <b>0099</b> ก่อน
            <div className="mt-1.5" style={{ color: "var(--t-low)" }}>ตอนนี้ดรอปดาวน์ใช้ค่าสำรองในระบบ:</div>
            <div className="mt-1 text-white/85">{fallback.join(" · ") || "—"}</div>
          </div>
        ) : (
        <div className="space-y-1.5 mb-3">
          {options.length === 0 && (
            <div className="text-[12px] py-2" style={{ color: "var(--t-low)" }}>ยังไม่มีตัวเลือก — เพิ่มด้านล่าง</div>
          )}
          {options.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 bg-white/6 border border-white/10 rounded-lg px-2.5 py-2">
              <span className="text-[13.5px] text-white/90 truncate">{o.value}</span>
              {o.is_locked ? (
                <span className="text-[11px] shrink-0" style={{ color: "var(--t-low)" }} title="ระบบใช้ค่านี้ตัดสินใจ — ลบไม่ได้">🔒</span>
              ) : (
                <button onClick={() => del(o)} disabled={busy} aria-label={`ลบ ${o.value}`}
                  className="text-white/40 hover:text-rose-300 shrink-0 disabled:opacity-40 p-0.5"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>
        )}

        <div className="flex items-center gap-2" hidden={!migrated}>
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="เพิ่มตัวเลือกใหม่…" maxLength={60}
            className="flex-1 bg-white/8 text-white text-[13.5px] px-2.5 py-2 rounded-lg border border-white/12 focus:border-sky-300/60 outline-none placeholder:text-white/30" />
          <button onClick={add} disabled={busy || !text.trim()}
            className="focusable pressable inline-flex items-center gap-1 text-[13px] bg-sky-500/80 hover:bg-sky-400 text-white rounded-lg px-2.5 py-2 min-h-[38px] disabled:opacity-40">
            <Plus size={14} /> เพิ่ม
          </button>
        </div>

        {errMsg && (
          <div role="alert" className="mt-2 text-[12px] text-rose-200 bg-rose-900/40 border border-rose-500/30 rounded-lg px-2.5 py-2">{errMsg}</div>
        )}
      </div>
    </div>
  );
}
