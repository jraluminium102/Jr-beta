import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
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

  // 1) ดึงใบวางบิล → copy customer_snapshot
  const { data: bn, error: bnErr } = await supabase
    .from("billing_notes")
    .select("id, customer_snapshot")
    .eq("id", body.billing_note_id)
    .single<Pick<BillingNote, "id" | "customer_snapshot">>();
  if (bnErr || !bn) return fail("ไม่พบใบวางบิล", 404);

  // 2) คำนวณ VAT (vat แยกจากยอด) + ยอดสุทธิ
  const vat_amt = round2((amount * vat_rate) / 100);
  const net = round2(amount + vat_amt);

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

  return ok({ id: rc.id, code: rc.code }, 201);
}
