import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// PATCH /api/billing-notes/[id]/pay  → บันทึกรับชำระงวด + recompute สถานะใบวางบิล
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.installment_id) return fail("ต้องระบุงวดที่รับชำระ");

  const paid_amount = Number(body.paid_amount) || 0;
  if (paid_amount <= 0) return fail("ยอดรับชำระต้องมากกว่า 0");

  const supabase = createClient();

  // 1) ดึงงวด (ยืนยันว่าอยู่ในใบวางบิลนี้จริง) เพื่อคำนวณสถานะงวดจากยอดที่จ่าย
  const { data: inst, error: iErr } = await supabase
    .from("billing_installments")
    .select("amount")
    .eq("id", body.installment_id)
    .eq("billing_note_id", params.id)
    .single<{ amount: number }>();
  if (iErr || !inst) return fail("ไม่พบงวดในใบวางบิลนี้", 404);

  // installment_status enum = ('pending','paid') เท่านั้น → จ่ายครบ=paid, จ่ายบางส่วน=pending
  // (สถานะ "partial" อยู่ที่ระดับใบวางบิล billing_status ไม่ใช่ระดับงวด)
  const instStatus = paid_amount >= (Number(inst.amount) || 0) ? "paid" : "pending";

  // 2) update งวดที่รับชำระ
  const { error: uErr } = await supabase
    .from("billing_installments")
    .update({
      paid_amount,
      paid_date: body.paid_date || new Date().toISOString().slice(0, 10),
      status: instStatus,
    })
    .eq("id", body.installment_id)
    .eq("billing_note_id", params.id);
  if (uErr) return fail("บันทึกรับชำระไม่สำเร็จ: " + uErr.message, 500);

  // 2) recompute สถานะใบวางบิลจากผลรวม paid_amount เทียบ total
  const { data: bn, error: bErr } = await supabase
    .from("billing_notes")
    .select("total, billing_installments(paid_amount)")
    .eq("id", params.id)
    .single<{ total: number; billing_installments: { paid_amount: number }[] }>();
  if (bErr || !bn) return fail("ไม่พบใบวางบิล", 404);

  const totalPaid = (bn.billing_installments ?? []).reduce((a, i) => a + (Number(i.paid_amount) || 0), 0);
  const total = Number(bn.total) || 0;
  const status = totalPaid <= 0 ? "unpaid" : totalPaid >= total ? "paid" : "partial";

  const { error: sErr } = await supabase
    .from("billing_notes")
    .update({ status })
    .eq("id", params.id);
  if (sErr) return fail("อัปเดตสถานะไม่สำเร็จ: " + sErr.message, 500);

  return ok({ ok: true });
}
