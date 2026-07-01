import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// สโตร์/ผลิต บันทึกวัสดุได้ด้วย (0073) — ไม่ใช่แค่ ADMIN/SALES/ACCOUNTING
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];

// GET /api/stock?q=คำค้น  → รายการวัสดุ (is_active=true)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = createClient();
  let query = supabase
    .from("stock_items")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (q) {
    // escape อักขระที่ทำ .or() filter เพี้ยน (comma แยก filter, % คือ wildcard)
    const safe = q.replace(/[,%()]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,category.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/stock  → เพิ่มวัสดุ
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return fail("ต้องระบุชื่อวัสดุ");
  if (Number(body.qty_on_hand) < 0) return fail("ยอดยกมาติดลบไม่ได้");
  if (Number(body.min_qty) < 0) return fail("จุดเตือนขั้นต่ำติดลบไม่ได้");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as unknown as { from: (t: string) => any };

  // หมวด: รับ category_id (dropdown) แล้ว denormalize ชื่อไว้ใน category ด้วย (กันหน้าเก่าอ่าน)
  let categoryName = (body.category ?? "").toString();
  const categoryId = body.category_id ? Number(body.category_id) : null;
  if (categoryId) {
    const { data: cat } = await supabase.from("stock_categories").select("name").eq("id", categoryId).single();
    if (cat?.name) categoryName = cat.name;
  }

  const isWeight = !!body.is_weight_based;
  const weightPerUnit = Number(body.weight_per_unit) || 0;
  const pricePerKg = Number(body.price_per_kg) || 0;
  // ต้นทุนต่อหน่วย: อลูคิดต่อโล → price_per_kg × น้ำหนัก/หน่วย · อื่นๆ → unit_cost ที่กรอกตรง
  const unitCost = isWeight ? Math.round(pricePerKg * weightPerUnit * 100) / 100 : (Number(body.unit_cost) || 0);

  // เริ่มที่ qty_on_hand=0 เสมอ — ถ้ามียอดยกมา ปล่อยให้ trigger บวกผ่าน stock_moves (มี log)
  const { data: item, error } = await supabase
    .from("stock_items")
    .insert({
      sku: body.sku ?? "",
      name: body.name.trim(),
      category: categoryName,
      category_id: categoryId,
      unit: body.unit ?? "",
      min_qty: Number(body.min_qty) || 0,
      qty_on_hand: 0,
      note: body.note ?? "",
      supplier: body.supplier ?? "",
      image_url: body.image_url ?? "",
      is_weight_based: isWeight,
      weight_per_unit: weightPerUnit,
      price_per_kg: pricePerKg,
      unit_cost: unitCost,
    })
    .select("*")
    .single();

  if (error) return fail(error.message, 500);

  // บันทึกราคาเริ่มต้นเข้าประวัติ (ถ้ามี) — trigger sync unit_cost/price_per_kg ให้อยู่แล้ว
  if (unitCost > 0 || pricePerKg > 0) {
    await supabase.from("stock_prices").insert({
      stock_item_id: item.id,
      price_per_kg: isWeight ? pricePerKg : null,
      unit_cost: unitCost,
      supplier: body.supplier ?? "",
      note: "ราคาเริ่มต้น",
      created_by: profile.id,
    });
  }

  // ยอดยกมา > 0 → บันทึกเป็น movement type 'in' (trigger ปรับ qty_on_hand ให้)
  const opening = Number(body.qty_on_hand) || 0;
  if (opening > 0) {
    const { error: moveErr } = await supabase.from("stock_moves").insert({
      stock_item_id: item.id,
      type: "in",
      qty: opening,
      ref: "ยอดยกมา",
      note: "",
      unit_cost: unitCost,
      total_price: Math.round(opening * unitCost * 100) / 100,
      created_by: profile.id,
    });
    if (moveErr) return fail(moveErr.message, 500);
    item.qty_on_hand = opening;
  }

  return ok(item, 201);
}
