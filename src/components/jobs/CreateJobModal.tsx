"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { CHANNEL } from "@/lib/constants";
import { X } from "@/components/ui/icons";

export function CreateJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ customer_name: "", customer_tel: "", customer_area: "", channel: "LINE", assess_date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setSaving(true);
    try {
      await api.post("/jobs", form);
      onCreated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const field = "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] placeholder-white/40 [&>option]:text-gray-800";
  const lbl = "block text-[12px] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="สร้างงานใหม่">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md glass rounded-3xl p-6 fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">สร้างงานใหม่</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="cn">ชื่อลูกค้า <span className="text-rose-300">*</span></label>
            <input id="cn" required value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={field} placeholder="เช่น คุณสมชาย" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="tel">เบอร์โทร</label><input id="tel" inputMode="tel" value={form.customer_tel} onChange={(e) => set("customer_tel", e.target.value)} className={`${field} tnum`} /></div>
            <div><label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="area">พื้นที่</label><input id="area" value={form.customer_area} onChange={(e) => set("customer_area", e.target.value)} className={field} placeholder="จังหวัด" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ch">ช่องทาง</label>
              <select id="ch" value={form.channel} onChange={(e) => set("channel", e.target.value)} className={field}>
                {Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ad">วันเข้าประเมิน</label><input id="ad" type="date" value={form.assess_date} onChange={(e) => set("assess_date", e.target.value)} className={`${field} tnum`} /></div>
          </div>
        </div>

        {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
        <p className="mt-3 text-[11px]" style={{ color: "var(--t-low)" }}>Job ID จะถูกสร้างอัตโนมัติ (ต่อเลขจากระบบเดิม)</p>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]">ยกเลิก</button>
          <button type="submit" disabled={saving} className="focusable pressable flex-1 bg-white text-[#1F4E78] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/90 min-h-[44px] disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />} บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
