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
    // ⚠ ห้ามเชื่อ client เรื่องอัตราภาษี (กฎเดียวกับ POST /api/receipts ที่ ignore body.vat_rate)
    //   footer งวด = display-only ไม่แตะยอด booked → ถ้าปล่อยให้ตั้ง VAT ต่างจากใบ = ส่งเอกสารที่ขัดกับใบกำกับที่จะออกตามมา
    //   UI ล็อก checkbox ไว้แล้ว แต่ล็อกฝั่งจออย่างเดียวไม่พอ (แท็บค้าง/เรียก API ตรง) → บังคับที่ server ด้วย
    //   อัตรา VAT/หัก ณ ที่จ่าย ยึดของ "ใบวางบิล" เสมอ · แก้ได้ที่ "แก้ VAT / ส่วนลด" (คิดยอด+งวดใหม่จริง) เท่านั้น
    // ⚠ แยก 2 query แบน ๆ ไม่ใช้ nested embed โดยตั้งใจ: embed (billing_notes(...)) PostgREST คืน object หรือ array
    //   ก็ได้แล้วแต่การมองเห็น FK → ถ้าคืน array แล้วอ่าน ?.vat_rate จะได้ undefined → || 0 → VAT หายเงียบทั้งบรรทัด
    //   บนใบที่ส่งลูกค้า (tsc/เทส money.ts จับไม่ได้) · select แบนทำให้ shape แน่นอน 100%
    // ⚠ fail-closed: อ่านอัตราไม่ได้ = ไม่เขียน (ห้ามเดา 0 — เดาผิดคือ VAT หายจากเอกสาร)
    let vatRate = 0, whtRate = 0;
    if (raw != null) {
      const { data: inst } = await supabase
        .from("billing_installments")
        .select("billing_note_id")
        .eq("id", Number(params.id))
        .single<{ billing_note_id: number }>();
      if (!inst?.billing_note_id) return fail("ไม่พบงวดนี้ — ลองใหม่", 404);
      const { data: bnRow } = await supabase
        .from("billing_notes")
        .select("vat_rate, wht_rate")
        .eq("id", inst.billing_note_id)
        .single<{ vat_rate: number | null; wht_rate: number | null }>();
      if (!bnRow) return fail("อ่านอัตราภาษีของใบวางบิลไม่ได้ — ลองใหม่", 500);
      vatRate = Number(bnRow.vat_rate) || 0;
      whtRate = Number(bnRow.wht_rate) || 0;
    }
    update.footer_override =
      raw == null ? null : footerSnapshot(raw.subtotal, raw.discount_pct, vatRate, whtRate);
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
