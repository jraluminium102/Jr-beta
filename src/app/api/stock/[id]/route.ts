import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { colorFromName } from "@/lib/cutlist/stock-match";

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

  const { data: prices } = await supabase
    .from("stock_prices").select("*")
    .eq("stock_item_id", params.id)
    .order("effective_date", { ascending: false }).order("id", { ascending: false }).limit(30);

  return ok({ ...item, stock_moves: moves ?? [], stock_prices: prices ?? [] });
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

  // สี (0106) — เขียนแยกแบบ non-fatal · ถ้าไม่กรอกสี แต่ชื่อมีสี → ดึงสีจากชื่อมาเติมอัตโนมัติ (กันช่องสีว่าง + ตรงกับชื่อ)
  if ("color" in body || "name" in body) {
    const nm = body.name ?? (data as Record<string, unknown>)?.name;
    const sk = body.sku ?? (data as Record<string, unknown>)?.sku;
    const colorVal = String(body.color ?? "").trim() || colorFromName(String(nm ?? ""), String(sk ?? ""));
    if (colorVal || "color" in body) {
      const { error: colErr } = await supabase.from("stock_items").update({ color: colorVal }).eq("id", params.id);
      if (!colErr && data) (data as Record<string, unknown>).color = colorVal;
    }
  }

  return ok(data);
}

// DELETE /api/stock/[id]  → ลบวัสดุ (ผลตรวจบัญชี 10 ก.ค.69: กันล้างประวัติต้นทุน)
// • ADMIN เท่านั้น · มีประวัติเคลื่อนไหว/ราคา = ปิดใช้งาน (soft delete) แทน — สอบย้อนต้นทุนได้เสมอ
// • ลบถาวรได้เฉพาะวัสดุเปล่า (ไม่มี moves/prices เลย เช่น สร้างผิด)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (profile.role !== "ADMIN") return FORBIDDEN();

  const supabase = createClient() as unknown as Sb;
  const id = Number(params.id);
  const [{ count: mv }, { count: pr }] = await Promise.all([
    supabase.from("stock_moves").select("id", { count: "exact", head: true }).eq("stock_item_id", id),
    supabase.from("stock_prices").select("id", { count: "exact", head: true }).eq("stock_item_id", id),
  ]);
  if ((mv ?? 0) > 0 || (pr ?? 0) > 0) {
    const { error } = await supabase.from("stock_items").update({ is_active: false }).eq("id", id);
    if (error) return fail(error.message, 500);
    return ok({ id, softDeleted: true, note: "มีประวัติเคลื่อนไหว/ราคา — ปิดใช้งานแทนการลบถาวร (สอบย้อนได้)" });
  }
  const { error } = await supabase.from("stock_items").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ id });
}
