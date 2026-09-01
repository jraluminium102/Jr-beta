"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { baht, thDate } from "@/lib/format";
import { TriangleAlert, Check } from "@/components/ui/icons";

// ── เครื่องมือแอดมิน: "แตกออเดอร์ที่ปนอยู่ในงานเดียว ออกเป็นงานใหม่" (0129) ──
//   ใช้เมื่องานมีหลายออเดอร์ (quotations) ปนกัน — ทำให้ใบปะหน้า/ใบตัด/ผลิตอ่านผิดออเดอร์
//   งานแตะการเงิน + โครงสร้างงาน → ADMIN เท่านั้น · RPC split_order_to_new_job atomic (dry-run ปลอดภัย)

type Installment = { id: number; seq: number; amount: number; paid_amount: number | null; status: string };
type BillingNote = { id: number; code: string; status: string; total: number; billing_installments: Installment[] };
type Quotation = { id: number; code: string; status: string; issue_date: string; total: number; net: number; billing_notes: BillingNote[] };
type SplitOrdersData = {
  job: { id: string; job_code: string | null; customer_name: string; status: string };
  quotations: Quotation[];
  active_quotation_count: number;
  can_split: boolean;
  unlinked_deposits: { id: string; amount: number; payment_date: string }[];
  unlinked_external_billing: { id: number; code: string; total: number }[];
};

type JobSnapshot = {
  job_id: string; job_code: string | null; status: string;
  net_amount: number; vat_amount: number; total_amount: number;
  deposit_amount: number | null; active_quotations: number; active_billing_total: number;
  paid_total: number; outstanding: number;
};
type SplitPreview = {
  quotation_id: number; quotation_code: string;
  old_job_id: string; new_job_id: string;
  before: JobSnapshot;
  old_job_after: JobSnapshot;
  new_job_after: JobSnapshot;
  moved: { billing_notes: number[]; installments: number[]; deposit_finance_entries: string[]; production_moved: boolean };
  warnings: string[];
  dry_run: boolean;
};

const QSTATUS_TH: Record<string, string> = { draft: "ร่าง", sent: "ส่งแล้ว", approved: "อนุมัติแล้ว", cancelled: "ยกเลิก" };

function SnapshotRow({ label, snap }: { label: string; snap: JobSnapshot }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-white">{label}</div>
        <div className="text-[11px] tnum" style={{ color: "var(--t-low)" }}>{snap.job_code ?? "—"} · {snap.status}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[12px] tnum">
        <div style={{ color: "var(--t-low)" }}>ยอดสุทธิ (net) <span className="text-white ml-1">฿{baht(snap.net_amount)}</span></div>
        <div style={{ color: "var(--t-low)" }}>รวม VAT <span className="text-white ml-1">฿{baht(snap.total_amount)}</span></div>
        <div style={{ color: "var(--t-low)" }}>รับแล้ว <span className="text-emerald-300 ml-1">฿{baht(snap.paid_total)}</span></div>
        <div style={{ color: "var(--t-low)" }}>ค้างรับ <span className="text-amber-300 ml-1">฿{baht(snap.outstanding)}</span></div>
      </div>
    </div>
  );
}

function ConsistencyCheck({ before, oldAfter, newAfter }: { before: JobSnapshot; oldAfter: JobSnapshot; newAfter: JobSnapshot }) {
  const sumTotal = Number(oldAfter.total_amount || 0) + Number(newAfter.total_amount || 0);
  const diffTotal = Math.round((Number(before.total_amount || 0) - sumTotal) * 100) / 100;
  const sumPaid = Number(oldAfter.paid_total || 0) + Number(newAfter.paid_total || 0);
  const diffPaid = Math.round((Number(before.paid_total || 0) - sumPaid) * 100) / 100;
  const ok = Math.abs(diffTotal) < 0.01 && Math.abs(diffPaid) < 0.01;
  return (
    <div className={`rounded-xl border p-3 text-[12px] ${ok ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-rose-300/30 bg-rose-500/15 text-rose-100"}`}>
      <div className="flex items-center gap-1.5 font-semibold">
        {ok ? <Check size={14} /> : <TriangleAlert size={14} />}
        เช็คยอด (ก่อนแตก = งานเดิม + งานใหม่ หลังแตก)
      </div>
      <div className="tnum mt-1">
        ยอดบิล: ฿{baht(before.total_amount)} = ฿{baht(oldAfter.total_amount)} + ฿{baht(newAfter.total_amount)}
        {Math.abs(diffTotal) >= 0.01 && <span className="text-rose-200"> · ต่าง ฿{baht(diffTotal)}</span>}
      </div>
      <div className="tnum mt-0.5">
        เงินรับแล้ว: ฿{baht(before.paid_total)} = ฿{baht(oldAfter.paid_total)} + ฿{baht(newAfter.paid_total)}
        {Math.abs(diffPaid) >= 0.01 && <span className="text-rose-200"> · ต่าง ฿{baht(diffPaid)} (เงินอาจไปงานผิด)</span>}
      </div>
      {!ok && <span className="block mt-1 font-semibold">⚠ ยอดไม่ตรง — ห้ามยืนยันจนกว่าจะตรวจสอบ</span>}
    </div>
  );
}

function OrderRow({ jobId, q, onDone }: { jobId: string; q: Quotation; onDone: () => void }) {
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const activeBills = (q.billing_notes ?? []).filter((b) => b.status !== "cancelled");
  const billTotal = activeBills.reduce((s, b) => s + Number(b.total || 0), 0);

  const runPreview = async () => {
    setError(null); setBusy(true);
    try {
      const res = await api.post<SplitPreview>(`/jobs/${jobId}/split-orders`, { quotation_id: q.id, dry_run: true });
      setPreview(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "พรีวิวไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const confirmSplit = async () => {
    setError(null); setBusy(true); setConfirming(true);
    try {
      await api.post(`/jobs/${jobId}/split-orders`, { quotation_id: q.id, dry_run: false });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "แตกออเดอร์ไม่สำเร็จ");
      setConfirming(false);
    } finally { setBusy(false); }
  };

  const sumOk = preview
    ? Math.abs(Number(preview.before.total_amount || 0) - (Number(preview.old_job_after.total_amount || 0) + Number(preview.new_job_after.total_amount || 0))) < 0.01
      && Math.abs(Number(preview.before.paid_total || 0) - (Number(preview.old_job_after.paid_total || 0) + Number(preview.new_job_after.paid_total || 0))) < 0.01
    : false;

  return (
    <div className="rounded-2xl border border-white/10 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-white tnum">{q.code}</div>
          <div className="text-[11px]" style={{ color: "var(--t-low)" }}>
            {QSTATUS_TH[q.status] ?? q.status} · {thDate(q.issue_date)} · ยอด ฿{baht(q.total)}
            {activeBills.length > 0 && <> · บิล {activeBills.length} ใบ (฿{baht(billTotal)})</>}
          </div>
        </div>
        {!preview && (
          <button onClick={runPreview} disabled={busy}
            className="focusable pressable shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold text-white bg-sky-500 hover:bg-sky-400 min-h-[44px] disabled:opacity-50">
            {busy ? "…" : "พรีวิวแตก"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-[12px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-lg px-2.5 py-1.5">{error}</p>}

      {preview && (
        <div className="space-y-2 pt-1 border-t border-white/10">
          <div className="grid gap-2 sm:grid-cols-2">
            <SnapshotRow label="งานเดิม (หลังแตก)" snap={preview.old_job_after} />
            <SnapshotRow label="งานใหม่ (แยกออกมา)" snap={preview.new_job_after} />
          </div>
          <ConsistencyCheck before={preview.before} oldAfter={preview.old_job_after} newAfter={preview.new_job_after} />
          <div className="text-[11px]" style={{ color: "var(--t-low)" }}>
            ย้าย: ใบวางบิล {preview.moved.billing_notes.length} ใบ · งวด {preview.moved.installments.length} งวด
            {preview.moved.deposit_finance_entries.length > 0 && <> · มัดจำ auto {preview.moved.deposit_finance_entries.length} รายการ</>}
            {preview.moved.production_moved && <> · ย้ายงานผลิตเดิมไปงานใหม่ด้วย</>}
          </div>
          {preview.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-2.5 space-y-1">
              {preview.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-100">
                  <TriangleAlert size={12} className="shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setPreview(null)} disabled={busy}
              className="focusable pressable flex-1 rounded-xl glass-card border border-white/15 text-white/80 text-[12px] min-h-[44px]">
              ยกเลิก
            </button>
            <button onClick={confirmSplit} disabled={busy || !sumOk}
              className="focusable pressable flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[12px] font-semibold min-h-[44px] disabled:opacity-40">
              {confirming ? "กำลังแตก…" : "ยืนยันแตกออเดอร์นี้"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SplitOrdersPanel({ jobId, onSplit }: { jobId: string; onSplit: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["split-orders", jobId],
    queryFn: () => api.get<SplitOrdersData>(`/jobs/${jobId}/split-orders`),
  });

  const handleDone = () => {
    queryClient.invalidateQueries({ queryKey: ["split-orders", jobId] });
    onSplit();
  };

  if (isLoading) return <p className="text-[12px]" style={{ color: "var(--t-low)" }}>กำลังโหลดออเดอร์…</p>;
  if (error) return <p className="text-[12px] text-rose-200">{error instanceof ApiError ? error.message : "โหลดไม่สำเร็จ"}</p>;

  const d = data?.data;
  if (!d) return null;

  return (
    <div className="space-y-3">
      <p className="text-[11px]" style={{ color: "var(--t-low)" }}>
        งานนี้มี {d.active_quotation_count} ออเดอร์ (ใบเสนอ Active) — เลือกใบที่ต้องการแยกออกเป็นงานใหม่
        (ใบเสนอ/บิล/เงินของออเดอร์นั้นจะย้ายตามไปทั้งหมด)
      </p>

      {d.unlinked_external_billing.length > 0 && (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/12 p-2.5 text-[12px] text-rose-100 flex items-start gap-1.5">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          งานนี้มีใบวางบิลนอกระบบที่ยังไม่ผูกใบเสนอ ({d.unlinked_external_billing.map((b) => b.code).join(", ")}) — แตกออเดอร์ไม่ได้จนกว่าจะผูกใบเสนอให้บิลนั้นก่อน
        </div>
      )}

      {d.unlinked_deposits.length > 0 && (
        <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-2.5 text-[12px] text-amber-100 flex items-start gap-1.5">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          มีมัดจำอัตโนมัติที่ยังไม่ผูกงวด ฿{baht(d.unlinked_deposits.reduce((s, x) => s + Number(x.amount || 0), 0))} — ถ้างานเดิมยังมีออเดอร์อื่นที่มีบิลด้วย ระบบจะปฏิเสธการแตก (ระบุไม่ได้ว่ามัดจำเป็นของออเดอร์ไหน)
        </div>
      )}

      {!d.can_split ? (
        <p className="text-[12px] text-emerald-200">งานนี้มีออเดอร์เดียวอยู่แล้ว ไม่ต้องแตก</p>
      ) : (
        <div className="space-y-2">
          {d.quotations.filter((q) => q.status !== "cancelled").map((q) => (
            <OrderRow key={q.id} jobId={jobId} q={q} onDone={handleDone} />
          ))}
        </div>
      )}
    </div>
  );
}
