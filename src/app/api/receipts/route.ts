import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { applyInstallmentPayment } from "@/lib/billing";
import type { BillingNote } from "@/lib/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// GET /api/receipts  → รายการใบเสร็จ/ใบกำกับภาษี
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("id, code, customer_snapshot, issue_date, net, payment_method, created_at")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/receipts  → สร้างใบเสร็จจากใบวางบิล/งวด (ออกรหัส + คำนวณ VAT ฝั่ง server)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.billing_note_id) return fail("ต้องเลือกใบวางบิล");

  const amount = Number(body.amount) || 0;
  if (amount <= 0) return fail("จำนวนเงินต้องมากกว่า 0");

  const vat_rate = Number(body.vat_rate) || 0;
  const payment_method = String(body.payment_method ?? "transfer");

  const supabase = createClient();

  // 1) ดึงใบวางบิล → copy customer_snapshot + job_id (ใช้กรณีไม่มี installment [HIGH-3])
  const { data: bn, error: bnErr } = await supabase
    .from("billing_notes")
    .select("id, customer_snapshot, job_id")
    .eq("id", body.billing_note_id)
    .single<Pick<BillingNote, "id" | "customer_snapshot"> & { job_id: string | null }>();
  if (bnErr || !bn) return fail("ไม่พบใบวางบิล", 404);

  // [MEDIUM-2] ถอด VAT ออกจากยอดรวม (amount = ยอดรวม VAT แล้ว)
  // vat_rate=7 → vat_amt = round(amount*7/107), base = amount - vat_amt, net = amount (ยอดรับจริง)
  // ไม่บวก VAT ซ้ำ (เดิมคิด amount*1.07 ผิด)
  let vat_amt = 0;
  if (vat_rate > 0) {
    vat_amt = round2((amount * vat_rate) / (100 + vat_rate));
  }
  const net = amount; // net = ยอดรวม VAT ที่รับจริง (ไม่บวกเพิ่ม)

  // 3) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "INV" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert ใบเสร็จ
  const { data: rc, error: rcErr } = await supabase
    .from("receipts")
    .insert({
      code,
      billing_note_id: bn.id,
      installment_id: body.installment_id ? Number(body.installment_id) : null,
      customer_snapshot: bn.customer_snapshot,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      amount,
      vat_rate,
      vat_amt,
      net,
      payment_method,
      note: body.note ?? "",
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (rcErr || !rc) return fail("บันทึกใบเสร็จไม่สำเร็จ: " + (rcErr?.message ?? ""), 500);

  const receiptId = Number((rc as { id: number; code: string }).id);

  // 5) ถ้าออกใบเสร็จต่องวด → ปิดงวดนั้น + recompute สถานะใบวางบิล (A1, helper ร่วมกับ /pay)
  // [HIGH-3] ส่ง receiptId เข้า applyInstallmentPayment เพื่อ set finance_entries.receipt_id
  if (body.installment_id) {
    const { error: payErr } = await applyInstallmentPayment(supabase, {
      installmentId: Number(body.installment_id),
      billingNoteId: String(bn.id),
      paidDate: body.issue_date, // ไม่ส่ง paidAmount = ปิดงวดเต็มจำนวน
      receiptId,
    });
    // ใบเสร็จออกสำเร็จแล้ว — ถ้า sync งวดพลาด ไม่ rollback แต่แจ้งเตือน (กันใบเสร็จหาย)
    if (payErr) return ok({ id: rc.id, code: rc.code, warn: "ออกใบเสร็จสำเร็จ แต่ปิดงวดไม่สำเร็จ: " + payErr }, 201);
  } else if (bn.job_id) {
    // [HIGH-3] ไม่มี installment แต่มี job_id → สร้าง finance_entry จากใบเสร็จตรงๆ
    // (เช่น ใบเสร็จจ่ายตรงโดยไม่ผ่านงวด) เพื่อให้เงินรับเข้าเส้น B
    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10);
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
