import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

const WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
type Sb = { from: (t: string) => any };
type Params = { params: { id: string } };

// PATCH /api/stock/categories/[id] → แก้ชื่อ/ลำดับ
export async function PATCH(req: Request, { params }: Params) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!WRITE.includes(profile.role)) return FORBIDDEN();
  const body = await req.json().catch(() => ({}));
  const upd: Record<string, unknown> = {};
  if (typeof body.name === "string") upd.name = body.name.trim();
  if (body.sort_order != null) upd.sort_order = Number(body.sort_order) || 0;
  if (Object.keys(upd).length === 0) return fail("ไม่มีข้อมูลให้แก้ไข");
  const sb = createClient() as unknown as Sb;
  const { data, error } = await sb.from("stock_categories").update(upd).eq("id", params.id).select("*").single();
  if (error) return fail(error.message, 500);
  return ok(data);
}

// DELETE /api/stock/categories/[id] → ปิดหมวด (soft) ถ้ายังมีวัสดุใช้อยู่ · ลบจริงถ้าไม่มี
export async function DELETE(_req: Request, { params }: Params) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!WRITE.includes(profile.role)) return FORBIDDEN();
  const sb = createClient() as unknown as Sb;
  const { count } = await sb.from("stock_items").select("id", { count: "exact", head: true }).eq("category_id", Number(params.id));
  if ((count ?? 0) > 0) {
    // ยังมีวัสดุในหมวดนี้ → ปิดใช้งานแทนลบ (กันข้อมูลหลุด)
    const { error } = await sb.from("stock_categories").update({ is_active: false }).eq("id", params.id);
    if (error) return fail(error.message, 500);
    return ok({ id: Number(params.id), soft: true });
  }
  const { error } = await sb.from("stock_categories").delete().eq("id", params.id);
  if (error) return fail(error.message, 500);
  return ok({ id: Number(params.id) });
}
