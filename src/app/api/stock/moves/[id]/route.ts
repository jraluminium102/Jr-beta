import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { recomputeStockItem } from "@/lib/stock/recompute";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];

// PATCH /api/stock/moves/[id] → แก้รายการเคลื่อนไหว (กรอกผิด) แล้ว recompute ยอด/ต้นทุนใหม่
// รับ: qty, requester, note, ref, total_price(เฉพาะรับเข้า) · แก้ประเภท/ชนิด ให้ยกเลิกแล้วลงใหม่
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  const sb = createClient();
  const { data: mv, error: e0 } = await sb
    .from("stock_moves").select("id, stock_item_id, type, qty, is_voided").eq("id", params.id).single();
  if (e0 || !mv) return fail("ไม่พบรายการ", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((mv as any).is_voided) return fail("รายการนี้ถูกยกเลิกแล้ว แก้ไม่ได้ — ลงรายการใหม่แทน", 409);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd: Record<string, any> = { edited_at: new Date().toISOString() };
  if ("requester" in body) upd.requester = String(body.requester ?? "");
  if ("note" in body) upd.note = String(body.note ?? "");
  if ("ref" in body) upd.ref = String(body.ref ?? "");
  let recompute = false;
  let qty = Number((mv as { qty: number }).qty) || 0;
  if ("qty" in body) {
    const q = Number(body.qty);
    if (!(q > 0)) return fail("จำนวนต้องมากกว่า 0");
    upd.qty = q; qty = q; recompute = true;
  }
  if ("total_price" in body && (mv as { type: string }).type === "in") {
    const tp = Number(body.total_price) || 0;
    upd.total_price = tp;
    upd.unit_cost = qty > 0 ? Math.round((tp / qty) * 100) / 100 : 0;
    recompute = true;
  }

  const { error } = await sb.from("stock_moves").update(upd).eq("id", params.id);
  if (error && /edited_at|is_voided/i.test(error.message ?? "")) return fail("ยังไม่ได้รัน migration 0087 — รันก่อนใช้งาน", 400);
  if (error) return fail(error.message, 500);
  if (recompute) await recomputeStockItem(sb, (mv as { stock_item_id: number }).stock_item_id);
  return ok({ ok: true });
}
