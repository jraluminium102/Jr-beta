import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
type Sb = { from: (t: string) => any };

// GET /api/stock/[id]  → วัสดุ + ประวัติเคลื่อนไหว + ประวัติราคา
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient() as unknown as Sb;
  const { data: item, error } = await supabase
    .from("stock_items").select("*").eq("id", params.id).single();
  if (error) return fail(error.message, 404);

  const { data: moves } = await supabase
    .from("stock_moves").select("*")
    .eq("stock_item_id", params.id)
    .order("created_at", { ascending: false }).limit(50);

  const canViewCost = ["ADMIN", "ACCOUNTING"].includes(profile.role);
  const { data: prices } = canViewCost
    ? await supabase.from("stock_prices").select("*")
        .eq("stock_item_id", params.id)
        .order("effective_date", { ascending: false }).order("id", { ascending: false }).limit(30)
    : { data: [] };

  // ฝ่ายสโตร์ไม่เห็นราคา/ต้นทุน — ตัดฝั่ง server (กันเปิด devtools ดู)
  let outItem = item as Record<string, unknown>;
  let outMoves = (moves ?? []) as Record<string, unknown>[];
  if (!canViewCost) {
    outItem = { ...outItem, unit_cost: 0, price_per_kg: 0 };
    outMoves = outMoves.map((m) => ({ ...m, unit_cost: 0, total_price: 0 }));
  }

  return ok({ ...outItem, stock_moves: outMoves, stock_prices: prices ?? [] });
}

// PATCH /api/stock/[id]  → แก้ข้อมูลวัสดุ (ไม่รวมราคา — ใช้ /price เพื่อเก็บประวัติ)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const allowed = ["sku", "name", "unit", "min_qty", "note", "is_active", "supplier",
    "image_url", "is_weight_based", "weight_per_unit"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  const supabase = createClient() as unknown as Sb;

  // เปลี่ยนหมวด (dropdown) → set category_id + denormalize ชื่อ
  if ("category_id" in body) {
    const cid = body.category_id ? Number(body.category_id) : null;
    patch.category_id = cid;
    if (cid) {
      const { data: cat } = await supabase.from("stock_categories").select("name").eq("id", cid).single();
      patch.category = cat?.name ?? "";
    } else {
      patch.category = "";
    }
  }

  if (Object.keys(patch).length === 0) return fail("ไม่มีข้อมูลให้แก้ไข");

  const { data, error } = await supabase
    .from("stock_items").update(patch).eq("id", params.id).select("*").single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
