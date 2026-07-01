import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// ลบราคาที่กรอกผิด = แอดมินเท่านั้น (แล้ว recompute ต้นทุนล่าสุดกลับเข้า stock_items)
const DELETE_ROLES = ["ADMIN"];
type Sb = { from: (t: string) => any };
type Params = { params: { id: string; priceId: string } };

export async function DELETE(_req: Request, { params }: Params) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!DELETE_ROLES.includes(profile.role)) return FORBIDDEN();

  const itemId = Number(params.id);
  const priceId = Number(params.priceId);
  const supabase = createClient() as unknown as Sb;

  const { error: delErr } = await supabase.from("stock_prices").delete().eq("id", priceId).eq("stock_item_id", itemId);
  if (delErr) return fail(delErr.message, 500);

  // recompute ต้นทุนล่าสุด (ราคาที่มีผลถึงวันนี้) กลับเข้า stock_items — กันต้นทุนค้างราคาที่ลบไปแล้ว
  const today = new Date().toISOString().slice(0, 10);
  const { data: latest } = await supabase
    .from("stock_prices").select("unit_cost, price_per_kg")
    .eq("stock_item_id", itemId).lte("effective_date", today)
    .order("effective_date", { ascending: false }).order("id", { ascending: false })
    .limit(1).maybeSingle();

  await supabase.from("stock_items").update({
    unit_cost: latest?.unit_cost ?? 0,
    price_per_kg: latest?.price_per_kg ?? 0,
  }).eq("id", itemId);

  return ok({ id: priceId });
}
