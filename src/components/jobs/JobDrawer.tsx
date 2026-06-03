"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS, INST_STATUS, JOB_STATUS } from "@/lib/constants";
import { baht, thDate } from "@/lib/format";
import { calcFinancials } from "@/lib/finance";
import { Chip, Tag, Spinner } from "@/components/ui/primitives";
import { X, ShieldCheck } from "@/components/ui/icons";
import type { Job, Production, Installation, FinanceEntry, Issue } from "@/lib/database.types";

type Detail = Job & {
  estimator: { full_name: string | null } | null;
  designer: { full_name: string | null } | null;
  productions: Production[]; installations: Installation[];
  finance_entries?: FinanceEntry[]; issues: Issue[];
};

export function JobDrawer({ jobId, canFinance, onClose, onChanged }: { jobId: string; canFinance: boolean; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"overview" | "production" | "installation" | "finance">("overview");
  const [depOpen, setDepOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.get<Detail>(`/jobs/${jobId}`).then((r) => r.data),
  });

  const tabs: [typeof tab, string][] = [["overview", "ภาพรวม"], ["production", "Production"], ["installation", "ติดตั้ง"]];
  if (canFinance) tabs.push(["finance", "การเงิน"]);

  const Row = ({ l, v, num }: { l: string; v?: React.ReactNode; num?: boolean }) => (
    <div className="flex justify-between gap-4 py-2.5 border-b border-white/8">
      <span className="text-sm shrink-0" style={{ color: "var(--t-low)" }}>{l}</span>
      <span className={`text-sm font-medium text-white text-right ${num ? "tnum" : ""}`}>{v ?? "—"}</span>
    </div>
  );

  const job = data;
  const prod = job?.productions?.[0];
  const inst = job?.installations?.[0];
  const fin = job?.finance_entries ?? [];
  const paid = fin.reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="รายละเอียดงาน">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg h-[100dvh] glass overflow-y-auto slide-in sm:rounded-l-3xl">
        {isLoading || !job ? <div className="pt-10"><Spinner /></div> : (
          <>
            <div className="sticky top-0 glass px-5 sm:px-6 py-4 flex items-center justify-between z-10 sm:rounded-tl-3xl">
              <div className="min-w-0">
                <div className="text-white font-bold text-lg tnum">{job.job_code}</div>
                <div className="text-sm truncate" style={{ color: "var(--t-mid)" }}>{job.customer_name} · {job.customer_area ?? "—"}</div>
              </div>
              <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
            </div>

            <div className="px-5 sm:px-6 pt-4 flex gap-1.5 flex-wrap" role="tablist">
              {tabs.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`focusable pressable px-3.5 py-2 rounded-xl text-sm min-h-[40px] ${tab === k ? "bg-white text-[#1F4E78] font-semibold" : "text-white/65 hover:bg-white/10"}`}>{l}</button>
              ))}
            </div>

            <div className="p-5 sm:p-6">
              {tab === "overview" && (
                <div>
                  <div className="flex items-center justify-between">
                    <Chip status={job.status} />
                    {canFinance && (job.status === "QUOTE_SENT" || job.status === "PENDING_DECISION") ? (
                      <button onClick={() => setDepOpen(true)} className="focusable pressable text-[12px] bg-emerald-500/25 border border-emerald-300/30 text-emerald-100 rounded-lg px-3 py-1.5 min-h-[36px]">บันทึกมัดจำ</button>
                    ) : null}
                  </div>

                  {canFinance && ["PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"].includes(job.status) && (
                    <QuoteEditor job={job} onChanged={() => { refetch(); onChanged(); }} />
                  )}

                  <div className="mt-3">
                    <Row l="ช่องทาง" v={job.channel} />
                    <Row l="เบอร์โทร" v={job.customer_tel} num />
                    <Row l="วันเข้าประเมิน" v={thDate(job.assess_date)} />
                    <Row l="ช่างประเมิน" v={job.estimator?.full_name} />
                    <Row l="คนทำแบบ" v={job.designer?.full_name} />
                    {canFinance && <>
                      <Row l="ยอดงาน (ก่อน VAT)" v={job.net_amount ? `${baht(job.net_amount)} ฿` : "—"} num />
                      <Row l="VAT 7%" v={job.vat_amount ? `${baht(job.vat_amount)} ฿` : "—"} num />
                      <Row l="ยอดรวม" v={job.total_amount ? `${baht(job.total_amount)} ฿` : "—"} num />
                      <Row l="มัดจำ" v={job.deposit_amount ? `${baht(job.deposit_amount)} ฿` : "—"} num />
                    </>}
                  </div>
                  {depOpen && <DepositForm jobId={jobId} onDone={() => { setDepOpen(false); refetch(); onChanged(); }} onCancel={() => setDepOpen(false)} />}
                </div>
              )}

              {tab === "production" && (prod ? (
                <div>
                  <Chip>{PROD_STATUS[prod.status]}</Chip>
                  <div className="mt-3">
                    <Row l="วันติดตั้งกำหนด" v={thDate(prod.planned_install_date)} />
                    <Row l="วันวัดจริง" v={thDate(prod.measure_actual)} />
                    <Row l="วันลงคิวผลิต" v={thDate(prod.production_queued)} />
                    <Row l="ผล QC" v={prod.qc_result === "PASSED" ? "ผ่าน" : prod.qc_result === "FAILED" ? "ไม่ผ่าน" : null} />
                  </div>
                  <StatusSelect label="เปลี่ยนสถานะ Production" value={prod.status} options={PROD_STATUS}
                    onSave={async (v) => { await api.patch(`/production/${prod.id}`, { status: v }); refetch(); onChanged(); }} />
                </div>
              ) : <Empty title="ยังไม่เข้า Production" sub="เริ่มเมื่อมัดจำแล้ว" />)}

              {tab === "installation" && (inst ? (
                <div>
                  <Chip>{INST_STATUS[inst.status]}</Chip>
                  <div className="mt-3">
                    <Row l="วันนัดติดตั้ง" v={thDate(inst.install_scheduled)} />
                    <Row l="วันติดตั้งจริง" v={thDate(inst.install_actual)} />
                    <Row l="วันจบงาน" v={thDate(inst.completed_date)} />
                    <Row l="รับประกันถึง" v={thDate(inst.warranty_until)} />
                  </div>
                  {inst.warranty_until && <div className="mt-3 flex items-center gap-2 text-emerald-200 text-[12px] bg-emerald-500/15 border border-emerald-300/25 rounded-xl px-3 py-2.5"><ShieldCheck size={15} /> รับประกัน auto = วันจบงาน + 12 เดือน</div>}
                  <StatusSelect label="เปลี่ยนสถานะติดตั้ง" value={inst.status} options={INST_STATUS}
                    onSave={async (v) => { await api.patch(`/installation/${inst.id}`, { status: v }); refetch(); onChanged(); }} />
                </div>
              ) : <Empty title="ยังไม่เข้าติดตั้ง" sub="เริ่มเมื่อ Production = พร้อมติดตั้ง" />)}

              {tab === "finance" && canFinance && (
                <div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[["ยอดรวม", baht(job.total_amount), "text-white"], ["รับแล้ว", baht(paid), "text-emerald-300"], ["ค้างรับ", baht(Number(job.total_amount ?? 0) - paid), "text-amber-300"]].map(([l, v, c]) => (
                      <div key={l} className="glass-card rounded-xl p-3 text-center"><div className="text-[11px]" style={{ color: "var(--t-low)" }}>{l}</div><div className={`font-bold text-sm mt-1 tnum ${c}`}>{v}</div></div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {fin.length === 0 && <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ยังไม่มีรายการรับเงิน</div>}
                    {fin.map((f) => (
                      <div key={f.id} className="flex items-center justify-between bg-white/8 border border-white/10 rounded-xl px-3 py-2.5">
                        <div><span className="text-white text-sm">{f.type}</span>{f.is_auto_created && <span className="ml-2"><Tag tone="sky">auto</Tag></span>}<div className="text-[12px] mt-0.5 tnum" style={{ color: "var(--t-low)" }}>{thDate(f.payment_date)} · {f.channel}</div></div>
                        <span className="text-white font-semibold text-sm tnum">{baht(f.amount)} ฿</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusSelect({ label, value, options, onSave }: { label: string; value: string; options: Record<string, string>; onSave: (v: string) => Promise<void> }) {
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  return (
    <div className="mt-4 glass-card rounded-xl p-3.5">
      <label className="text-[12px] block mb-2" style={{ color: "var(--t-low)" }}>{label}</label>
      <div className="flex gap-2">
        <select value={val} onChange={(e) => setVal(e.target.value)} aria-label={label}
          className="focusable flex-1 glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none min-h-[44px] [&>option]:text-gray-800">
          {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button disabled={saving || val === value} onClick={async () => { setSaving(true); try { await onSave(val); } finally { setSaving(false); } }}
          className="focusable pressable bg-white text-[#1F4E78] rounded-lg px-4 text-sm font-semibold disabled:opacity-50 min-h-[44px]">บันทึก</button>
      </div>
    </div>
  );
}

function DepositForm({ jobId, onDone, onCancel }: { jobId: string; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setErr(null); setSaving(true);
    try {
      await api.patch(`/jobs/${jobId}`, { status: "DEPOSITED", deposit_amount: Number(amount), deposit_date: date });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };
  return (
    <div className="mt-4 glass-card rounded-xl p-4">
      <div className="text-sm font-semibold text-white mb-3">บันทึกมัดจำ → สร้าง Production + บัญชี อัตโนมัติ</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>ยอดมัดจำ (฿)</label><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none tnum min-h-[44px]" /></div>
        <div><label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วันมัดจำ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none tnum min-h-[44px] [&::-webkit-calendar-picker-indicator]:invert" /></div>
      </div>
      {err && <p role="alert" className="mt-2 text-[12px] text-rose-200">{err}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="focusable pressable flex-1 glass-card text-white rounded-lg px-3 py-2 text-sm min-h-[40px]">ยกเลิก</button>
        <button onClick={save} disabled={saving || !amount} className="focusable pressable flex-1 bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 min-h-[40px]">ยืนยันมัดจำ</button>
      </div>
    </div>
  );
}

// ── P0 #1: ฟอร์มทำใบเสนอราคา ──
function QuoteEditor({ job, onChanged }: { job: Detail; onChanged: () => void }) {
  const [net, setNet] = useState(job.net_amount ? String(job.net_amount) : "");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = Number(net) || 0;
  const f = calcFinancials(n, 0); // net = ยอดก่อน VAT (หลังหักส่วนลดแล้ว) ตาม OQ-04
  const dirty = n > 0 && n !== Number(job.net_amount ?? 0);

  const saveQuote = async () => {
    setErr(null); setSaving(true);
    try { await api.patch(`/jobs/${job.id}`, { net_amount: n }); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const setStatus = async (s: string) => {
    setErr(null); setBusy(true);
    try {
      if (s === "QUOTE_SENT" && !job.quote_sent_date) {
        await api.patch(`/jobs/${job.id}`, { quote_sent_date: new Date().toISOString().slice(0, 10) });
      }
      await api.patch(`/jobs/${job.id}`, { status: s });
      onChanged();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const STAGES = ["PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"] as const;

  return (
    <div className="mt-4 glass-card rounded-xl p-4">
      <div className="text-sm font-semibold text-white mb-3">ทำใบเสนอราคา</div>

      <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>ยอดงานก่อน VAT (บาท) <span className="text-rose-300">*</span></label>
      <div className="flex gap-2">
        <input inputMode="numeric" value={net} onChange={(e) => setNet(e.target.value)} placeholder="0"
          className="focusable flex-1 glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none tnum min-h-[44px] placeholder-white/40" />
        <button onClick={saveQuote} disabled={saving || !dirty}
          className="focusable pressable bg-white text-[#1F4E78] rounded-lg px-4 text-sm font-semibold disabled:opacity-50 min-h-[44px] flex items-center gap-2">
          {saving && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />}บันทึกยอด
        </button>
      </div>

      {/* preview VAT/รวม สด */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[["ก่อน VAT", baht(n)], ["VAT 7%", baht(f.vatAmount)], ["ยอดรวม", baht(f.totalAmount)]].map(([l, v]) => (
          <div key={l} className="bg-white/8 border border-white/10 rounded-lg p-2 text-center">
            <div className="text-[10px]" style={{ color: "var(--t-low)" }}>{l}</div>
            <div className="text-white font-semibold text-[13px] mt-0.5 tnum">{v}</div>
          </div>
        ))}
      </div>

      {/* เลื่อนสถานะใบเสนอ */}
      <div className="mt-3.5">
        <div className="text-[12px] mb-1.5" style={{ color: "var(--t-low)" }}>สถานะใบเสนอราคา</div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="สถานะใบเสนอราคา">
          {STAGES.map((s) => (
            <button key={s} role="radio" aria-checked={job.status === s} disabled={busy || job.status === s} onClick={() => setStatus(s)}
              className={`focusable pressable flex-1 rounded-lg px-2 py-2 text-[12px] font-medium border min-h-[40px] transition disabled:opacity-100 ${job.status === s ? "bg-white text-[#1F4E78] border-white" : "bg-white/8 text-white/70 border-white/12 hover:bg-white/15"}`}>
              {JOB_STATUS[s].th}
            </button>
          ))}
        </div>
      </div>

      {err && <p role="alert" className="mt-2.5 text-[12px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-lg px-3 py-2">{err}</p>}
      <p className="mt-2.5 text-[11px]" style={{ color: "var(--t-low)" }}>กรอกยอด → บันทึก → กด “ส่งลูกค้าแล้ว” → จากนั้นปุ่ม “บันทึกมัดจำ” จะใช้งานได้</p>
    </div>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return <div className="text-center py-10"><div className="text-sm" style={{ color: "var(--t-mid)" }}>{title}</div><div className="text-[12px] mt-1" style={{ color: "var(--t-low)" }}>{sub}</div></div>;
}
