"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { baht } from "@/lib/format";
import { Search, X } from "@/components/ui/icons";
import type { PaymentType, PaymentChannel } from "@/lib/database.types";

type JobOpt = { id: string; job_code: string; customer_name: string; total_amount?: number | null; status: string };

const TYPES: { v: PaymentType; th: string }[] = [
  { v: "DEPOSIT", th: "มัดจำ" }, { v: "INSTALLMENT_2", th: "งวด 2" },
  { v: "INSTALLMENT_3", th: "งวด 3" }, { v: "FINAL", th: "งวดสุดท้าย" },
];
const CHANNELS: { v: PaymentChannel; th: string }[] = [
  { v: "TRANSFER", th: "โอน" }, { v: "CASH", th: "เงินสด" }, { v: "CHEQUE", th: "เช็ค" },
];

export function RecordPaymentModal({ presetJobId, onClose, onSaved }: {
  presetJobId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [jobId, setJobId] = useState(presetJobId ?? "");
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<PaymentType>("INSTALLMENT_2");
  const [channel, setChannel] = useState<PaymentChannel>("TRANSFER");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { data: jobs } = useQuery({
    queryKey: ["jobs", "finance-picker"],
    queryFn: () => api.get<JobOpt[]>("/jobs?limit=100").then((r) => r.data),
    enabled: !presetJobId,
  });

  const filtered = useMemo(() => {
    const list = (jobs ?? []).filter((j) => ["DEPOSITED", "COMPLETED"].includes(j.status));
    if (!q) return list;
    return list.filter((j) => j.customer_name.includes(q) || j.job_code.toLowerCase().includes(q.toLowerCase()));
  }, [jobs, q]);

  const selected = (jobs ?? []).find((j) => j.id === jobId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!jobId) { setErr("กรุณาเลือกงาน"); return; }
    setSaving(true);
    try {
      await api.post("/finance", {
        job_id: jobId, payment_date: date, amount: Number(amount), type, channel, note: note || undefined,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const field = "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] placeholder-white/40 [&>option]:text-gray-800";
  const lbl = "block text-[12px] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="บันทึกรับเงิน">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md glass rounded-3xl p-6 fade-in max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">บันทึกรับเงิน</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
        </div>

        {/* Job picker */}
        {presetJobId && selected ? (
          <div className="mb-3 glass-card rounded-xl px-3.5 py-2.5">
            <div className="text-[12px]" style={{ color: "var(--t-low)" }}>งาน</div>
            <div className="text-white text-sm font-medium tnum">{selected.job_code} · {selected.customer_name}</div>
          </div>
        ) : (
          <div className="mb-3">
            <label className={lbl} style={{ color: "var(--t-low)" }}>เลือกงาน <span className="text-rose-300">*</span></label>
            {jobId && selected ? (
              <div className="flex items-center justify-between glass-card rounded-xl px-3.5 py-2.5">
                <span className="text-white text-sm font-medium tnum">{selected.job_code} · {selected.customer_name}</span>
                <button type="button" onClick={() => setJobId("")} className="focusable text-[12px] text-sky-200 hover:underline">เปลี่ยน</button>
              </div>
            ) : (
              <>
                <div className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 min-h-[44px] focusable mb-2" style={{ color: "var(--t-mid)" }}>
                  <Search size={18} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / Job ID" aria-label="ค้นหางาน" className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full" />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {filtered.length === 0 && <div className="text-[12px] px-1 py-2" style={{ color: "var(--t-low)" }}>ไม่พบงานที่มัดจำแล้ว</div>}
                  {filtered.map((j) => (
                    <button type="button" key={j.id} onClick={() => setJobId(j.id)}
                      className="focusable pressable w-full text-left bg-white/8 hover:bg-white/16 border border-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between">
                      <span><span className="text-white text-sm font-medium tnum">{j.job_code}</span><span className="text-[12px] ml-2" style={{ color: "var(--t-low)" }}>{j.customer_name}</span></span>
                      {j.total_amount ? <span className="text-[12px] tnum" style={{ color: "var(--t-mid)" }}>{baht(j.total_amount)} ฿</span> : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="amt">ยอดรับ (฿) <span className="text-rose-300">*</span></label>
              <input id="amt" required inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tnum`} placeholder="0" />
            </div>
            <div>
              <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="dt">วันที่รับ</label>
              <input id="dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} tnum [&::-webkit-calendar-picker-indicator]:invert`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ty">ประเภท</label>
              <select id="ty" value={type} onChange={(e) => setType(e.target.value as PaymentType)} className={field}>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.th}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ch">ช่องทาง</label>
              <select id="ch" value={channel} onChange={(e) => setChannel(e.target.value as PaymentChannel)} className={field}>
                {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.th}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="nt">หมายเหตุ</label>
            <input id="nt" value={note} onChange={(e) => setNote(e.target.value)} className={field} placeholder="(ถ้ามี)" />
          </div>
        </div>

        {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]">ยกเลิก</button>
          <button type="submit" disabled={saving} className="focusable pressable flex-1 bg-white text-[#1F4E78] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/90 min-h-[44px] disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />} บันทึกรับเงิน
          </button>
        </div>
      </form>
    </div>
  );
}
