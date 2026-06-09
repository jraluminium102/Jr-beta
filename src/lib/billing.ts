// ============================================================
// Billing helper — แหล่งความจริงเดียวของการ "รับชำระงวด"
// ใช้ร่วมทั้ง PATCH /billing-notes/[id]/pay และ POST /receipts (A1)
// กัน logic แตกสองทาง: mark งวด paid + recompute สถานะใบวางบิล
// + sync เส้น B (finance_entries) อัตโนมัติ
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ApplyPaymentOpts {
  installmentId: number | string;
  billingNoteId: string;
  /** ยอดที่รับชำระ; ถ้าไม่ระบุ = ปิดงวดเต็มจำนวน (กรณีออกใบเสร็จต่อ 1 งวด) */
  paidAmount?: number;
  paidDate?: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** map seq → PaymentType เส้น B */
function seqToType(seq: number): "DEPOSIT" | "INSTALLMENT_2" | "INSTALLMENT_3" | "FINAL" {
  if (seq === 1) return "DEPOSIT";
  if (seq === 2) return "INSTALLMENT_2";
  if (seq === 3) return "INSTALLMENT_3";
  return "FINAL";
}

/**
 * บันทึกรับชำระงวด → set paid_amount/paid_date/status ของงวด
 * แล้ว recompute billing_notes.status (unpaid/partial/paid) จากผลรวมที่จ่าย
 * จากนั้น sync ไปยัง finance_entries เส้น B (ถ้า job_id มี)
 * คืน { error } ถ้าพลาด (ไม่ throw — ให้ route จัดการ response เอง)
 */
export async function applyInstallmentPayment(
  supabase: SupabaseClient,
  opts: ApplyPaymentOpts,
): Promise<{ error?: string }> {
  // 1) ยืนยันงวดอยู่ในใบวางบิลนี้จริง + อ่านยอดงวด + seq
  const { data: inst, error: iErr } = await supabase
    .from("billing_installments")
    .select("amount, seq")
    .eq("id", opts.installmentId)
    .eq("billing_note_id", opts.billingNoteId)
    .single<{ amount: number; seq: number }>();
  if (iErr || !inst) return { error: "ไม่พบงวดในใบวางบิลนี้" };

  const amount = Number(inst.amount) || 0;
  const paid = opts.paidAmount != null ? round2(Number(opts.paidAmount) || 0) : amount;
  // installment_status enum = ('pending','paid') → จ่ายครบ=paid, บางส่วน=pending
  const status = paid >= amount ? "paid" : "pending";

  // 2) update งวด
  const { error: uErr } = await supabase
    .from("billing_installments")
    .update({ paid_amount: paid, paid_date: opts.paidDate || today(), status })
    .eq("id", opts.installmentId)
    .eq("billing_note_id", opts.billingNoteId);
  if (uErr) return { error: uErr.message };

  // 3) recompute สถานะใบวางบิลจากผลรวม paid_amount เทียบ total + ดึง job_id
  const { data: bn, error: bErr } = await supabase
    .from("billing_notes")
    .select("total, job_id, billing_installments(paid_amount)")
    .eq("id", opts.billingNoteId)
    .single<{ total: number; job_id: string | null; billing_installments: { paid_amount: number }[] }>();
  if (bErr || !bn) return { error: "ไม่พบใบวางบิล" };

  const totalPaid = (bn.billing_installments ?? []).reduce(
    (a, i) => a + (Number(i.paid_amount) || 0),
    0,
  );
  const total = Number(bn.total) || 0;
  const blStatus = totalPaid <= 0 ? "unpaid" : totalPaid >= total ? "paid" : "partial";

  const { error: sErr } = await supabase
    .from("billing_notes")
    .update({ status: blStatus })
    .eq("id", opts.billingNoteId);
  if (sErr) return { error: sErr.message };

  // 4) sync finance_entries เส้น B — ถ้าไม่มี job_id ข้ามได้ (ไม่ error)
  if (bn.job_id && paid > 0) {
    const syncErr = await syncFinanceEntry(supabase, {
      jobId: bn.job_id,
      installmentId: Number(opts.installmentId),
      seq: inst.seq,
      paid,
      paidDate: opts.paidDate || today(),
    });
    if (syncErr) {
      // best-effort: log แต่ไม่ fail การจ่ายเงิน
      console.error("[billing] sync finance_entry failed:", syncErr);
    }
  }

  return {};
}

/** sync หรือ upsert finance_entry เส้น B */
async function syncFinanceEntry(
  supabase: SupabaseClient,
  opts: { jobId: string; installmentId: number; seq: number; paid: number; paidDate: string },
): Promise<string | null> {
  const type = seqToType(opts.seq);

  // ตรวจว่า finance_entry ผูกงวดนี้มีอยู่แล้วไหม (by billing_installment_id, not voided)
  const { data: existing } = await supabase
    .from("finance_entries")
    .select("id")
    .eq("billing_installment_id", opts.installmentId)
    .eq("is_voided", false)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    // update amount เพื่อให้ตรงกับยอดที่จ่ายจริง
    const { error } = await supabase
      .from("finance_entries")
      .update({ amount: opts.paid, payment_date: opts.paidDate })
      .eq("id", existing.id);
    return error?.message ?? null;
  }

  // กรณี seq=1 (DEPOSIT): ค้น auto-created DEPOSIT ที่ยังไม่ผูกงวด → ผูกแทน insert ใหม่
  if (opts.seq === 1) {
    const { data: autoDeposit } = await supabase
      .from("finance_entries")
      .select("id")
      .eq("job_id", opts.jobId)
      .eq("type", "DEPOSIT")
      .eq("is_auto_created", true)
      .eq("is_voided", false)
      .is("billing_installment_id", null)
      .maybeSingle<{ id: string }>();

    if (autoDeposit?.id) {
      const { error } = await supabase
        .from("finance_entries")
        .update({
          billing_installment_id: opts.installmentId,
          amount: opts.paid,
          payment_date: opts.paidDate,
          source: "BILLING",
        })
        .eq("id", autoDeposit.id);
      return error?.message ?? null;
    }
  }

  // insert finance_entry ใหม่
  const { error } = await supabase
    .from("finance_entries")
    .insert({
      job_id: opts.jobId,
      amount: opts.paid,
      payment_date: opts.paidDate,
      type,
      channel: "TRANSFER",
      source: "BILLING",
      billing_installment_id: opts.installmentId,
      is_auto_created: false,
      is_voided: false,
    });
  return error?.message ?? null;
}
