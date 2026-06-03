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

  // 1) update งวดที่รับชำระ (ต้องอยู่ในใบวางบิลนี้)
  const { error: uErr } = await supabase
    .from("billing_installments")
    .update({
      paid_amount,
      paid_date: body.paid_date || new Date().toISOString().slice(0, 10),
      status: "paid",
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
