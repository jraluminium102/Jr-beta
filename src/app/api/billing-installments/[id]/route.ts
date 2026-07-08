import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { Role } from "@/lib/database.types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Math.max(0, round2(Number(v) || 0)); // footer เป็นยอดโชว์ ไม่ติดลบ

// PATCH /api/billing-installments/[id] → ตั้ง footer_override ต่องวด (display-only ไม่กระทบยอดงวด/ยอดบิล)
// body.footer_override:
//   null           → ล้าง กลับไปใช้ค่าเฉลี่ยตามสัดส่วนอัตโนมัติ
//   {subtotal,discount,vat,wht} → ทับค่าเฉลี่ย (จำไว้ ใช้ตอนพิมพ์งวดนี้)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role as Role, "finance", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body || !("footer_override" in body)) return fail("payload ไม่ถูกต้อง");

  const raw = body.footer_override;
  const value =
    raw == null
      ? null
      : {
          subtotal: num(raw.subtotal),
          discount: num(raw.discount),
          vat: num(raw.vat),
          wht: num(raw.wht),
        };

  const supabase = createClient();
  const { error } = await supabase
    .from("billing_installments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ footer_override: value } as any)
    .eq("id", Number(params.id));
  // กันพัง: migration 0084 ยังไม่รัน → ไม่ให้ทั้งหน้าพัง (footer เป็น optional)
  if (error && /footer_override/i.test(error.message ?? "")) {
    return fail("ยังไม่ได้รัน migration 0084 (footer ต่องวด) — รันก่อนใช้งาน", 400);
  }
  if (error) return fail(error.message, 500);
  return ok({ ok: true, footer_override: value });
}
