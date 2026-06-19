"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS, INST_STATUS } from "@/lib/constants";
import { baht, thDate } from "@/lib/format";
import DateField from "@/components/ui/DateField";
import { calcFinancials } from "@/lib/finance";
import { Chip, Tag, Spinner } from "@/components/ui/primitives";
import { X, ShieldCheck, TriangleAlert, Banknote } from "@/components/ui/icons";
import { CreateIssueModal } from "@/components/issues/CreateIssueModal";
import { MaterialsPanel } from "@/components/jobs/MaterialsPanel";
import { QcPanel } from "@/components/jobs/QcPanel";
import { StageAdvanceButton } from "@/components/jobs/StageAdvanceButton";
import { DocumentHubPanel } from "@/components/jobs/DocumentHubPanel";
import type { Job, Production, Installation, FinanceEntry, Issue, IssuePhase } from "@/lib/database.types";

const SEV_TAG: Record<string, string> = { HIGH: "bg-rose-500/30 text-rose-100 border-rose-300/30", MEDIUM: "bg-amber-500/25 text-amber-100 border-amber-300/30", LOW: "bg-white/12 text-white/80 border-white/15" };

type Detail = Job & {
  estimator: { full_name: string | null } | null;
  designer: { full_name: string | null } | null;
  productions: Production[]; installations: Installation[];
  finance_entries?: FinanceEntry[]; issues: Issue[];
};

export function JobDrawer({ jobId, canFinance, canWriteProd = false, readOnly = false, onClose, onChanged }: { jobId: string; canFinance: boolean; canWriteProd?: boolean; readOnly?: boolean; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"overview" | "production" | "materials" | "installation" | "finance" | "documents">("overview");
  const [depOpen, setDepOpen] = useState(false);
  const [depAmtOpen, setDepAmtOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const issuePhase: IssuePhase = tab === "production" ? "PRODUCTION" : tab === "installation" ? "INSTALLATION" : "SALES";

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.get<Detail>(`/jobs/${jobId}`).then((r) => r.data),
  });

  const tabs: [typeof tab, string][] = [["overview", "ภาพรวม"], ["production", "Production"], ["materials", "วัสดุ"], ["installation", "ติดตั้ง"]];
  if (canFinance) tabs.push(["finance", "การเงิน"]);
  tabs.push(["documents", "เอกสาร"]);

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
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setIssueOpen(true)} className="focusable pressable inline-flex items-center gap-1.5 rounded-xl px-3 h-11 text-[13px] font-medium bg-rose-500/20 border border-rose-300/30 text-rose-100 hover:bg-rose-500/30"><TriangleAlert size={16} /> แจ้งปัญหา</button>
                <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
              </div>
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
                  {readOnly ? (
                    <div className="glass-card rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px]" style={{ color: "var(--t-low)" }}>ขั้นตอนปัจจุบัน · ดูอย่างเดียว</div>
                        <div className="text-white font-semibold text-sm"><span className="tnum">{job.current_stage}/24</span></div>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/70 border border-white/15">เปลี่ยนสถานะที่หน้างานที่รับผิดชอบ</span>
                    </div>
                  ) : (
                    <StageAdvanceButton jobId={jobId} currentStage={job.current_stage} onAdvanced={() => { refetch(); onChanged(); }} />
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <Chip status={job.status} />
                    {canFinance && (job.status === "QUOTE_SENT" || job.status === "PENDING_DECISION") ? (
                      <button onClick={() => setDepOpen(true)} className="focusable pressable text-[12px] bg-emerald-500/25 border border-emerald-300/30 text-emerald-100 rounded-lg px-3 py-1.5 min-h-[36px]">บันทึกมัดจำ</button>
                    ) : null}
                  </div>

                  {/* พักงาน (ON_HOLD) */}
                  {!readOnly && <div className="mt-2">
                    {job.on_hold ? (
                      <div className="flex items-center justify-between gap-2 bg-amber-500/15 border border-amber-300/25 rounded-xl px-3 py-2">
                        <span className="text-[13px] text-amber-100">⏸ พักงานอยู่{job.on_hold_reason ? `: ${job.on_hold_reason}` : ""}</span>
                        <button onClick={async () => { await api.patch(`/jobs/${jobId}`, { on_hold: false, on_hold_reason: null }); refetch(); onChanged(); }}
                          className="focusable pressable text-[12px] bg-white/15 text-white rounded-lg px-3 py-1.5 min-h-[36px] shrink-0">กลับมาทำ</button>
                      </div>
                    ) : (
                      <button onClick={async () => { const r = prompt("เหตุผลที่พักงาน (ไม่บังคับ)"); if (r === null) return; await api.patch(`/jobs/${jobId}`, { on_hold: true, on_hold_reason: r || null }); refetch(); onChanged(); }}
                        className="focusable pressable text-[12px] text-white/70 hover:text-white border border-white/15 rounded-lg px-3 py-1.5 min-h-[36px]">⏸ พักงานนี้</button>
                    )}
                  </div>}

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
                  {job.issues?.some((i) => i.status !== "CLOSED") && (
                    <div className="mt-4">
                      <div className="text-[12px] mb-1.5" style={{ color: "var(--t-low)" }}>ปัญหาที่ยังเปิด</div>
                      <div className="space-y-1.5">
                        {job.issues.filter((i) => i.status !== "CLOSED").map((i) => (
                          <div key={i.id} className="flex items-start gap-2 bg-white/8 border border-white/10 rounded-xl px-3 py-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${SEV_TAG[i.severity] ?? SEV_TAG.LOW}`}>{i.severity}</span>
                            <span className="text-[13px] text-white/90 flex-1">{i.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* มัดจำเบา: status=DEPOSITED แต่ deposit_amount ยังไม่ได้ใส่ → แสดงแถบแจ้งเตือน + ปุ่มใส่ยอด */}
                  {canFinance && job.status === "DEPOSITED" && job.deposit_amount == null && !depAmtOpen && (
                    <div className="mt-3 flex items-center justify-between gap-3 bg-amber-500/15 border border-amber-300/25 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Banknote size={16} className="text-amber-200 shrink-0" />
                        <span className="text-[13px] text-amber-100">มัดจำแล้ว · ยังไม่ใส่ยอด</span>
                      </div>
                      <button
                        onClick={() => setDepAmtOpen(true)}
                        className="focusable pressable shrink-0 text-[12px] bg-amber-500/30 border border-amber-300/30 text-amber-100 rounded-lg px-3 py-1.5 min-h-[36px] hover:bg-amber-500/40"
                      >
                        ใส่ยอดมัดจำ
                      </button>
                    </div>
                  )}
                  {depAmtOpen && (
                    <DepositAmountForm
                      jobId={jobId}
                      onDone={() => { setDepAmtOpen(false); refetch(); onChanged(); }}
                      onCancel={() => setDepAmtOpen(false)}
                    />
                  )}
                  {depOpen && <DepositForm jobId={jobId} onDone={() => { setDepOpen(false); refetch(); onChanged(); }} onCancel={() => setDepOpen(false)} />}
                </div>
              )}

              {tab === "production" && (prod ? (
                <div>
                  <Chip>{PROD_STATUS[prod.status]}</Chip>
                  <div className="mt-2 text-[12px]" style={{ color: "var(--t-low)" }}>อัปเดตสถานะผลิตที่หน้า "ผลิต" → คลิกการ์ดงาน</div>
                  <div className="mt-3">
                    <Row l="วันวัดกำหนด" v={thDate(prod.measure_scheduled)} />
                    <Row l="วันผลิตกำหนด" v={thDate(prod.production_due_date)} />
                    <Row l="วันติดตั้งกำหนด" v={thDate(prod.planned_install_date)} />
                    <Row l="วันวัดจริง" v={thDate(prod.measure_actual)} />
                    <Row l="วันลงคิวผลิต" v={thDate(prod.production_queued)} />
                    <Row l="ผล QC" v={prod.qc_result === "PASSED" ? "ผ่าน" : prod.qc_result === "FAILED" ? "ไม่ผ่าน" : null} />
                  </div>
                  {canWriteProd && (
                    <ProductionDatesForm
                      jobId={jobId}
                      prod={prod}
                      onSaved={() => { refetch(); onChanged(); }}
                    />
                  )}
                  {!readOnly && <QcPanel jobId={jobId} />}
                </div>
              ) : <Empty title="ยังไม่เข้า Production" sub="เริ่มเมื่อมัดจำแล้ว" />)}

              {tab === "materials" && <MaterialsPanel jobId={jobId} />}

              {tab === "installation" && (inst ? (
                <div>
                  <Chip>{INST_STATUS[inst.status]}</Chip>
                  <div className="mt-2 text-[12px]" style={{ color: "var(--t-low)" }}>อัปเดตสถานะได้ที่หน้า "ติดตั้ง"</div>
                  <div className="mt-3">
                    <Row l="วันนัดติดตั้ง" v={thDate(inst.install_scheduled)} />
                    <Row l="วันติดตั้งจริง" v={thDate(inst.install_actual)} />
                    <Row l="วันจบงาน" v={thDate(inst.completed_date)} />
                    <Row l="รับประกันถึง" v={thDate(inst.warranty_until)} />
                  </div>
                  {inst.warranty_until && <div className="mt-3 flex items-center gap-2 text-emerald-200 text-[12px] bg-emerald-500/15 border border-emerald-300/25 rounded-xl px-3 py-2.5"><ShieldCheck size={15} /> รับประกัน auto = วันจบงาน + 12 เดือน</div>}
                  {!readOnly && <HandoverForm inst={inst} onSaved={() => { refetch(); onChanged(); }} />}
                </div>
              ) : <Empty title="ยังไม่เข้าติดตั้ง" sub="เริ่มเมื่อ Production = พร้อมติดตั้ง" />)}

              {tab === "documents" && (
                <DocumentHubPanel
                  jobId={jobId}
                  quoteChecklist={!!job.quote_sent_date}
                  canWrite={!readOnly}
                />
              )}

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
            {issueOpen && (
              <CreateIssueModal
                presetJobId={job.id} presetJobLabel={`${job.job_code ?? ""} · ${job.customer_name}`} presetPhase={issuePhase}
                onClose={() => setIssueOpen(false)}
                onSaved={() => { setIssueOpen(false); refetch(); onChanged(); }} />
            )}
          </>
        )}
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
  // มัดจำเบา: ยังไม่รู้ยอด → ผลักเข้า production เลย (ใส่ยอดทีหลัง)
  const markLight = async () => {
    setErr(null); setSaving(true);
    try {
      await api.post(`/jobs/${jobId}/mark-deposited`, { date });
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };
  return (
    <div className="mt-4 glass-card rounded-xl p-4">
      <div className="text-sm font-semibold text-white mb-3">บันทึกมัดจำ → สร้าง Production + บัญชี อัตโนมัติ</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>ยอดมัดจำ (฿)</label><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none tnum min-h-[44px]" /></div>
        <div><label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วันมัดจำ</label><DateField value={date} onChange={(iso) => setDate(iso)} className="focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none min-h-[44px]" aria-label="วันมัดจำ" /></div>
      </div>
      {err && <p role="alert" className="mt-2 text-[12px] text-rose-200">{err}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="focusable pressable flex-1 glass-card text-white rounded-lg px-3 py-2 text-sm min-h-[40px]">ยกเลิก</button>
        <button onClick={save} disabled={saving || !amount} className="focusable pressable flex-1 bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 min-h-[40px]">ยืนยันมัดจำ</button>
      </div>
      <button onClick={markLight} disabled={saving}
        className="focusable pressable w-full mt-2 text-[12px] text-amber-100 bg-amber-500/15 border border-amber-300/25 rounded-lg px-3 py-2 min-h-[40px] hover:bg-amber-500/25 disabled:opacity-50">
        ยังไม่รู้ยอด → ผลักเข้างานผลิตเลย (มัดจำเบา · ใส่ยอดทีหลัง)
      </button>
    </div>
  );
}

// ── ฟอร์มใส่ยอดมัดจำย้อนหลัง (มัดจำเบา: status=DEPOSITED แต่ deposit_amount=null) ──
// POST /api/jobs/[id]/deposit-amount → อัปเดต jobs + สร้าง finance_entry (DEPOSIT)
function DepositAmountForm({ jobId, onDone, onCancel }: { jobId: string; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"TRANSFER" | "CASH" | "CHEQUE">("TRANSFER");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErrMsg(null);
    const amt = Number(amount);
    if (!amt || amt <= 0 || !Number.isInteger(amt)) {
      setErrMsg("ระบุยอดมัดจำเป็นจำนวนเต็มบวก (บาท)");
      return;
    }
    if (!date) { setErrMsg("ระบุวันมัดจำ"); return; }
    setSaving(true);
    try {
      await api.post(`/jobs/${jobId}/deposit-amount`, { amount: amt, date, method });
      onDone();
    } catch (e) {
      setErrMsg(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const methodOptions: { value: "TRANSFER" | "CASH" | "CHEQUE"; label: string }[] = [
    { value: "TRANSFER", label: "โอนเงิน" },
    { value: "CASH", label: "เงินสด" },
    { value: "CHEQUE", label: "เช็ค" },
  ];

  return (
    <div className="mt-3 glass-card rounded-xl p-4">
      <div className="text-sm font-semibold text-white mb-0.5">ใส่ยอดมัดจำ</div>
      <p className="text-[11px] mb-3" style={{ color: "var(--t-low)" }}>บันทึกยอด + สร้างรายการการเงิน (DEPOSIT) อัตโนมัติ</p>
      <div className="space-y-3">
        <div>
          <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>ยอดมัดจำ (฿) <span className="text-rose-300">*</span></label>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="เช่น 5000"
            className="focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none tnum min-h-[44px] placeholder-white/40"
          />
        </div>
        <div>
          <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วันมัดจำ <span className="text-rose-300">*</span></label>
          <DateField
            value={date}
            onChange={(iso) => setDate(iso)}
            className="focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none min-h-[44px]"
            aria-label="วันมัดจำ"
          />
        </div>
        <div>
          <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วิธีชำระ</label>
          <div className="flex gap-2">
            {methodOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMethod(o.value)}
                className={`focusable pressable flex-1 rounded-lg px-2 py-2 text-[12px] font-medium min-h-[40px] border transition-colors ${
                  method === o.value
                    ? "bg-white/20 border-white/40 text-white"
                    : "bg-transparent border-white/15 text-white/60 hover:bg-white/10"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {errMsg && <p role="alert" className="mt-2.5 text-[12px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-lg px-3 py-2">{errMsg}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onCancel}
          className="focusable pressable flex-1 glass-card text-white rounded-lg px-3 py-2 text-sm min-h-[40px]"
        >
          ยกเลิก
        </button>
        <button
          onClick={save}
          disabled={saving || !amount}
          className="focusable pressable flex-1 bg-amber-500/90 hover:bg-amber-500 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 min-h-[40px] flex items-center justify-center gap-2"
        >
          {saving && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
          บันทึกยอดมัดจำ
        </button>
      </div>
    </div>
  );
}

// ── ฟอร์มทำใบเสนอราคา — กรอก/บันทึก "ยอด" เท่านั้น ──
// สถานะใบเสนอ (รอใบเสนอ→ส่งใบเสนอ→เจรจา) คุมที่ปุ่ม "ไปขั้นต่อไป" (advance_stage) ที่เดียว
function QuoteEditor({ job, onChanged }: { job: Detail; onChanged: () => void }) {
  const [net, setNet] = useState(job.net_amount ? String(job.net_amount) : "");
  const [saving, setSaving] = useState(false);
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

      {err && <p role="alert" className="mt-2.5 text-[12px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-lg px-3 py-2">{err}</p>}
      <p className="mt-2.5 text-[11px]" style={{ color: "var(--t-low)" }}>กรอกยอด → บันทึก → เลื่อนสถานะใบเสนอด้วยปุ่ม “ไปขั้นต่อไป” ด้านบน (ส่งใบเสนอ → ลูกค้ามัดจำ)</p>
    </div>
  );
}

// Edit scheduled dates for measure / production-due / planned-install
function ProductionDatesForm({ jobId, prod, onSaved }: { jobId: string; prod: Production; onSaved: () => void }) {
  const [measure, setMeasure] = useState(prod.measure_scheduled ?? "");
  const [prodDue, setProdDue] = useState(prod.production_due_date ?? "");
  const [install, setInstall] = useState(prod.planned_install_date ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fldDate = "focusable w-full glass-card rounded-lg px-3 py-2.5 text-sm text-white outline-none min-h-[44px]";

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      await api.patch("/productions/dates", {
        job_id: jobId,
        measure_scheduled:    measure    || null,
        production_due_date:  prodDue    || null,
        planned_install_date: install    || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 glass-card rounded-xl p-4">
      <div className="text-sm font-semibold text-white mb-3">ตั้งวันกำหนด</div>
      <div className="space-y-3">
        <div>
          <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วันวัดกำหนด</label>
          <DateField value={measure} onChange={(iso) => setMeasure(iso)} className={fldDate} aria-label="วันวัดกำหนด" />
        </div>
        <div>
          <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วันผลิตกำหนด</label>
          <DateField value={prodDue} onChange={(iso) => setProdDue(iso)} className={fldDate} aria-label="วันผลิตกำหนด" />
        </div>
        <div>
          <label className="text-[12px] block mb-1.5" style={{ color: "var(--t-low)" }}>วันติดตั้งกำหนด</label>
          <DateField value={install} onChange={(iso) => setInstall(iso)} className={fldDate} aria-label="วันติดตั้งกำหนด" />
        </div>
      </div>
      {err && <p role="alert" className="mt-2 text-[12px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-lg px-3 py-2">{err}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="focusable pressable mt-3 w-full bg-white text-[#1F4E78] rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
      >
        {saving && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />}
        บันทึกวันกำหนด
      </button>
    </div>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return <div className="text-center py-10"><div className="text-sm" style={{ color: "var(--t-mid)" }}>{title}</div><div className="text-[12px] mt-1" style={{ color: "var(--t-low)" }}>{sub}</div></div>;
}

// หลักฐานรับงาน (handover)
function HandoverForm({ inst, onSaved }: { inst: Installation; onSaved: () => void }) {
  const [date, setDate] = useState(inst.handover_date ?? "");
  const [signoff, setSignoff] = useState(inst.handover_signoff_url ?? "");
  const [photo, setPhoto] = useState(inst.handover_photo_url ?? "");
  const [saving, setSaving] = useState(false);
  const fldBase = "focusable w-full glass-card rounded-lg px-3 py-2 text-sm text-white outline-none min-h-[40px] placeholder-white/40";
  const fldDate = fldBase;
  const save = async () => {
    setSaving(true);
    try { await api.patch(`/installation/${inst.id}`, { handover_date: date || null, handover_signoff_url: signoff || null, handover_photo_url: photo || null }); onSaved(); }
    finally { setSaving(false); }
  };
  return (
    <div className="mt-4 glass-card rounded-xl p-3.5">
      <div className="text-[12px] mb-2" style={{ color: "var(--t-low)" }}>หลักฐานรับงาน (ส่งงาน)</div>
      <div className="space-y-2">
        <label className="block"><span className="text-[11px]" style={{ color: "var(--t-low)" }}>วันรับงาน</span>
          <DateField value={date} onChange={(iso) => setDate(iso)} className={fldBase} aria-label="วันรับงาน" /></label>
        <input value={signoff} onChange={(e) => setSignoff(e.target.value)} placeholder="ลิงก์ใบรับงาน/ลายเซ็นลูกค้า" className={fldBase} />
        <input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="ลิงก์รูปหลังติดตั้ง" className={fldBase} />
        <button onClick={save} disabled={saving} className="focusable pressable w-full bg-white text-[#1F4E78] rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 min-h-[40px]">{saving ? "กำลังบันทึก…" : "บันทึกหลักฐานรับงาน"}</button>
      </div>
    </div>
  );
}
