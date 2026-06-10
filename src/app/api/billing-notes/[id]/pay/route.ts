import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { applyInstallmentPayment } from "@/lib/billing";

// PATCH /api/billing-notes/[id]/pay  → บันทึกรับชำระงวด + recompute สถานะใบวางบิล
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN(); // [🟡#6] รับเงิน = สิทธิ์ finance (ADMIN/ACCOUNTING)

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.installment_id) return fail("ต้องระบุงวดที่รับชำระ");

  const paid_amount = Number(body.paid_amount) || 0;
  if (paid_amount <= 0) return fail("ยอดรับชำระต้องมากกว่า 0");

  const supabase = createClient();

  // ใช้ helper ร่วม (แหล่งความจริงเดียวกับ POST /receipts) — A1
  const { error } = await applyInstallmentPayment(supabase, {
    installmentId: body.installment_id,
    billingNoteId: params.id,
    paidAmount: paid_amount,
    paidDate: body.paid_date,
  });
  if (error) return fail("บันทึกรับชำระไม่สำเร็จ: " + error, 500);

  return ok({ ok: true });
}
