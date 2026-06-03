import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// GET /api/stock/[id]  → วัสดุ + ประวัติความเคลื่อนไหวล่าสุด
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data: item, error } = await supabase
    .from("stock_items")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return fail(error.message, 404);

  const { data: moves } = await supabase
    .from("stock_moves")
    .select("*")
    .eq("stock_item_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return ok({ ...item, stock_moves: moves ?? [] });
}

// PATCH /api/stock/[id]  → แก้ข้อมูลวัสดุ
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const allowed = ["sku", "name", "category", "unit", "min_qty", "note", "is_active"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  if (Object.keys(patch).length === 0) return fail("ไม่มีข้อมูลให้แก้ไข");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_items")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
