import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// POST /api/stock/moves/[id]/void → ยกเลิกรายการเคลื่อนไหว (soft void) + ย้อน "จำนวน" แบบ delta (ไม่แตะต้นทุน)
// ปลอดภัยกว่า replay: คงยอดยกมา/ราคาตั้งมือไว้ · void รับเข้า → ยอด−, void เบิก → ยอด+ · adjust ยกเลิกไม่ได้ (ค่าสัมบูรณ์)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const reason = (body?.reason ?? "").toString().trim();
  if (!reason) return fail("ต้องระบุเหตุผลการยกเลิก");

  const sb = createClient();
  const { data: mv, error: e0 } = await sb
    .from("stock_moves").select("id, stock_item_id, type, qty, is_voided").eq("id", params.id).single();
  if (e0 || !mv) return fail("ไม่พบรายการ", 404);
  const m = mv as { stock_item_id: number; type: string; qty: number; is_voided?: boolean };
  if (m.is_voided) return fail("รายการนี้ถูกยกเลิกไปแล้ว", 409);
  if (m.type === "adjust") return fail("ยกเลิก 'ปรับยอด' ไม่ได้ (เป็นค่าตั้งยอดสัมบูรณ์) — ใช้ 'ปรับยอด' ใหม่ให้ถูกแทน", 400);

  // ย้อนจำนวน: รับเข้า → หักออก · เบิกออก → คืนกลับ
  const delta = m.type === "in" ? -(Number(m.qty) || 0) : (Number(m.qty) || 0);
  const { data: item } = await sb.from("stock_items").select("qty_on_hand").eq("id", m.stock_item_id).single();
  const newQty = round2((Number((item as { qty_on_hand: number } | null)?.qty_on_hand) || 0) + delta);
  if (newQty < 0) return fail(`ยกเลิกแล้วยอดคงเหลือจะติดลบ (${newQty}) — ของถูกเบิกไปแล้ว ตรวจสอบก่อน`, 409);

  const { error } = await sb.from("stock_moves").update({
    is_voided: true, voided_at: new Date().toISOString(), voided_by: profile.id, void_reason: reason,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).eq("id", params.id);
  if (error && /is_voided/i.test(error.message ?? "")) return fail("ยังไม่ได้รัน migration 0087 — รันก่อนใช้งาน", 400);
  if (error) return fail(error.message, 500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sb.from("stock_items").update({ qty_on_hand: newQty } as any).eq("id", m.stock_item_id);
  return ok({ ok: true, qty_on_hand: newQty });
}
