import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// POST /api/stock/alu-rates → ตั้ง "เรตต่อโล" ให้กลุ่มเส้นอลู: unit_cost = น้ำหนัก/เส้น × เรต (+บันทึกประวัติราคา)
// ใช้กับเส้นที่มี weight_per_unit > 0 เท่านั้น — ราคาคิด 4.0 ขยับตามผ่าน ALUCODE (sku)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!PRICE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => n > 0) : [];
  const rate = Number(body?.rate) || 0;
  if (!ids.length || ids.length > 500) return fail("รายการไม่ถูกต้อง (1-500 เส้น)");
  if (rate <= 0 || rate > 100000) return fail("เรตต่อโลไม่ถูกต้อง");

  const sb = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = sb as unknown as { from: (t: string) => any };
  const { data: items, error: e0 } = await anyDb
    .from("stock_items")
    .select("id, sku, name, weight_per_unit")
    .in("id", ids);
  if (e0) return fail(e0.message, 500);

  const rows = (items ?? []) as { id: number; sku: string; name: string; weight_per_unit: number }[];
  const withW = rows.filter((r) => Number(r.weight_per_unit) > 0);
  if (!withW.length) return fail("ทุกเส้นที่เลือกยังไม่มีน้ำหนัก/เส้น — เติมน้ำหนักก่อน");

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;
  for (const r of withW) {
    const cost = round2(Number(r.weight_per_unit) * rate);
    const { error } = await anyDb.from("stock_items")
      .update({ unit_cost: cost, price_per_kg: rate })
      .eq("id", r.id);
    if (error) return fail(`อัปเดต ${r.name} ไม่สำเร็จ: ${error.message}`, 500);
    updated++;
  }
  // ประวัติราคา (หนึ่งแถวต่อเส้น) — ล้มเหลวไม่ถือว่างานพัง (ราคาหลักอัปเดตแล้ว)
  await anyDb.from("stock_prices").insert(withW.map((r) => ({
    stock_item_id: r.id,
    price_per_kg: rate,
    unit_cost: round2(Number(r.weight_per_unit) * rate),
    effective_date: today,
    supplier: "",
    note: `ตั้งเรตต่อโล ${rate} ฿/กก. (หน้าเรตอลู)`,
  })));

  return ok({ updated, skippedNoWeight: rows.length - withW.length });
}
