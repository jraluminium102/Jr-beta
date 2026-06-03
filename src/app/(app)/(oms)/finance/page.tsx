"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { baht, thDate } from "@/lib/format";
import { Tag, Spinner, EmptyState } from "@/components/ui/primitives";
import { Download, Plus, X } from "@/components/ui/icons";
import { RecordPaymentModal } from "@/components/finance/RecordPaymentModal";
import { VoidDialog } from "@/components/finance/VoidDialog";
import type { PaymentType, PaymentChannel } from "@/lib/database.types";

type Row = {
  id: string; payment_date: string; amount: number; type: PaymentType; channel: PaymentChannel; is_auto_created: boolean;
  job: { job_code: string; customer_name: string } | null;
};
type OutRow = { job_id: string; job_code: string; customer_name: string; total: number; paid: number; outstanding: number };
const TYPE_TH: Record<PaymentType, string> = { DEPOSIT: "มัดจำ", INSTALLMENT_2: "งวด 2", INSTALLMENT_3: "งวด 3", FINAL: "งวดสุดท้าย" };
const CH_TH: Record<PaymentChannel, string> = { TRANSFER: "โอน", CASH: "เงินสด", CHEQUE: "เช็ค" };

export default function FinancePage() {
  const [view, setView] = useState<"ledger" | "outstanding">("ledger");
  const [creating, setCreating] = useState(false);
  const [presetJob, setPresetJob] = useState<string | undefined>(undefined);
  const [voiding, setVoiding] = useState<Row | null>(null);

  const { data, isLoading, refetch } = useQuery({ queryKey: ["finance"], queryFn: () => api.get<Row[]>("/finance") });
  const out = useQuery({ queryKey: ["finance", "outstanding"], queryFn: () => api.get<OutRow[]>("/finance/outstanding"), enabled: view === "outstanding" });

  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const canVoid = (data?.meta?.can_void as boolean) ?? false;
  const total = rows.reduce((s, f) => s + Number(f.amount), 0);
  const outRows = out.data?.data ?? [];
  const totalOut = (out.data?.meta?.total_outstanding as number) ?? 0;

  const openRecord = (jobId?: string) => { setPresetJob(jobId); setCreating(true); };
  const VoidBtn = ({ r }: { r: Row }) => (
    <button onClick={() => setVoiding(r)} aria-label={`ยกเลิกรายการ ${r.job?.job_code}`}
      className="focusable pressable inline-flex items-center gap-1 text-[12px] text-rose-200 hover:text-rose-100 hover:bg-rose-500/15 rounded-lg px-2 py-1 min-h-[32px]"><X size={14} /> void</button>
  );

  const Tab = ({ id, label }: { id: typeof view; label: string }) => (
    <button onClick={() => setView(id)} className={`focusable pressable px-4 py-2 rounded-xl text-sm min-h-[40px] font-medium border transition ${view === id ? "bg-white text-[#1F4E78] border-white" : "glass-card text-white/70 border-white/12"}`}>{label}</button>
  );

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-start sm:items-center justify-between mb-4 gap-3 flex-col sm:flex-row">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">บัญชี</h1>
          <p className="text-sm tnum" style={{ color: "var(--t-low)" }}>
            {view === "ledger" ? `รับรวม ${baht(total)} ฿ · ${rows.length} รายการ` : `ค้างรับรวม ${baht(totalOut)} ฿ · ${outRows.length} งาน`}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button className="focusable pressable flex items-center gap-2 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px] flex-1 sm:flex-none justify-center"><Download size={17} /> Export</button>
          {canWrite && (
            <button onClick={() => openRecord(undefined)} className="focusable pressable flex items-center gap-2 bg-white text-[#1F4E78] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/90 shadow-lg min-h-[44px] flex-1 sm:flex-none justify-center"><Plus size={18} /> บันทึกรับเงิน</button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Tab id="ledger" label="รับเงิน" />
        <Tab id="outstanding" label="ค้างรับ" />
      </div>

      {/* ── LEDGER ── */}
      {view === "ledger" && (isLoading ? <Spinner /> : rows.length === 0 ? <EmptyState title="ยังไม่มีรายการรับเงิน" /> : (
        <>
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[12px] border-b border-white/12" style={{ color: "var(--t-mid)" }}>
                  <th className="text-left font-medium px-4 py-3">วันที่</th><th className="text-left font-medium px-4 py-3">Job ID</th>
                  <th className="text-left font-medium px-4 py-3">ลูกค้า</th><th className="text-left font-medium px-4 py-3">ประเภท</th>
                  <th className="text-left font-medium px-4 py-3">ช่องทาง</th><th className="text-right font-medium px-4 py-3">ยอดรับ</th>
                  {canVoid && <th className="text-right font-medium px-4 py-3">จัดการ</th>}
                </tr></thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id} className="border-b border-white/6 hover:bg-white/10">
                      <td className="px-4 py-3 tnum" style={{ color: "var(--t-mid)" }}>{thDate(f.payment_date)}</td>
                      <td className="px-4 py-3 text-white font-medium tnum">{f.job?.job_code}</td>
                      <td className="px-4 py-3" style={{ color: "var(--t-mid)" }}>{f.job?.customer_name}</td>
                      <td className="px-4 py-3"><span style={{ color: "var(--t-hi)" }}>{TYPE_TH[f.type]}</span>{f.is_auto_created && <span className="ml-1.5"><Tag tone="sky">auto</Tag></span>}</td>
                      <td className="px-4 py-3" style={{ color: "var(--t-low)" }}>{CH_TH[f.channel]}</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-semibold tnum">{baht(f.amount)}</td>
                      {canVoid && <td className="px-4 py-3 text-right"><VoidBtn r={f} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="md:hidden space-y-2.5">
            {rows.map((f) => (
              <div key={f.id} className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-white font-medium text-sm tnum">{f.job?.job_code}</span>{f.is_auto_created && <Tag tone="sky">auto</Tag>}</div>
                  <div className="text-[13px] mt-0.5" style={{ color: "var(--t-mid)" }}>{f.job?.customer_name} · {TYPE_TH[f.type]}</div>
                  <div className="text-[12px] mt-0.5 tnum" style={{ color: "var(--t-low)" }}>{thDate(f.payment_date)} · {CH_TH[f.channel]}</div>
                  {canVoid && <div className="mt-2"><VoidBtn r={f} /></div>}
                </div>
                <span className="text-emerald-300 font-bold text-sm tnum shrink-0">{baht(f.amount)} ฿</span>
              </div>
            ))}
          </div>
        </>
      ))}

      {/* ── OUTSTANDING (ลูกหนี้) ── */}
      {view === "outstanding" && (out.isLoading ? <Spinner /> : outRows.length === 0 ? <EmptyState title="ไม่มีเงินค้างรับ" sub="ทุกงานเก็บครบแล้ว 🎉" /> : (
        <div className="space-y-2.5">
          {outRows.map((r) => (
            <div key={r.job_id} className="glass-card rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-white font-medium text-sm tnum">{r.job_code} · <span style={{ color: "var(--t-mid)" }}>{r.customer_name}</span></div>
                <div className="text-[12px] mt-1 tnum" style={{ color: "var(--t-low)" }}>ยอดรวม {baht(r.total)} · รับแล้ว {baht(r.paid)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[11px]" style={{ color: "var(--t-low)" }}>ค้างรับ</div>
                  <div className="text-amber-300 font-bold text-sm tnum">{baht(r.outstanding)} ฿</div>
                </div>
                {canWrite && (
                  <button onClick={() => openRecord(r.job_id)} className="focusable pressable bg-white/90 hover:bg-white text-[#1F4E78] rounded-lg px-3 py-2 text-[12px] font-semibold min-h-[40px]">รับเงิน</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {creating && <RecordPaymentModal presetJobId={presetJob} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refetch(); out.refetch(); }} />}
      {voiding && <VoidDialog
        entry={{ id: voiding.id, amount: voiding.amount, payment_date: voiding.payment_date, type: TYPE_TH[voiding.type], job_code: voiding.job?.job_code }}
        onClose={() => setVoiding(null)}
        onVoided={() => { setVoiding(null); refetch(); out.refetch(); }}
      />}
    </div>
  );
}
