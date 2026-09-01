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

/**
 * "ผูกงาน + ดันเข้าผลิต" สำหรับใบวางบิลที่ยังไม่มีงาน (job_id null)
 *   เคสเจ้าของ 22 ส.ค.69 (BL2569080073): ใบเสนอนอกระบบพิมพ์เอง (ลูกค้าใหม่ยังไม่มีงาน)
 *   → วางบิล + บันทึกชำระแล้ว แต่งานไม่เข้าผลิต เพราะ bn.job_id = null → sync/promote ถูกข้าม
 * สิ่งที่ทำ (idempotent — รันซ้ำปลอดภัย):
 *   1) ถ้ายังไม่มีงาน → สร้างงานจากลูกค้าของใบเสนอ/บิล (PENDING_QUOTE) แล้วผูก billing + quotation
 *   2) เติม finance_entries ย้อนหลังทุกงวดที่จ่ายแล้ว (กันเงินไม่เข้าบัญชี · ผูก receipt_id ถ้ามี)
 *   3) งวดมัดจำ (seq 1) จ่ายแล้ว → ดันงานเข้าผลิต (DEPOSITED → trigger สร้าง production)
 */
const CH_MAP: Record<string, string> = { LINE: "LINE", FB: "FACEBOOK", FACEBOOK: "FACEBOOK", IG: "INSTAGRAM", INSTAGRAM: "INSTAGRAM", OTHER: "OTHER" };

export async function ensureBillingJobAndPromote(
  supabase: SupabaseClient, billingNoteId: string, profileId: string,
): Promise<{ error?: string; jobId?: string; created?: boolean; promoted?: boolean; backfilled?: number }> {
  // 1) โหลดใบวางบิล
  const { data: bn } = await supabase
    .from("billing_notes")
    .select("id, status, job_id, quotation_id, customer_snapshot")
    .eq("id", billingNoteId)
    .single<{ id: string; status: string; job_id: string | null; quotation_id: number | null; customer_snapshot: Record<string, unknown> | null }>();
  if (!bn) return { error: "ไม่พบใบวางบิล" };
  if (bn.status === "cancelled") return { error: "ใบวางบิลถูกยกเลิกแล้ว" };

  let jobId = bn.job_id;
  let created = false;

  // 2) ยังไม่มีงาน → สร้างให้ + ผูก
  if (!jobId) {
    let customerId: number | null = null;
    let snap: Record<string, unknown> = bn.customer_snapshot ?? {};
    if (bn.quotation_id) {
      const { data: q } = await supabase
        .from("quotations").select("customer_id, customer_snapshot").eq("id", bn.quotation_id)
        .maybeSingle<{ customer_id: number | null; customer_snapshot: Record<string, unknown> | null }>();
      if (q?.customer_id != null) customerId = q.customer_id;
      if (q?.customer_snapshot) snap = q.customer_snapshot;
    }
    // ⚠ ชื่อในผลิต/ติดตั้ง = ชื่อลูกค้าจริง (customers.name) ไม่ใช่นามบิล/บริษัทใน snapshot (25 ส.ค.69)
    let name = "";
    let area = "";   // ที่อยู่ (customer_area) — ต้องดึงจากทะเบียนด้วย ไม่งั้นผลิต/ติดตั้งที่อยู่ว่าง (บัคคุณธนัชชา 30 ส.ค.69)
    if (customerId != null) {
      const { data: rc } = await supabase.from("customers").select("name, address").eq("id", customerId).maybeSingle<{ name: string; address: string }>();
      name = String(rc?.name ?? "").trim();
      area = String(rc?.address ?? "").trim();
    }
    if (!name) name = String((snap?.name as string) ?? "").trim() || "ลูกค้า";
    if (!area) area = String((snap?.address as string) ?? "").trim();
    const ch = CH_MAP[String((snap?.contact_channel as string) ?? "").toUpperCase()] ?? "OTHER";
    const { data: newJob, error: jErr } = await supabase
      .from("jobs")
      .insert({ customer_name: name, ...(customerId != null ? { customer_id: customerId } : {}), ...(area ? { customer_area: area } : {}), channel: ch, assess_date: today(), status: "PENDING_QUOTE" } as never)
      .select("id")
      .single<{ id: string }>();
    if (jErr || !newJob) return { error: "สร้างงานไม่สำเร็จ: " + (jErr?.message ?? "") };
    jobId = newJob.id;
    created = true;
    await supabase.from("billing_notes").update({ job_id: jobId }).eq("id", billingNoteId);
    if (bn.quotation_id) await supabase.from("quotations").update({ job_id: jobId }).eq("id", bn.quotation_id);
  }

  // 3) เติม finance_entries ย้อนหลัง (ทุกงวดที่จ่ายแล้ว)
  const { data: paidInsts } = await supabase
    .from("billing_installments")
    .select("id, seq, paid_amount, paid_date")
    .eq("billing_note_id", billingNoteId)
    .gt("paid_amount", 0)
    .order("seq", { ascending: true });
  const insts = (paidInsts ?? []) as { id: number; seq: number; paid_amount: number; paid_date: string | null }[];
  const receiptOf = new Map<number, number>();
  if (insts.length) {
    const { data: rcs } = await supabase
      .from("receipts").select("id, installment_id")
      .in("installment_id", insts.map((i) => i.id)).eq("is_voided", false);
    for (const r of (rcs ?? []) as { id: number; installment_id: number | null }[]) {
      if (r.installment_id != null) receiptOf.set(r.installment_id, r.id);
    }
  }
  let backfilled = 0;
  for (const it of insts) {
    const err = await syncFinanceEntry(supabase, {
      jobId, installmentId: it.id, seq: it.seq,
      paid: Number(it.paid_amount) || 0,
      paidDate: it.paid_date || today(),
      ...(receiptOf.has(it.id) ? { receiptId: receiptOf.get(it.id) } : {}),
    });
    if (!err) backfilled++;
  }

  // 4) งวดมัดจำจ่ายแล้ว → ดันเข้าผลิต
  let promoted = false;
  const dep1 = insts.find((i) => i.seq === 1);
  if (dep1) {
    await promoteJobToProductionIfPending(supabase, jobId, dep1.paid_date || today());
    promoted = true;
  }
  void profileId;
  return { jobId, created, promoted, backfilled };
}

// ============================================================
// Rev ใบวางบิลได้แม้ชำระแล้ว (24 ส.ค.69) — หา "งวด locked" จริงจาก DB
//   ต้องตรงนิยามเดียวกับ RPC replace_unpaid_installments (0126) เป๊ะ ไม่งั้นแผนที่คิดฝั่ง TS
//   จะไม่ตรงกับที่ RPC เห็นจริง (RPC จะ raise LOCKED_CHANGED กันไว้อีกชั้นถ้าไม่ตรง — แต่ควรตรงกันตั้งแต่ต้น)
//   locked = paid หรือ paid_amount>0 (จ่ายบางส่วนก็ locked) หรือมี receipts/finance_entries ผูก (ไม่สนใจ is_voided)
// ============================================================
export interface InstallmentForLock {
  id: number;
  seq: number;
  label: string;
  amount: number;
  paid_amount: number | null;
  status: string;
  base_amt?: number | null;
  kind?: string | null;
}

export interface LockedInstallmentsResult {
  lockedIds: Set<number>;
  lockedSum: number;
  paidLocked: number;
  lockedMaterialBase: number;  // Σ base_amt kind='material'|'retention' (locked)
  lockedLaborBase: number;     // Σ base_amt kind='labor' (locked)
  lockedUnknownBase: number;   // locked แต่ไม่รู้ kind/base_amt ชัด (ใบเก่า) — ใช้ amount แทน (อนุรักษ์นิยม) + ยก taxWarning
}

export async function classifyLockedInstallments(
  supabase: SupabaseClient,
  installments: InstallmentForLock[],
): Promise<LockedInstallmentsResult> {
  const ids = installments.map((i) => i.id).filter((v): v is number => v != null);
  const receiptIds = new Set<number>();
  const financeIds = new Set<number>();
  if (ids.length > 0) {
    const [{ data: rc }, { data: fe }] = await Promise.all([
      supabase.from("receipts").select("installment_id").in("installment_id", ids),
      supabase.from("finance_entries").select("billing_installment_id").in("billing_installment_id", ids),
    ]);
    for (const r of (rc ?? []) as { installment_id: number | null }[]) {
      if (r.installment_id != null) receiptIds.add(Number(r.installment_id));
    }
    for (const f of (fe ?? []) as { billing_installment_id: number | null }[]) {
      if (f.billing_installment_id != null) financeIds.add(Number(f.billing_installment_id));
    }
  }

  const lockedIds = new Set<number>();
  let lockedSum = 0, paidLocked = 0, lockedMaterialBase = 0, lockedLaborBase = 0, lockedUnknownBase = 0;
  for (const i of installments) {
    const paid = Number(i.paid_amount) || 0;
    const locked = i.status === "paid" || paid > 0 || receiptIds.has(i.id) || financeIds.has(i.id);
    if (!locked) continue;
    lockedIds.add(i.id);
    lockedSum = round2(lockedSum + (Number(i.amount) || 0));
    paidLocked = round2(paidLocked + paid);
    const base = i.base_amt != null ? Number(i.base_amt) : null;
    if (base == null || !i.kind) {
      lockedUnknownBase = round2(lockedUnknownBase + (base ?? (Number(i.amount) || 0)));
    } else if (i.kind === "labor") {
      lockedLaborBase = round2(lockedLaborBase + base);
    } else {
      lockedMaterialBase = round2(lockedMaterialBase + base); // material + retention
    }
  }
  return { lockedIds, lockedSum, paidLocked, lockedMaterialBase, lockedLaborBase, lockedUnknownBase };
}
