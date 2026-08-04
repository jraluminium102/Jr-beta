import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { footerSnapshot } from "@/lib/money";
import type { Role } from "@/lib/database.types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// book_installment_tax RPC exception code → ข้อความไทย (guard ตามหลักบัญชี · 0117)
const BOOK_BLOCK_MSG: Record<string, string> = {
  forbidden: "ไม่มีสิทธิ์แก้ภาษีต่องวด (เฉพาะแอดมิน/บัญชี)",
  NOT_FOUND: "ไม่พบงวดนี้",
  CANCELLED: "ใบวางบิลถูกยกเลิกแล้ว แก้ภาษีต่องวดไม่ได้",
  PAID: "งวดนี้รับชำระแล้ว แก้ภาษีต่องวดไม่ได้",
  BN_WHT_SET: "ใบวางบิลนี้ตั้งหัก ณ ที่จ่ายระดับทั้งใบไว้แล้ว — แก้ภาษีต่องวดไม่ได้ (กันหักซ้ำ) ไปแก้ที่ใบเสนอราคา/แก้ทั้งใบแทน",
  HAS_RECEIPT: "งวดนี้ออกใบเสร็จ/ใบกำกับภาษีแล้ว — แก้ภาษีต่องวดไม่ได้",
  HAS_FINANCE_ENTRY: "งวดนี้มีรายการรับเงินผูกอยู่แล้ว — แก้ภาษีต่องวดไม่ได้",
  INVALID_VAT_RATE: "อัตรา VAT ต้องเป็น 0 หรือ 7%",
  INVALID_WHT_RATE: "อัตราหัก ณ ที่จ่ายต้องเป็น 0/1/2/3/5%",
  NEGATIVE_AMOUNT: "ยอดต้องไม่ติดลบ",
};

const BookSchema = z.object({
  subtotal: z.number({ invalid_type_error: "รวมเป็นเงินต้องเป็นตัวเลข" }).min(0, "รวมเป็นเงินต้อง ≥ 0"),
  discount_pct: z.number().min(0, "ส่วนลดต้อง ≥ 0").max(100, "ส่วนลดต้องอยู่ 0–100%").default(0),
  vat_rate: z.number().refine((v) => v === 0 || v === 7, "VAT ต้องเป็น 0 หรือ 7%"),
  wht_rate: z.number().refine((v) => [0, 1, 2, 3, 5].includes(v), "หัก ณ ที่จ่ายต้องเป็น 0/1/2/3/5%"),
});

// PATCH /api/billing-installments/[id] → แก้ต่องวด
// body รับได้ทั้ง (ใส่คีย์ไหนก็อัปเดตคีย์นั้น):
//   book: {subtotal,discount_pct,vat_rate,wht_rate}      → "book จริง" ภาษีลงงวด (0117) + recompute bn.total อะตอมมิก
//   footer_override: null                                → ล้าง override เดิม (legacy display-only · คงไว้ backward compat)
//   label: string                                        → ข้อความคอลัมน์ "รายละเอียด" ของงวด
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role as Role, "finance", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("payload ไม่ถูกต้อง");

  const supabase = createClient();

  // โหมด book = book ภาษีจริงลงงวด (แทน footer_override display-only เดิม) — ผ่าน RPC เดียว (atomic กับ bn.total)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ("book" in (body as any)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = BookSchema.safeParse((body as any).book);
    if (!parsed.success) return fail(parsed.error.errors[0].message, 400);
    const { subtotal, discount_pct, vat_rate, wht_rate } = parsed.data;
    const snap = footerSnapshot(subtotal, discount_pct, vat_rate, wht_rate);
    const base_amt = round2(snap.subtotal - snap.discount_amt); // after_discount — ฐานก่อน VAT ของงวด

    const sb = supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { bn_total?: number } | null; error: { message: string } | null }>;
    };
    const { data: rpcData, error: rpcErr } = await sb.rpc("book_installment_tax", {
      p_inst_id: Number(params.id),
      p_base_amt: base_amt,
      p_vat_amt: snap.vat_amt,
      p_wht_amt: snap.wht_amt,
      p_vat_rate: vat_rate,
      p_wht_rate: wht_rate,
      p_amount: snap.net,
    });
    if (rpcErr) {
      const code = (rpcErr.message ?? "").match(/HAS_\w+|NOT_\w+|CANCELLED|PAID|BN_WHT_SET|INVALID_\w+|NEGATIVE_AMOUNT|forbidden/)?.[0];
      if (code && BOOK_BLOCK_MSG[code]) return fail(BOOK_BLOCK_MSG[code], code === "forbidden" ? 403 : code === "NOT_FOUND" ? 404 : 409);
      if (/book_installment_tax|does not exist|42883|schema cache/i.test(rpcErr.message ?? ""))
        return fail("ยังไม่ได้รัน migration 0117 (book ภาษีต่องวด) — รันก่อนใช้งาน", 400);
      return fail(rpcErr.message, 500);
    }
    return ok({
      ok: true, base_amt, vat_amt: snap.vat_amt, wht_amt: snap.wht_amt,
      vat_rate, wht_rate, amount: snap.net, bn_total: rpcData?.bn_total,
    });
  }

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
