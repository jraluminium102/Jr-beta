/* eslint-disable @typescript-eslint/no-explicit-any */
// คำนวณยอดคงเหลือ + ต้นทุนถัวเฉลี่ยของวัสดุใหม่ จาก moves ที่ยัง active (ไม่ voided) — replay ตามลำดับเวลา
// ใช้ตอนแก้/ยกเลิก move (trigger สต็อกเป็น INSERT-only ย้อนเองไม่ได้ → ต้อง recompute ให้ตรง)
export async function recomputeStockItem(sb: any, itemId: number | string) {
  const { data: item } = await sb.from("stock_items").select("id, is_weight_based").eq("id", itemId).single();
  if (!item) return;
  const { data: moves } = await sb
    .from("stock_moves")
    .select("type, qty, unit_cost, created_at")
    .eq("stock_item_id", itemId)
    .eq("is_voided", false)
    .order("created_at", { ascending: true });

  let qty = 0, cost = 0, hasIn = false;
  for (const m of moves ?? []) {
    const q = Number(m.qty) || 0;
    if (m.type === "in") {
      hasIn = true;
      if (!item.is_weight_based) {
        const uc = Number(m.unit_cost) || 0;
        cost = (qty + q) > 0 ? Math.round(((qty * cost + q * uc) / (qty + q)) * 100) / 100 : uc; // ถัวเฉลี่ยถ่วงน้ำหนัก (ตรง trigger 0075)
      }
      qty += q;
    } else if (m.type === "out") {
      qty -= q;
    } else if (m.type === "adjust") {
      qty = q; // ปรับยอด = ตั้งค่าสัมบูรณ์
    }
  }
  const upd: Record<string, any> = { qty_on_hand: Math.round(qty * 100) / 100 };
  if (!item.is_weight_based && hasIn) upd.unit_cost = cost; // อลูคิดจากราคา/โล ไม่แตะ
  await sb.from("stock_items").update(upd).eq("id", itemId);
}
