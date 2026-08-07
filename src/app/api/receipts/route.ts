import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { applyInstallmentPayment } from "@/lib/billing";
import { effectiveBillVat, splitCashReceived } from "@/lib/money";
import { getDocCutoff } from "@/lib/doc-cutoff";
import { nextDocumentCode } from "@/lib/doc-code";
import { businessDateIssue } from "@/lib/date-guard";
import type { BillingNote } from "@/lib/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// GET /api/receipts  → รายการใบเสร็จ/ใบกำกับภาษี (ซ่อนเอกสารทดสอบก่อนวันตัด · ?includeTest=1 โชว์ทั้งหมด)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const includeTest = new URL(req.url).searchParams.get("includeTest") === "1";
  const cutoff = includeTest ? "" : await getDocCutoff();
  const supabase = createClient();
  let query = supabase
    .from("receipts")
    .select("id, code, customer_snapshot, issue_date, net, payment_method, created_at, is_voided")
    .order("created_at", { ascending: false });
  if (cutoff) query = query.gte("issue_date", cutoff);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/receipts  → สร้างใบเสร็จจากใบวางบิล/งวด (ออกรหัส + คำนวณ VAT ฝั่ง server)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN(); // [🟡#6] ออกใบเสร็จ = สิทธิ์ finance (ADMIN/ACCOUNTING)

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.billing_note_id) return fail("ต้องเลือกใบวางบิล");

  let amount = Number(body.amount) || 0;
  if (amount <= 0) return fail("จำนวนเงินต้องมากกว่า 0");

  const payment_method = String(body.payment_method ?? "transfer");

  const supabase = createClient();

  // 1) ดึงใบวางบิล → copy customer_snapshot + job_id (ใช้กรณีไม่มี installment [HIGH-3])
  const { data: bn, error: bnErr } = await supabase
    .from("billing_notes")
    .select("id, customer_snapshot, job_id, vat_rate, vat_rate_set, wht_rate, status")
    .eq("id", body.billing_note_id)
    .single<Pick<BillingNote, "id" | "customer_snapshot"> & { job_id: string | null; vat_rate: number | null; vat_rate_set: boolean | null; wht_rate: number | null; status: string }>();
  if (bnErr || !bn) return fail("ไม่พบใบวางบิล", 404);
  // กันออกใบเสร็จให้บิลที่ถูกยกเลิกแล้ว (กัน race กับ cascade void — บิล cancelled ห้ามรับชำระ/ออกใบเสร็จ)
  if (bn.status === "cancelled") return fail("ใบวางบิลนี้ถูกยกเลิกแล้ว — ออกใบเสร็จไม่ได้", 409);

  // ── vat_rate ของใบเสร็จ = ของ "ใบวางบิลใบนี้" (แหล่งความจริงเดียว · effectiveBillVat ใน money.ts) ──
  // เดิมอ่านจาก jobs.vat_rate → บั๊ก: jobs.vat_rate ถูกเขียนครั้งเดียวตอนสร้างใบเสนอ และ "ไม่เคยอัปเดต"
  // เวลาผู้ใช้กด "แก้ VAT/ส่วนลด" ที่ใบวางบิล (PATCH โหมด B เขียน billing_notes.vat_rate + คิดยอด/งวดใหม่)
  // → ใบวางบิลติ๊ก VAT ออก แต่ใบเสร็จยังถอด VAT 7% จากงาน = base/VAT ไม่ตรงใบวางบิลทั้งก่อนและหลัง VAT
  // ใช้ helper เดียวกับหน้าใบวางบิล/หน้าสร้างใบเสร็จ → ใบเสร็จตรงกับใบที่ส่งลูกค้าเสมอ
  let jobVatRate = 7;
  if (bn.job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: j } = await (supabase as any).from("jobs").select("vat_rate").eq("id", bn.job_id).single();
    jobVatRate = Number(j?.vat_rate ?? 7);
  }
  const vat_rate = effectiveBillVat(bn, jobVatRate); // ignore body.vat_rate เสมอ (ไม่เชื่อ client)

  // [idempotency/partial] ถ้าระบุงวด → ตรวจยอดคงเหลือก่อนสร้างใบเสร็จ
  // กันออกใบเสร็จซ้ำงวดที่ปิดแล้ว และกันรับเกินยอดคงเหลือ (รองรับจ่ายบางส่วน)
  // ภาษี booked ต่องวด (0102) — ถ้างวดมี base_amt = โมเดลค่าแรง (17 ก.ค.) → ใบเสร็จอ่านของงวดตรง ๆ ไม่ถอดใหม่
  let bookedTax: { base: number; vat: number; wht: number; vat_rate: number; wht_rate: number } | null = null;
  // อัตราภาษี booked ของงวด (0102) — ใช้ตอน fallback ด้วย: งวดค่าของ wht_rate=0 ต้องไม่หัก แม้ยอดรับไม่ตรงเป๊ะ (พนักงานพิมพ์ยอดกลม)
  let instBookedRates: { vat_rate: number; wht_rate: number } | null = null;
  if (body.installment_id) {
    // ⚠ select("*") ไม่ล็อกคอลัมน์ — กันพังถ้า migration 0102 (base_amt/vat_amt/wht_amt/vat_rate/wht_rate) ยังไม่รัน
    //   เดิม select ระบุคอลัมน์ 0102 ตรงๆ → คอลัมน์ไม่มี = SELECT error → เด้ง "ไม่พบงวด" (ข้อความหลอก · ออกใบเสร็จไม่ได้ทั้งใบ)
    //   ไม่มี 0102 → inst.base_amt = undefined → ตกไป path ภาษี legacy อัตโนมัติ (โค้ดข้างล่างเช็ค base_amt != null อยู่แล้ว)
    const { data: inst, error: instErr } = await supabase
      .from("billing_installments")
      .select("*")
      .eq("id", Number(body.installment_id))
      .eq("billing_note_id", bn.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single<any>();
    if (instErr || !inst) return fail("ไม่พบงวดในใบวางบิลนี้", 404);
    const paidAmt = round2(Number(inst.paid_amount) || 0);
    const remaining = round2((Number(inst.amount) || 0) - paidAmt);
    // ออกใบเสร็จได้เฉพาะงวดที่ "รับชำระแล้ว" (หลักบัญชี: ใบเสร็จออกเมื่อรับเงินจริง)
    // — บันทึกชำระก่อน (ปุ่ม "บันทึกชำระ") แล้วจึงออกใบเสร็จ
    if (inst.status !== "paid" && remaining > 0.01) {
      return fail("งวดนี้ยังไม่ได้รับชำระเต็มจำนวน — บันทึกชำระก่อนจึงออกใบเสร็จได้", 409);
    }
    // กันออกใบเสร็จซ้ำต่องวด
    const { data: existRc } = await supabase
      .from("receipts").select("id").eq("installment_id", Number(body.installment_id)).eq("is_voided", false).maybeSingle();
    if (existRc) return fail("งวดนี้ออกใบเสร็จแล้ว ออกซ้ำไม่ได้", 409);
    // ยอดใบเสร็จ = "เงินที่รับจริง" จาก finance_entry ที่ผูกงวดนี้ (ยึดยอดที่ลงบัญชี)
    // กันเคสมัดจำ: paid_amount ของงวดอาจถูกตั้ง ≠ ยอดมัดจำจริง → ใบเสร็จต้องตรงเงินที่ลงระบบ
    const { data: fe } = await supabase
      .from("finance_entries").select("amount")
      .eq("billing_installment_id", Number(body.installment_id)).eq("is_voided", false)
      .maybeSingle<{ amount: number }>();
    amount = fe ? round2(Number(fe.amount) || 0) : (paidAmt > 0 ? paidAmt : round2(Number(inst.amount) || 0));
    if (amount <= 0) return fail("ไม่พบยอดเงินที่รับจริงของงวดนี้ — ตรวจสอบการบันทึกชำระก่อน", 409);
    // ภาษี booked ต่องวด (0102) — ใช้เมื่อ base_amt ตั้งไว้ + เงินรับตรงกับงวด (จ่ายเต็มงวด) → อ่านตรง ไม่ถอดใหม่
    if (inst.base_amt != null) {
      instBookedRates = { vat_rate: Number(inst.vat_rate) || 0, wht_rate: Number(inst.wht_rate) || 0 };
      const bookedAmt = round2(Number(inst.base_amt) + Number(inst.vat_amt) - Number(inst.wht_amt));
      if (Math.abs(bookedAmt - amount) <= 0.01) {
        bookedTax = { base: round2(Number(inst.base_amt)), vat: round2(Number(inst.vat_amt)), wht: round2(Number(inst.wht_amt)), vat_rate: instBookedRates.vat_rate, wht_rate: instBookedRates.wht_rate };
      }
    }
  }

  // ── แยกเงินสดที่รับ → ฐาน / VAT / หัก ณ ที่จ่าย ──
  //   งวด booked (โมเดลค่าแรง 17 ก.ค.) → อ่าน base/vat/wht ของงวดตรง ๆ (WHT อยู่งวดค่าแรงงวดเดียว งวดค่าของ wht=0)
  //   งวดเก่า/ทั้งใบ → splitCashReceived gross-up ระดับใบเหมือนเดิม (amount เป็นยอดหลัง WHT · ฐาน=A/(1+r−w))
  //   ⚠ WHT ไม่ลดฐาน VAT (ม.50/69 ทวิ) · หน้าพิมพ์ห้ามคิดเอง (เอกสารภาษีต้องนิ่ง)
  let vat_amt: number, base_amt: number, wht_amt: number, wht_rate: number, vatRateUsed: number;
  if (bookedTax) {
    base_amt = bookedTax.base; vat_amt = bookedTax.vat; wht_amt = bookedTax.wht;
    wht_rate = bookedTax.wht_rate; vatRateUsed = bookedTax.vat_rate;
  } else {
    // งวด booked ที่ยอดรับไม่ตรงเป๊ะ → ยังใช้ "อัตราของงวด" (งวดค่าของ wht=0 จะไม่หัก) · งวดเก่า → อัตราของใบ
    wht_rate = instBookedRates ? instBookedRates.wht_rate : (Number(bn.wht_rate) || 0);
    const effVat = instBookedRates ? instBookedRates.vat_rate : vat_rate;
    const split = splitCashReceived(amount, effVat, wht_rate);
    vat_amt = split.vat; base_amt = split.base; wht_amt = split.wht; vatRateUsed = effVat;
  }
  const net = amount; // net = เงินสดที่รับจริงเสมอ (ต้องกระทบยอดกับ finance_entries/statement ได้)

  // issue_date = tax point ของใบเสร็จ/ใบกำกับภาษี — คุมทั้งเลขเอกสารและ header (คำนวณครั้งเดียวใช้ร่วมกัน)
  const issueDate = body.issue_date || new Date().toISOString().slice(0, 10);
  const dateIssue = businessDateIssue(issueDate, { label: "วันที่ออก" }); // เอกสารภาษี — ห้ามอนาคต (default allowFuture=false)
  if (dateIssue) return fail(dateIssue, 400);

  // 3) ออกรหัสอัตโนมัติผ่าน RPC — เลขต้องตรงเดือนของ issue_date (tax point)
  const { code, error: codeErrMsg } = await nextDocumentCode(supabase, "INV", issueDate);
  if (!code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErrMsg ?? ""), 500);

  // 4) insert ใบเสร็จ
  const rcBase = {
    code,
    billing_note_id: bn.id,
    installment_id: body.installment_id ? Number(body.installment_id) : null,
    customer_snapshot: bn.customer_snapshot,
    issue_date: issueDate,
    amount,
    vat_rate: vatRateUsed,
    vat_amt,
    net,
    payment_method,
    note: body.note ?? "",
    item_desc: (body.item_desc ?? "").toString().trim(),
    created_by: profile.id,
  };
  // snapshot ยอดแยก (0095) — ฐาน/หัก ณ ที่จ่าย ณ วันออกใบ (เอกสารภาษีต้องนิ่ง หน้าพิมพ์ห้ามคิดเอง)
  let { data: rc, error: rcErr } = await supabase
    .from("receipts").insert({ ...rcBase, base_amt, wht_rate, wht_amt }).select("id, code").single();
  // กันพัง: ถ้า 0095 ยังไม่รัน → insert แบบเดิม (ยอด/VAT ยังถูก · ใบที่มี WHT จะเตือนให้รัน migration)
  if (rcErr && /base_amt|wht_rate|wht_amt/i.test(rcErr.message ?? "")) {
    if (wht_rate > 0) return fail("ใบวางบิลนี้มีหัก ณ ที่จ่าย — ต้องรัน migration 0095 ก่อนออกใบเสร็จ (ไม่งั้นฐานภาษีบนใบจะผิด)", 400);
    ({ data: rc, error: rcErr } = await supabase.from("receipts").insert(rcBase).select("id, code").single());
  }
  if (rcErr || !rc) return fail("บันทึกใบเสร็จไม่สำเร็จ: " + (rcErr?.message ?? ""), 500);

  const receiptId = Number((rc as { id: number; code: string }).id);

  // 5) ถ้าออกใบเสร็จต่องวด → ปิดงวดนั้น + recompute สถานะใบวางบิล (A1, helper ร่วมกับ /pay)
  // [HIGH-3] ส่ง receiptId เข้า applyInstallmentPayment เพื่อ set finance_entries.receipt_id
  if (body.installment_id) {
    const { error: payErr } = await applyInstallmentPayment(supabase, {
      installmentId: Number(body.installment_id),
      billingNoteId: String(bn.id),
      // งวดนี้รับชำระแล้ว (guard ด้านบนบังคับ) → ไม่ส่ง paidAmount = ไม่บวกเงินซ้ำ
      // applyInstallmentPayment จะ set paid=amount (idempotent) + ผูก receiptId เข้า finance_entry เดิม
      paidDate: issueDate,
      receiptId,
    });
    // ถ้า sync งวด/finance พลาด → rollback ลบใบเสร็จที่เพิ่งสร้าง (กันเอกสารภาษีลอย ไม่ผูกเงิน)
    if (payErr) {
      await supabase.from("receipts").delete().eq("id", receiptId);
      return fail("ออกใบเสร็จไม่สำเร็จ (ปิดงวด/ผูกเงินไม่ได้): " + payErr, 500);
    }
  } else if (bn.job_id) {
    // [HIGH-3] ไม่มี installment_id → ตรวจก่อนว่าบิลนี้มีงวดหรือไม่
    // ถ้ามีงวด (≥1) แต่ไม่ระบุ installment_id → reject 400 (กัน finance_entry ลอย)
    const { count: instCount } = await supabase
      .from("billing_installments")
      .select("id", { count: "exact", head: true })
      .eq("billing_note_id", bn.id);

    if ((instCount ?? 0) >= 1) {
      // ลบใบเสร็จที่เพิ่งสร้างออก (rollback best-effort) แล้ว reject
      await supabase.from("receipts").delete().eq("id", receiptId);
      return fail("ใบวางบิลนี้มีงวด กรุณาเลือกงวดที่จะออกใบเสร็จ", 400);
    }

    // บิลไม่มีงวดเลย → สร้าง finance_entry ตรงได้ตามปกติ (issueDate คำนวณไว้แล้วด้านบน)
    await supabase.from("finance_entries").insert({
      job_id: bn.job_id,
      amount,
      payment_date: issueDate,
      type: "FINAL",
      channel: "TRANSFER",
      source: "BILLING",
      receipt_id: receiptId,
      billing_installment_id: null,
      is_auto_created: false,
      is_voided: false,
    });
    // best-effort: ไม่ fail ใบเสร็จถ้า finance_entry insert พลาด
  }

  return ok({ id: rc.id, code: rc.code }, 201);
}
