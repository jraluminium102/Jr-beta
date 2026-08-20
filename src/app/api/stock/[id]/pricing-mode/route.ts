import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

/**
 * สลับวิธีคิดราคาของวัสดุ 1 ตัว: "ต่อโล" ↔ "ต่อหน่วยตรง" (เจ้าของสั่ง 19 ส.ค.69)
 *   วัสดุที่ยังไม่มีน้ำหนัก ให้ตั้งราคาต่อเส้นไปก่อน แล้วค่อยเปลี่ยนเป็นต่อโลทีหลัง
 *
 * ⚠ กันบั๊ก 3 จุด:
 *   ① จะเปลี่ยนเป็น "ต่อโล" ได้ ต้องมีน้ำหนัก/หน่วย > 0 ก่อน (ไม่งั้นราคาจะกลายเป็น 0)
 *   ② เปลี่ยนแล้วต้อง "ลงประวัติราคา" ทุกครั้ง — ต้นทุนต่อหน่วยเปลี่ยนที่มา ห้ามเปลี่ยนเงียบ ๆ
 *      (trigger apply_stock_price จะ sync unit_cost/price_per_kg เข้า stock_items ให้)
 *   ③ ราคาต้องไม่หายไประหว่างสลับ — คิดราคาใหม่จากของที่มีอยู่ก่อนเสมอ
 */
const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!PRICE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const toWeight = !!body?.weight_based;
  const sb = createClient() as unknown as Sb;

  const { data: item, error: e0 } = await sb
    .from("stock_items")
    .select("id, name, unit, is_weight_based, weight_per_unit, price_per_kg, unit_cost")
    .eq("id", Number(params.id)).single();
  if (e0 || !item) return fail("ไม่พบวัสดุ", 404);

  if (!!item.is_weight_based === toWeight)
    return fail(toWeight ? "ตัวนี้คิดต่อโลอยู่แล้ว" : "ตัวนี้ตั้งราคาต่อหน่วยตรงอยู่แล้ว");

  const kg = Number(item.weight_per_unit) || 0;
  const cost = Number(item.unit_cost) || 0;
  const rate = Number(item.price_per_kg) || 0;

  let newRate: number | null = null;
  let newCost = cost;
  let note = "";

  if (toWeight) {
    // ① ต้องมีน้ำหนักก่อน ไม่งั้นราคาต่อหน่วยจะกลายเป็น 0
    if (kg <= 0) return fail(`ยังไม่มีน้ำหนักต่อ${item.unit} — ใส่น้ำหนักก่อนถึงจะเปลี่ยนเป็นคิดต่อโลได้`);
    // ③ เรตต่อโลตั้งต้น = ราคาต่อหน่วยที่มีอยู่ ÷ น้ำหนัก → ราคาต่อหน่วยเท่าเดิมเป๊ะ ไม่กระโดด
    newRate = round2((rate > 0 ? rate * kg : cost) / kg);
    newCost = round2(newRate * kg);
    note = `เปลี่ยนเป็นคิดต่อโล — ${newRate} ฿/กก. × ${kg} กก./${item.unit}`;
  } else {
    // กลับไปตั้งราคาต่อหน่วยตรง — ยึดราคาต่อหน่วยปัจจุบันไว้ (ไม่ให้ราคาขยับจากการสลับโหมด)
    newCost = round2(cost > 0 ? cost : rate * kg);
    if (!(newCost > 0)) return fail("ยังไม่มีราคาให้ยึด — ตั้งราคาก่อนแล้วค่อยสลับ");
    note = `เปลี่ยนเป็นตั้งราคาต่อ${item.unit}ตรง — ยึดราคาเดิม ${newCost} ฿`;
  }

  // ② ลงประวัติราคาก่อนเสมอ (history-first) — insert ล้ม = ไม่มีอะไรเปลี่ยน
  const { error: e1 } = await sb.from("stock_prices").insert({
    stock_item_id: item.id,
    price_per_kg: toWeight ? newRate : null,
    unit_cost: newCost,
    effective_date: body?.effective_date || new Date().toISOString().slice(0, 10),
    supplier: "",
    note: `${note} (โดย ${profile.full_name ?? profile.role})`,
    created_by: profile.id,
  });
  if (e1) return fail(`บันทึกประวัติราคาไม่สำเร็จ — ยังไม่มีอะไรเปลี่ยน: ${e1.message}`, 500);

  const { error: e2 } = await sb.from("stock_items")
    .update({ is_weight_based: toWeight }).eq("id", item.id);
  if (e2) return fail(`สลับโหมดไม่สำเร็จ (ประวัติราคาลงแล้ว): ${e2.message}`, 500);

  return ok({
    weight_based: toWeight, unit_cost: newCost, price_per_kg: newRate,
    note: toWeight
      ? `เปลี่ยนเป็นคิดต่อโลแล้ว — ราคาต่อ${item.unit}เท่าเดิม (${newCost} ฿) ต่อไปแก้ที่เรตต่อโลได้เลย`
      : `เปลี่ยนเป็นตั้งราคาต่อ${item.unit}ตรงแล้ว — ราคาเท่าเดิม (${newCost} ฿)`,
  });
}
