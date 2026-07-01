import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { StockMoveType } from "@/lib/types";

const TYPES: StockMoveType[] = ["in", "out", "adjust"];
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
type Sb = { from: (t: string) => any };

// POST /api/stock/[id]/move  → บันทึกความเคลื่อนไหว (trigger ปรับ qty_on_hand ให้)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const type = body?.type as StockMoveType;
  if (!TYPES.includes(type)) return fail("ประเภทไม่ถูกต้อง (in/out/adjust)");
  const qty = Number(body?.qty);
  if (!Number.isFinite(qty) || qty === 0) return fail("ต้องระบุจำนวน");

  const supabase = createClient() as unknown as Sb;

  // ต้นทุน ณ ตอนเคลื่อนไหว = snapshot จากต้นทุนล่าสุดของวัสดุ (ไว้คิดต้นทุนงาน)
  const { data: item } = await supabase.from("stock_items").select("unit_cost").eq("id", Number(params.id)).single();
  const itemCost = Number(item?.unit_cost) || 0;
  // รับเข้า: ให้กรอกราคารวมได้ (บิลจริง) · เบิก/ปรับ: คิดจากต้นทุนล่าสุด
  const unitCost = body.unit_cost != null ? Number(body.unit_cost) || 0 : itemCost;
  const totalPrice = body.total_price != null
    ? Number(body.total_price) || 0
    : Math.round(Math.abs(qty) * unitCost * 100) / 100;

  const { error } = await supabase.from("stock_moves").insert({
    stock_item_id: Number(params.id),
    type,
    qty,
    ref: body.ref ?? "",
    note: body.note ?? "",
    requester: body.requester ?? "",
    job_id: body.job_id || null,
    unit_cost: unitCost,
    total_price: totalPrice,
    image_url: body.image_url ?? "",
    created_by: profile.id,
  });
  if (error) return fail(error.message, 500);
  return ok({ ok: true }, 201);
}
