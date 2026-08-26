"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import DateField from "@/components/ui/DateField";
import { X, Check } from "@/components/ui/icons";
import type { ProdStatus } from "@/lib/database.types";

/**
 * AddProductionJobModal — โมดัล "+ เพิ่มงานผลิต" ใช้ร่วม 3 หน้า: ตารางผลิต(ช่าง) · ผลิต(ออฟฟิศ) · ลิงก์ช่าง
 * 2 แบบ: "จดเอง" (adhoc → POST /production-schedule) · "เลือกจากงานในระบบ" (PATCH /production/:id → QUEUED)
 * ⚠ ลิงก์ช่าง (isChang) = เพิ่มได้เฉพาะ "จดเอง" (ไม่มี session ดึงงานในระบบไม่ได้ · endpoint รับ token ช่าง)
 */
type Candidate = { id: string; status: ProdStatus; job: { job_code: string; customer_name: string } | null };
const today = () => new Date().toISOString().slice(0, 10);

export default function AddProductionJobModal({ producerList = [], isChang = false, onClose, onSaved }: {
  producerList?: string[];
  isChang?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"adhoc" | "job">("adhoc");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // จดเอง
  const [title, setTitle] = useState("");
  const [cust, setCust] = useState("");
  const [pdate, setPdate] = useState(today());
  const [idate, setIdate] = useState("");
  const [producer, setProducer] = useState("");
  const [amount, setAmount] = useState("");   // ยอดงาน (ไม่บังคับ · เผื่อสถิติ) — กรอก = บันทึกลงงาน · เว้น = ไม่ลงยอด

  // เลือกจากระบบ — ช่างลิงก์ดึงไม่ได้ (ไม่มี session) จึงข้าม
  const { data: prodData } = useQuery({ queryKey: ["production", "candidates"], queryFn: () => api.get<Candidate[]>("/production"), enabled: !isChang });
  const NOT_QUEUED: ProdStatus[] = ["MEASURED", "PENDING_MEETING", "PENDING_CONFIRM", "REVISING"];
  const candidates = (prodData?.data ?? []).filter((p) => NOT_QUEUED.includes(p.status));
  const [pickId, setPickId] = useState("");

  const MODAL_DATALIST_ID = "modal-producers-list";

  const submit = async (confirm = false) => {
    setErr(null); setSaving(true);
    try {
      if (tab === "adhoc" || isChang) {
        if (!cust.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); setSaving(false); return; }
        await api.post("/production-schedule", { customer_name: cust, title, produce_date: pdate, install_date: idate, producer_note: producer, job_amount: amount ? Number(amount) : null, confirm });
      } else {
        if (!pickId) { setErr("กรุณาเลือกงาน"); setSaving(false); return; }
        if (!pdate) { setErr("กรุณากรอกวันกำหนดเสร็จ"); setSaving(false); return; }
        await api.patch(`/production/${pickId}`, { status: "QUEUED", production_due_date: pdate, ...(idate ? { planned_install_date: idate } : {}) });
      }
      onSaved();
    } catch (e) {
      // ลูกค้าชื่อตรงกับงาน active อยู่แล้ว (กันงานผีซ้ำ) → ถามยืนยันก่อน ไม่ใช่บล็อกตาย
      if (e instanceof ApiError && e.status === 409 && (e.details as { needs_confirm?: boolean } | undefined)?.needs_confirm) {
        setSaving(false);
        if (window.confirm(`${e.message}`)) { submit(true); }
        return;
      }
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); setSaving(false);
    }
  };

  const inp = "w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none placeholder-white/40 min-h-[48px]";

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const showTabs = !isChang;
  const adhocMode = tab === "adhoc" || isChang;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md glass-dark rounded-t-3xl sm:rounded-3xl fade-in flex flex-col max-h-[88dvh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">เพิ่มงานผลิต</h2>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-10 h-10 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <datalist id={MODAL_DATALIST_ID}>
            {producerList.map((name) => <option key={name} value={name} />)}
          </datalist>

          {showTabs && (
            <div className="flex gap-1.5 glass-card rounded-xl p-1 mb-4">
              {[["adhoc", "จดเอง"], ["job", "เลือกจากงานในระบบ"]].map(([t, l]) => (
                <button key={t} onClick={() => { setTab(t as "adhoc" | "job"); setErr(null); }}
                  className={`focusable pressable flex-1 px-3 py-2 rounded-lg text-[13px] font-medium min-h-[40px] ${tab === t ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>{l}</button>
              ))}
            </div>
          )}

          {adhocMode ? (
            <div className="space-y-3">
              <div><label className="block text-[13px] mb-1 text-white">ชื่อลูกค้า *</label>
                <input value={cust} onChange={(e) => setCust(e.target.value)} placeholder="เช่น คุณสมชาย / บ้านทรายทอง" className={inp} autoFocus /></div>
              <div><label className="block text-[13px] mb-1 text-white">ชื่อ/รายละเอียดงาน (ไม่บังคับ)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ซ่อมบานเลื่อน / งานด่วน" className={inp} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[13px] mb-1 text-white">วันผลิต</label>
                  <DateField value={pdate} onChange={(iso) => setPdate(iso)} className={inp} aria-label="วันผลิต" /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง/ส่ง</label>
                  <DateField value={idate} onChange={(iso) => setIdate(iso)} className={inp} aria-label="วันติดตั้ง/ส่ง" /></div>
              </div>
              <div>
                <label className="block text-[13px] mb-1 text-white">ช่างผลิต</label>
                <input list={MODAL_DATALIST_ID} value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="ชื่อช่าง" className={inp} />
              </div>
              <div>
                <label className="block text-[13px] mb-1 text-white">ยอดงาน (บาท · ไม่บังคับ)</label>
                <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="เว้นว่าง = ไม่บันทึกยอด (เผื่อทำสถิติ)" className={inp} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div><label className="block text-[13px] mb-1 text-white">เลือกงานในระบบ (ยังไม่ลงคิว) *</label>
                <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={`${inp} appearance-none`}>
                  <option value="">— เลือกงาน —</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.job?.job_code} · {c.job?.customer_name} ({PROD_STATUS[c.status]})</option>)}
                </select>
                {candidates.length === 0 && <p className="text-[12px] text-amber-200 mt-1">ไม่มีงานที่วัดแล้วและยังไม่ลงคิว — งานที่ยังรอวัด (PENDING_MEASURE) ต้องวัดหน้างานก่อน</p>}</div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[13px] mb-1 text-white">วันกำหนดเสร็จ *</label>
                  <DateField value={pdate} onChange={(iso) => setPdate(iso)} className={inp} aria-label="วันกำหนดเสร็จ" /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง</label>
                  <DateField value={idate} onChange={(iso) => setIdate(iso)} className={inp} aria-label="วันติดตั้ง" /></div>
              </div>
              <p className="text-[12px] text-white/60">เลือกแล้วงานจะเข้าสถานะ &quot;รอลงผลิต&quot; + ใส่วันกำหนดเสร็จให้ · ช่างกดเริ่มผลิตเองในตาราง</p>
            </div>
          )}

          {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 shrink-0 border-t border-white/10">
          <button onClick={onClose} className="focusable pressable glass-card text-white rounded-2xl px-5 min-h-[52px] font-medium">ปิด</button>
          <button onClick={() => submit()} disabled={saving} className="focusable pressable flex-1 min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={20} />} บันทึก
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
