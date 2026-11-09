import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { applyInstallmentPayment } from "@/lib/billing";
import { setJobOnsiteDeposit } from "@/lib/onsite-deposit";

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
  //   force = ผู้ใช้กดยืนยัน "รับเงินจริง" หลังเห็นคำเตือน (มัดจำ token < งวดจริง) → ข้าม guard
  const res = await applyInstallmentPayment(supabase, {
    installmentId: body.installment_id,
    billingNoteId: params.id,
    paidAmount: paid_amount,
    paidDate: body.paid_date,
    force: body.force === true,
  });
  if (res.error) {
    // ต้องยืนยันก่อน (มัดจำเดิมน้อยกว่ายอดงวด) → 409 + flag ให้หน้าจอถามยืนยัน แล้วส่ง force มาใหม่
    if (res.needsConfirm) return fail(res.error, 409, { needs_confirm: true, suggested: res.suggested });
    return fail("บันทึกรับชำระไม่สำเร็จ: " + res.error, 500);
  }

  // ติ๊ก "มัดจำหน้างาน" → ตั้งธง jobs.onsite_deposit (ล้ม = log เฉยๆ ไม่ทำให้การชำระพัง)
  if (typeof body.onsite_deposit === "boolean") {
    const { data: bn } = await supabase
      .from("billing_notes").select("job_id").eq("id", params.id)
      .maybeSingle<{ job_id: string | null }>();
    await setJobOnsiteDeposit(bn?.job_id, body.onsite_deposit, true); // มีบิล = มีใบเสนอแล้ว → ตั้งวันส่งใบด้วยถ้าว่าง
  }

  return ok({ ok: true });
}
