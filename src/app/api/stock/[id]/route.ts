import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { colorFromName } from "@/lib/cutlist/stock-match";
import { canSeeCost } from "@/lib/rbac";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];
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

  // role สโตร์ = ตาบอดราคา → ตัดต้นทุนวัสดุ + ต้นทุน/มูลค่าในแต่ละ move + ซ่อนประวัติราคาทั้งหมด
  if (!canSeeCost(profile.role)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const it: any = { ...item, unit_cost: null, price_per_kg: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mv = (moves ?? []).map((m: any) => ({ ...m, unit_cost: null, total_price: null }));
    return ok({ ...it, stock_moves: mv, stock_prices: [] });
  }
  return ok({ ...item, stock_moves: moves ?? [], stock_prices: prices ?? [] });
}

// PATCH /api/stock/[id]  → แก้ข้อมูลวัสดุ (ไม่รวมราคา — ใช้ /price เพื่อเก็บประวัติ)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const allowed = ["sku", "name", "unit", "min_qty", "note", "is_active", "supplier",
    "image_url", "is_weight_based", "weight_per_unit", "is_stocked"];
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

  // ── กรอกน้ำหนักทีหลัง → ต้องคิดราคา/หน่วยใหม่ให้เอง (เจ้าของเจอ 21 ส.ค.69) ────────
  // ของคิดต่อโล: ราคา/หน่วย = ราคา/กก. × น้ำหนัก/หน่วย · /price คิดให้ตอน "ตั้งราคา" เท่านั้น
  //   ตั้งราคา/กก. ไว้ก่อนแล้วค่อยมากรอกน้ำหนัก → ราคา/หน่วย ค้างที่ 0 เงียบ ๆ (คิดราคาเลยได้ ฿0)
  //   เขียนเข้าประวัติ stock_prices ด้วย เพื่อให้ trigger sync กลับเข้า stock_items เหมือนทางปกติ
  if ("weight_per_unit" in patch || "is_weight_based" in patch) {
    const it = data as Record<string, unknown> | null;
    const kg = Number(it?.weight_per_unit) || 0;
    const rate = Number(it?.price_per_kg) || 0;
    const cost = Number(it?.unit_cost) || 0;
    const want = Math.round(rate * kg * 100) / 100;
    if (it?.is_weight_based && rate > 0 && kg > 0 && Math.abs(want - cost) >= 0.01) {
      await supabase.from("stock_prices").insert({
        stock_item_id: Number(params.id), price_per_kg: rate, unit_cost: want,
        effective_date: new Date().toISOString().slice(0, 10),
        supplier: "", note: "คิดใหม่อัตโนมัติ (กรอกน้ำหนัก/เปลี่ยนโหมดคิดต่อโล)", created_by: profile.id,
      });
      (data as Record<string, unknown>).unit_cost = want;
    }
  }

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
