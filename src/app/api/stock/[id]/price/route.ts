import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// อัปเดตราคา/ต้นทุน = งานบัญชี (+admin) — trigger sync unit_cost ล่าสุดเข้า stock_items ให้
const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];
type Sb = { from: (t: string) => any };

// POST /api/stock/[id]/price  → บันทึกราคาใหม่เข้าประวัติ (อลู: ต่อโล / อื่นๆ: ต่อหน่วย)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!PRICE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const supabase = createClient() as unknown as Sb;

  const { data: item } = await supabase
    .from("stock_items").select("is_weight_based, weight_per_unit").eq("id", Number(params.id)).single();
  if (!item) return fail("ไม่พบวัสดุ", 404);

  const isWeight = !!item.is_weight_based;
  const weightPerUnit = Number(item.weight_per_unit) || 0;
  const pricePerKg = Number(body?.price_per_kg) || 0;

  // ต้นทุนต่อหน่วย: อลูคิดต่อโล → price_per_kg × น้ำหนัก/หน่วย · อื่นๆ → unit_cost ที่กรอก
  const unitCost = isWeight
    ? Math.round(pricePerKg * weightPerUnit * 100) / 100
    : (Number(body?.unit_cost) || 0);
  if (unitCost <= 0 && pricePerKg <= 0) return fail("ต้องระบุราคา");

  const { data, error } = await supabase.from("stock_prices").insert({
    stock_item_id: Number(params.id),
    price_per_kg: isWeight ? pricePerKg : null,
    unit_cost: unitCost,
    effective_date: body?.effective_date || new Date().toISOString().slice(0, 10),
    supplier: body?.supplier ?? "",
    note: body?.note ?? "",
    created_by: profile.id,
  }).select("*").single();
  if (error) return fail(error.message, 500);
  return ok(data, 201);
}
