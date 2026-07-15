import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { footerSnapshot } from "@/lib/money";
import type { Role } from "@/lib/database.types";

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

  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  const hasFooter = "footer_override" in body;
  if (hasFooter) {
    const raw = body.footer_override;
    // ⚠ เคย ignore อัตราจาก client แล้วบังคับใช้ของใบ (15 ก.ค.69) → "ถอยคืน" วันเดียวกัน
    //   เหตุผล: ตรวจ production พบว่า override ต่องวด 6/7 อัน ตั้ง VAT/หัก ณ ที่จ่าย "ต่างจากใบโดยตั้งใจ"
    //   = flow จริงของร้าน (งวดค่าแรงติดตั้ง ตั้ง VAT 7 + หัก 3 บนใบที่ตัวใบเป็น No-VAT)
    //   การบังคับใช้อัตราของใบ = ลบภาษีที่ตั้งไว้ทิ้งทันทีที่มีคนกดบันทึก footer นั้น
    // ปัญหาจริงคือ "ตั้งต่องวดแล้วใบเสร็จไม่รู้" (ใบเสร็จอ่าน vat ของใบ) → ทางแก้ที่ถูกคือทำให้ค่านี้ booked
    //   แล้วให้ใบเสร็จอ่านต่องวด — ไม่ใช่ห้ามตั้ง (งานรอบหน้า · ดู memory doc-totals-footer)
    update.footer_override =
      raw == null ? null : footerSnapshot(raw.subtotal, raw.discount_pct, raw.vat_rate, raw.wht_rate);
  }
  if ("label" in body) update.label = String(body.label ?? "").slice(0, 200);
  if (Object.keys(update).length === 0) return fail("payload ไม่ถูกต้อง");
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
