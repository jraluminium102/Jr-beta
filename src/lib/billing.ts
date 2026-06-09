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
  /** receipt id ที่ผูกกับการชำระนี้ (ถ้ามี) — ใช้ set finance_entries.receipt_id [HIGH-3] */
  receiptId?: number | string;
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
  // 1) ยืนยันงวดอยู่ในใบวางบิลนี้จริง + อ่านยอดงวด + seq + paid_amount ปัจจุบัน
  const { data: inst, error: iErr } = await supabase
    .from("billing_installments")
    .select("amount, seq, paid_amount")
    .eq("id", opts.installmentId)
    .eq("billing_note_id", opts.billingNoteId)
    .single<{ amount: number; seq: number; paid_amount: number | null }>();
  if (iErr || !inst) return { error: "ไม่พบงวดในใบวางบิลนี้" };

  const amount = Number(inst.amount) || 0;

  // [MEDIUM-1] partial payment: สะสม paid_amount แทนการ overwrite
  // - ถ้าส่ง paidAmount มา (จาก /pay route = จ่ายบางส่วน/เพิ่ม): บวกสะสม, reject ถ้าเกิน
  // - ถ้าไม่ส่ง paidAmount (จาก receipts = ปิดงวดเต็ม): set = amount เหมือนเดิม
  let paid: number;
  if (opts.paidAmount != null) {
    const existing = Number(inst.paid_amount) || 0;
    const newPaid = round2(existing + (Number(opts.paidAmount) || 0));
    if (newPaid > amount + 0.01) return { error: "จ่ายเกินยอดงวด" };
    paid = newPaid;
  } else {
    paid = amount;
  }

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
      receiptId: opts.receiptId != null ? Number(opts.receiptId) : undefined,
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
  opts: {
    jobId: string;
    installmentId: number;
    seq: number;
    paid: number;
    paidDate: string;
    receiptId?: number; // [HIGH-3] ผูก receipt_id เพื่อให้ void by receipt ทำงาน
  },
): Promise<string | null> {
  const type = seqToType(opts.seq);

  // ตรวจว่า finance_entry ผูกงวดนี้มีอยู่แล้วไหม (by billing_installment_id, not voided)
  const { data: existing } = await supabase
    .from("finance_entries")
    .select("id, is_auto_created, amount")
    .eq("billing_installment_id", opts.installmentId)
    .eq("is_voided", false)
    .maybeSingle<{ id: string; is_auto_created: boolean; amount: number }>();

  if (existing?.id) {
    // [MEDIUM-1] finance_entry.amount = ยอดสะสมล่าสุด (paid หลังบวก)
    // [HIGH-3] set receipt_id ถ้ามี
    // [HIGH-2] คง is_auto_created เดิม (ไม่ overwrite)
    const updatePayload: Record<string, unknown> = {
      amount: opts.paid,
      payment_date: opts.paidDate,
    };
    if (opts.receiptId != null) updatePayload.receipt_id = opts.receiptId;
    const { error } = await supabase
      .from("finance_entries")
      .update(updatePayload)
      .eq("id", existing.id);
    return error?.message ?? null;
  }

  // กรณี seq=1 (DEPOSIT): ค้น auto-created DEPOSIT ที่ยังไม่ผูกงวด → link แทน insert ใหม่
  // [HIGH-2] คง is_auto_created=true และ amount เดิมของมัดจำ (ไม่ overwrite ด้วยยอดงวด)
  if (opts.seq === 1) {
    const { data: autoDeposit } = await supabase
      .from("finance_entries")
      .select("id, amount")
      .eq("job_id", opts.jobId)
      .eq("type", "DEPOSIT")
      .eq("is_auto_created", true)
      .eq("is_voided", false)
      .is("billing_installment_id", null)
      .maybeSingle<{ id: string; amount: number }>();

    if (autoDeposit?.id) {
      // link เข้าหางวด — คง amount เดิม (มัดจำจริงที่รับ), คง is_auto_created=true
      // overwrite amount เฉพาะถ้ายอดงวดกับมัดจำเท่ากัน (ปกติควรเท่ากัน)
      const depositAmt = Number(autoDeposit.amount) || 0;
      const linkPayload: Record<string, unknown> = {
        billing_installment_id: opts.installmentId,
        source: "BILLING",
        // ไม่เปลี่ยน is_auto_created (คงเป็น true)
      };
      if (opts.receiptId != null) linkPayload.receipt_id = opts.receiptId;
      // อัปเดต payment_date ตามวันที่รับ แต่ไม่แตะ amount (คงยอดมัดจำจริง)
      // ยกเว้นถ้ายอดงวดตรงกับมัดจำพอดี ให้ sync เพื่อความสอดคล้อง
      if (Math.abs(depositAmt - opts.paid) < 0.01) {
        linkPayload.amount = opts.paid;
        linkPayload.payment_date = opts.paidDate;
      }
      const { error } = await supabase
        .from("finance_entries")
        .update(linkPayload)
        .eq("id", autoDeposit.id);
      return error?.message ?? null;
    }
  }

  // insert finance_entry ใหม่
  const insertPayload: Record<string, unknown> = {
    job_id: opts.jobId,
    amount: opts.paid,
    payment_date: opts.paidDate,
    type,
    channel: "TRANSFER",
    source: "BILLING",
    billing_installment_id: opts.installmentId,
    is_auto_created: false,
    is_voided: false,
  };
  if (opts.receiptId != null) insertPayload.receipt_id = opts.receiptId;
  const { error } = await supabase.from("finance_entries").insert(insertPayload);
  return error?.message ?? null;
}
