import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { Role } from "@/lib/database.types";

// PATCH /api/billing-installments/[id] → ตั้ง footer_labor_pct ต่องวด (display-only ไม่กระทบยอด)
// footer_labor_pct: null = ไม่แยก · 0-100 = % ค่าแรงของงวดนั้น (สำหรับโชว์แตกยอดตอนพิมพ์งวด)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role as Role, "finance", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  // รับได้ทั้ง null (ล้างการแยก) และ 0-100
  const raw = body.footer_labor_pct;
  const val = raw == null || raw === "" ? null : Math.min(100, Math.max(0, Number(raw) || 0));

  const supabase = createClient();
  const { error } = await supabase
    .from("billing_installments")
    .update({ footer_labor_pct: val })
    .eq("id", Number(params.id));
  // กันพัง: ถ้า migration 0082 ยังไม่รัน → ไม่ให้ทั้งหน้าพัง (footer เป็น optional)
  if (error && /footer_labor_pct/i.test(error.message ?? "")) {
    return fail("ยังไม่ได้รัน migration 0082 (footer ต่องวด) — รันก่อนใช้งาน", 400);
  }
  if (error) return fail(error.message, 500);
  return ok({ ok: true, footer_labor_pct: val });
}
