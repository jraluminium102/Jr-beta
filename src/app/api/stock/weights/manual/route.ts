import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// POST /api/stock/weights/manual → กรอก "น้ำหนัก กก./เส้น" เองให้เส้นอลูที่ไฟล์ถอดทุนไม่มีให้
//   เจ้าของสั่ง 9 ต.ค.69 — กล่อง/ฉาก/แซด หลายขนาดไม่มีในไฟล์ ต้องใส่มือได้
//   กรอกครั้งเดียวได้ทุกสีของขนาดนั้น (ids = ทุกแถวของกลุ่ม)
// ⚠ เขียนแค่ weight_per_unit — ราคาไม่ขยับเอง ต้องไปกด "ตั้งเรตต่อโล" เหมือนตัวเติมจากไฟล์
//   ยกเว้นแถวที่ตั้งเรตต่อโลไว้แล้ว → ลงประวัติราคาใหม่ให้ (เรต × น้ำหนักใหม่) ไม่งั้นราคาค้างของเก่า
const WRITE_ROLES = ["ADMIN", "ACCOUNTING"];
type Sb = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!WRITE_ROLES.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => n > 0) : [];
  const kg = Number(body?.kg);
  const label = String(body?.label ?? "").trim().slice(0, 80);
  if (!ids.length) return fail("ยังไม่ได้เลือกรายการ");
  if (ids.length > 1000) return fail("ครั้งละไม่เกิน 1,000 รายการ");
  if (!(kg > 0) || kg > 500) return fail("น้ำหนัก/เส้น ต้องมากกว่า 0 และไม่เกิน 500 กก.");

  const sb = createClient() as unknown as Sb;
  const { data: items, error: e0 } = await sb
    .from("stock_items").select("id, sku, name, weight_per_unit, price_per_kg").in("id", ids);
  if (e0) return fail(e0.message, 500);
  const rows = (items ?? []) as { id: number; price_per_kg: number | null; weight_per_unit: number | null }[];
  if (!rows.length) return fail("ไม่พบรายการ");

  const { error: e1 } = await sb.from("stock_items")
    .update({ weight_per_unit: kg }).in("id", rows.map((r) => r.id));
  if (e1) return fail(e1.message, 500);

  // แถวที่มีเรตต่อโลอยู่แล้ว → ราคาต่อเส้นต้องคิดใหม่ (ลงประวัติ trigger sync ให้)
  const repriced = rows.filter((r) => Number(r.price_per_kg) > 0);
  let priced = 0;
  const warns: string[] = [];
  if (repriced.length) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: e2 } = await sb.from("stock_prices").insert(repriced.map((r) => ({
      stock_item_id: r.id,
      price_per_kg: Number(r.price_per_kg),
      unit_cost: round2(Number(r.price_per_kg) * kg),
      effective_date: today,
      supplier: "",
      note: `กรอกน้ำหนักเอง ${kg} กก./เส้น${label ? ` — ${label}` : ""}`,
      created_by: profile.id,
    })));
    if (e2) warns.push(`น้ำหนักบันทึกแล้ว แต่คิดราคาใหม่ไม่สำเร็จ: ${e2.message}`);
    else priced = repriced.length;
  }

  return ok({
    updated: rows.length,
    priced,
    warns,
    note: priced
      ? `คิดราคา/เส้นใหม่ให้ ${priced} รายการ (เรตต่อโล × น้ำหนักใหม่)`
      : 'เติมน้ำหนักแล้ว — ราคายังเท่าเดิม ไปกด "ตั้งเรตต่อโล" ที่หน้าเรตอลูเพื่อให้ราคาขยับ',
  });
}
