import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// POST /api/stock/alu-rates → ตั้ง "เรตต่อโล" ให้กลุ่มเส้นอลู (ราคาคิด 4.0 ขยับตามผ่าน ALUCODE)
// history-first (ผลตรวจบัญชี 10 ก.ค.69): insert stock_prices ก่อน → trigger apply_stock_price (0074) sync ต้นทุนให้
//   → insert ล้ม = ไม่มีอะไรเปลี่ยน (atomic) ไม่มีทางต้นทุนเปลี่ยนโดยไร้ประวัติ
// prev_rate คิดฝั่ง server (ถัวเฉลี่ยถ่วงน้ำหนักจากราคาปัจจุบัน) — ไม่รับจาก client
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!PRICE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => n > 0) : [];
  const rate = Number(body?.rate) || 0;
  const series = String(body?.series ?? "").trim().slice(0, 80) || "ไม่ระบุกลุ่ม";
  const color = String(body?.color ?? "").trim().slice(0, 40) || "ไม่ระบุสี";
  if (!ids.length || ids.length > 500) return fail("รายการไม่ถูกต้อง (1-500 เส้น)");
  if (rate <= 0 || rate > 100000) return fail("เรตต่อโลไม่ถูกต้อง");

  const sb = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = sb as unknown as { from: (t: string) => any };
  const { data: items, error: e0 } = await anyDb
    .from("stock_items")
    .select("id, sku, name, weight_per_unit, unit_cost")
    .in("id", ids);
  if (e0) return fail(e0.message, 500);

  const rows = (items ?? []) as { id: number; sku: string; name: string; weight_per_unit: number; unit_cost: number }[];
  const withW = rows.filter((r) => Number(r.weight_per_unit) > 0);
  if (!withW.length) return fail("ทุกเส้นที่เลือกยังไม่มีน้ำหนัก/เส้น — เติมน้ำหนักก่อน");

  // เรตเดิม (authoritative): ถัวเฉลี่ยถ่วงน้ำหนักจากราคาปัจจุบันของเส้นที่จะอัปเดต
  const sumKg = withW.reduce((s, r) => s + Number(r.weight_per_unit), 0);
  const sumCost = withW.reduce((s, r) => s + (Number(r.unit_cost) || 0), 0);
  const prevRate = sumKg > 0 && sumCost > 0 ? round2(sumCost / sumKg) : null;

  // (1) ประวัติราคารายเส้นก่อน — trigger sync unit_cost + price_per_kg เข้า stock_items ให้ (atomic ต่อคำสั่ง)
  const today = new Date().toISOString().slice(0, 10);
  const { error: e1 } = await anyDb.from("stock_prices").insert(withW.map((r) => ({
    stock_item_id: r.id,
    price_per_kg: rate,
    unit_cost: round2(Number(r.weight_per_unit) * rate),
    effective_date: today,
    supplier: "",
    note: `ตั้งเรตต่อโล ${rate} ฿/กก. — ${series} · ${color}`,
    created_by: profile.id,
  })));
  if (e1) return fail(`บันทึกประวัติราคาไม่สำเร็จ — ยังไม่มีอะไรเปลี่ยน: ${e1.message}`, 500);

  // (2) ติดธงคิดต่อโล — moving-average (0075) จะข้ามเส้นพวกนี้ตอนรับเข้า (กันราคาเรตถูกถัวทับ)
  const { error: e2 } = await anyDb.from("stock_items")
    .update({ is_weight_based: true }).in("id", withW.map((r) => r.id));

  // (3) ประวัติเรตระดับกลุ่ม (0088) — best-effort (ประวัติรายเส้นมีครบแล้วใน stock_prices)
  const { error: e3 } = await anyDb.from("alu_rate_log").insert({
    series, color, prev_rate: prevRate, rate, item_count: withW.length,
    changed_by: profile.id, changed_by_name: profile.full_name ?? "",
  });

  const warns: string[] = [];
  if (e2) warns.push("ติดธงคิดต่อโลไม่สำเร็จ (ราคาอัปเดตแล้ว)");
  if (e3) warns.push(/alu_rate_log/i.test(e3.message ?? "") || /does not exist/i.test(e3.message ?? "")
    ? "ยังไม่ได้รัน migration 0088 — ประวัติกลุ่มไม่ถูกบันทึก (ประวัติรายเส้นมีครบ)"
    : `บันทึกประวัติกลุ่มไม่สำเร็จ: ${e3.message}`);

  return ok({ updated: withW.length, skippedNoWeight: rows.length - withW.length, prev_rate: prevRate, warns });
}
