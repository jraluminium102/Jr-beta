import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

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

  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,category.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/stock  → เพิ่มวัสดุ
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return fail("ต้องระบุชื่อวัสดุ");

  const supabase = createClient();
  // เริ่มที่ qty_on_hand=0 เสมอ — ถ้ามียอดยกมา ปล่อยให้ trigger บวกผ่าน stock_moves (มี log)
  const { data: item, error } = await supabase
    .from("stock_items")
    .insert({
      sku: body.sku ?? "",
      name: body.name.trim(),
      category: body.category ?? "",
      unit: body.unit ?? "",
      min_qty: Number(body.min_qty) || 0,
      qty_on_hand: 0,
      note: body.note ?? "",
    })
    .select("*")
    .single();

  if (error) return fail(error.message, 500);

  // ยอดยกมา > 0 → บันทึกเป็น movement type 'in' (trigger ปรับ qty_on_hand ให้)
  const opening = Number(body.qty_on_hand) || 0;
  if (opening > 0) {
    const { error: moveErr } = await supabase.from("stock_moves").insert({
      stock_item_id: item.id,
      type: "in",
      qty: opening,
      ref: "ยอดยกมา",
      note: "",
      created_by: profile.id,
    });
    if (moveErr) return fail(moveErr.message, 500);
    item.qty_on_hand = opening;
  }

  return ok(item, 201);
}
