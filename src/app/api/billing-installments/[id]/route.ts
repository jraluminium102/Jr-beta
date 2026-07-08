import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { Role } from "@/lib/database.types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Math.max(0, round2(Number(v) || 0)); // footer เป็นยอดโชว์ ไม่ติดลบ

// PATCH /api/billing-installments/[id] → แก้ต่องวด (display-only ไม่กระทบยอดงวด/ยอดบิล · แก้ได้แม้จ่ายแล้ว)
// body รับได้ทั้ง (ใส่คีย์ไหนก็อัปเดตคีย์นั้น):
//   footer_override: null | {subtotal,discount,vat,wht}  → footer แตกยอด (null=ใช้ค่าเฉลี่ยตามสัดส่วน)
//   label: string                                        → ข้อความคอลัมน์ "รายละเอียด" ของงวด
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role as Role, "finance", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("payload ไม่ถูกต้อง");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  const hasFooter = "footer_override" in body;
  if (hasFooter) {
    const raw = body.footer_override;
    update.footer_override =
      raw == null ? null : { subtotal: num(raw.subtotal), discount: num(raw.discount), vat: num(raw.vat), wht: num(raw.wht) };
  }
  if ("label" in body) update.label = String(body.label ?? "").slice(0, 200);
  if (Object.keys(update).length === 0) return fail("payload ไม่ถูกต้อง");

  const supabase = createClient();
  const { error } = await supabase
    .from("billing_installments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(update as any)
    .eq("id", Number(params.id));
  // กันพัง: migration 0084 ยังไม่รัน (เฉพาะกรณีแก้ footer) → ไม่ให้ทั้งหน้าพัง
  if (error && hasFooter && /footer_override/i.test(error.message ?? "")) {
    return fail("ยังไม่ได้รัน migration 0084 (footer ต่องวด) — รันก่อนใช้งาน", 400);
  }
  if (error) return fail(error.message, 500);
  return ok({ ok: true, ...update });
}
