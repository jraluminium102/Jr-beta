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
  /** ยืนยันว่ารับเงินจริง — ข้าม guard "มากกว่ามัดจำเดิม" (ผู้ใช้กดยืนยันหลังเห็นคำเตือน · เช่น มัดจำเป็น token
   *  ก้อนเล็กที่ลงไว้ก่อน แล้วลูกค้าจ่ายงวดเต็มทีหลัง) — มัดจำเดิมจะถูกอัปเป็นยอดงวดที่รับจริง (ไม่แตกบัญชี) */
  force?: boolean;
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

const PRE_DEPOSIT_STATUSES = ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"];

/**
 * ดันงานเข้าผลิตเมื่อจ่ายงวดมัดจำ (seq 1) แล้ว — ถ้างานยังเป็นสถานะ "ก่อนมัดจำ" → set DEPOSITED + deposit_date
 *   → trigger tg_on_deposit สร้าง production PENDING_MEASURE + stage 9 · deposit_amount คงเป็น null = ไม่สร้าง finance ซ้ำ
 *     (เงินลงแล้วจากการจ่ายงวด/backfill · trigger ข้ามสร้าง finance เพราะ deposit_amount null)
 * ใช้ทั้งตอนจ่ายงวด (applyInstallmentPayment) และตอนผูกใบวางบิลนอกระบบเข้างาน (link route backfill)
 * บทเรียน: เดิมจ่ายงวด 1 บนใบวางบิลแล้วเงินลงแต่งานไม่เข้าผลิต ต้องกดมัดจำเองอีกที (เจ้าของเจอ Steve BL2569080059)
 * best-effort: ไม่ throw — ถ้าพลาดก็ไม่ทำให้การจ่ายเงินล้ม
 */
export async function promoteJobToProductionIfPending(
  supabase: SupabaseClient, jobId: string | null | undefined, depositDate: string,
): Promise<void> {
  if (!jobId) return;
  const { data: job } = await supabase
    .from("jobs").select("status").eq("id", jobId).maybeSingle();
  const status = (job as { status?: string } | null)?.status;
  if (status && PRE_DEPOSIT_STATUSES.includes(status)) {
    await supabase.from("jobs").update({ status: "DEPOSITED", deposit_date: depositDate }).eq("id", jobId);
  }
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
): Promise<{ error?: string; needsConfirm?: boolean; suggested?: number }> {
  // 1) ยืนยันงวดอยู่ในใบวางบิลนี้จริง + อ่านยอดงวด + seq + paid_amount ปัจจุบัน
  const { data: inst, error: iErr } = await supabase
    .from("billing_installments")
    .select("amount, seq, paid_amount")
    .eq("id", opts.installmentId)
    .eq("billing_note_id", opts.billingNoteId)
    .single<{ amount: number; seq: number; paid_amount: number | null }>();
  if (iErr || !inst) return { error: "ไม่พบงวดในใบวางบิลนี้" };

  // กันรับชำระ/ออกใบเสร็จให้บิลที่ถูกยกเลิกแล้ว (กัน race กับ cascade void — การชำระที่ commit หลัง cancel
  //   จะเขียนทับ status ปลุกบิล cancelled กลับมา paid/partial เงียบ ๆ · QA HIGH)
  const { data: bnStatus } = await supabase
    .from("billing_notes")
    .select("status")
    .eq("id", opts.billingNoteId)
    .single<{ status: string }>();
  if (bnStatus?.status === "cancelled") return { error: "ใบวางบิลนี้ถูกยกเลิกแล้ว — บันทึกรับชำระ/ออกใบเสร็จไม่ได้" };

  const amount = Number(inst.amount) || 0;

  // ── guard มัดจำ: งวด 1 ที่มีมัดจำ auto รออยู่ ยอดต้องตรงกัน (บัญชี P0 · เช็คก่อนแตะงวด) ──
  // ปัญหาเดิม: งาน DEPOSITED → trigger สร้าง finance_entry มัดจำ (เช่น 30,000) ไว้ก่อน (ยังไม่ผูกงวด)
  //   ออกบิลทีหลัง งวด 1 = 59,500 → ปุ่ม "บันทึกชำระ" prefill 59,500 มาให้ → กดยืนยันตามที่เห็น
  //   → งวดถูก mark paid 59,500 แต่ฝั่งเงินสดมีจริง 30,000 (โค้ดข้างล่างตั้งใจไม่ทับ amount มัดจำ)
  //   = บัญชีแตกสองทางเงียบ ๆ · ใบเสร็จออกตามเงินจริง 30,000 (≠ บิล) · แล้ว 29,500 ที่เหลือ
  //     ออกใบเสร็จไม่ได้อีกเลย เพราะงวดปิดไปแล้ว (guard กันออกซ้ำต่องวด)
  // → ปฏิเสธไปเลย บอกยอดมัดจำจริง ให้ผู้ใช้ตัดสินใจ ดีกว่าบันทึกเลขที่ไม่ตรงเงิน
  //
  // ⚠ แก้ 7 ส.ค.69 — เดิมบล็อก "ทั้งสองทาง" (ต่างกันสตางค์เดียวก็ไม่ให้ผ่าน)
  //   ทำให้เคส **มัดจำมากกว่ายอดงวด 1** โดนบล็อกไปด้วย ทั้งที่ทางนั้นไม่อันตราย
  //   (เคสจริง BL2569080013: มัดจำเข้าจริง 141,240 · งวด 1 = 123,000 → ปิดงวดไม่ได้เป็นวัน ๆ)
  //   เงินอยู่ในมือ 141,240 การบันทึกปิดงวดที่ 123,000 ไม่ได้ทำให้บัญชีเกินความจริงเลย
  //   ส่วนเกิน 18,240 ยังอยู่ครบใน finance_entry ของมัดจำ (โค้ดด้านล่างไม่ทับ amount)
  //   → บล็อกเฉพาะทางที่อันตรายจริง = "บันทึกมากกว่าเงินที่เข้าจริง" เท่านั้น
  if (inst.seq === 1) {
    const { data: bnJob } = await supabase
      .from("billing_notes")
      .select("job_id")
      .eq("id", opts.billingNoteId)
      .single<{ job_id: string | null }>();
    const { data: pendingDeposit } = bnJob?.job_id
      ? await supabase
          .from("finance_entries")
          .select("amount")
          .eq("job_id", bnJob.job_id)
          .eq("type", "DEPOSIT")
          .eq("is_auto_created", true)
          .eq("is_voided", false)
          .is("billing_installment_id", null)
          .maybeSingle<{ amount: number }>()
      : { data: null };
    if (pendingDeposit && !opts.force) {
      const depositAmt = round2(Number(pendingDeposit.amount) || 0);
      // ยอดที่กำลังจะบันทึกรวมทั้งงวด (สะสมกับที่เคยจ่าย) — ต้องเท่ามัดจำจริง
      const willBe = opts.paidAmount != null
        ? round2((Number(inst.paid_amount) || 0) + (Number(opts.paidAmount) || 0))
        : amount;
      if (willBe - depositAmt >= 0.01) {
        // ไม่ block ตายตัว — คืน needsConfirm ให้หน้าจอถามยืนยัน แล้วส่ง force มาปิดได้
        //   (เคสจริง: มัดจำเป็น token ก้อนเล็ก 7,000 ที่ลงไว้ก่อน · งวด 1 จริง 138,044.27 · ลูกค้าจ่ายเต็มแล้ว)
        return {
          error: `บันทึกชำระ ฿${willBe.toLocaleString("th-TH", { minimumFractionDigits: 2 })} มากกว่ามัดจำที่บันทึกไว้เดิม (฿${depositAmt.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`
            + ` — ถ้าลูกค้าจ่ายยอดนี้จริง กด “ยืนยันรับเงินจริง” เพื่อบันทึก (ระบบจะปรับมัดจำเดิมเป็นยอดนี้ให้)`,
          needsConfirm: true,
          suggested: willBe,
        };
      }
    }
  }

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
    .eq("id", opts.billingNoteId)
    .neq("status", "cancelled");   // กันปลุกบิลที่ยกเลิกแล้วกลับมา (defensive · คู่กับ guard ต้นฟังก์ชัน)
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
    // จ่ายงวดมัดจำ (seq 1) แล้ว → ดันงานเข้าผลิตอัตโนมัติ (ถ้ายังไม่มัดจำ) — กันเคสงานไม่เด้งเข้าผลิต
    if (inst.seq === 1) {
      await promoteJobToProductionIfPending(supabase, bn.job_id, opts.paidDate || today());
    }
  }

  return {};
}

/**
 * sync หรือ upsert finance_entry เส้น B
 * export ไว้ให้ "ผูกใบวางบิลนอกระบบเข้าระบบ" (0124) เติมเงินย้อนหลังได้ —
 * งวดที่รับเงินไปแล้วตอนยังไม่มี job_id จะถูกข้าม sync (บรรทัด `if (bn.job_id …)` ด้านบน)
 * พอผูกงานทีหลังต้องเรียกตัวนี้ย้อนทุกงวดที่จ่ายแล้ว ไม่งั้นเงินไม่เข้าบัญชี/ค้างรับ
 */
export async function syncFinanceEntry(
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
      // มัดจำเดิม = "ก้อนแรก" ของงวดนี้ · ถ้ารับงวด >= มัดจำ → ยอด finance = ยอดงวดที่รับจริง
      //   (token ก้อนเล็ก เช่น 7,000 โตเป็นงวดเต็ม 138,044.27 · บัญชีไม่แตกสองทาง)
      //   ถ้ามัดจำ > ยอดงวด (เงินในมือเกิน · เช่น BL2569080013) → คงยอดมัดจำเดิมไว้ ไม่ลด
      if (opts.paid >= depositAmt - 0.01) {
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
