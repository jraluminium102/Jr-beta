import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { usableWeights } from "@/lib/calculator40/weight-backfill";

// เติม "น้ำหนัก กก./เส้น" ให้เส้นอลูในสโตร์ จากไฟล์ถอดทุน (ชีต "น้ำหนักโปรไฟล์")
//   เจ้าของสั่ง 19 ส.ค.69 — เส้นที่ไม่มีน้ำหนัก กดเปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ
// ⚠ เขียนแค่ weight_per_unit เท่านั้น — ไม่แตะราคา
//   ราคาต้องไปผ่าน "ตั้งเรตต่อโล" (/api/stock/alu-rates) ที่ลงประวัติ stock_prices ให้ครบ
const WRITE_ROLES = ["ADMIN", "ACCOUNTING"];
type Sb = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!WRITE_ROLES.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) return fail("ยังไม่ได้เลือกรายการ");
  if (ids.length > 1000) return fail("เลือกได้ครั้งละไม่เกิน 1,000 รายการ");

  const sb = createClient() as unknown as Sb;
  const { data: items, error: e0 } = await sb
    .from("stock_items").select("id, sku, name, weight_per_unit").in("id", ids);
  if (e0) return fail(e0.message, 500);

  // น้ำหนักต้องมาจากตารางกลางเท่านั้น — client ส่งตัวเลขน้ำหนักมาเองไม่ได้ (กันยัดค่ามั่ว)
  const W = usableWeights();
  const rows = (items ?? []) as { id: number; sku: string; name: string; weight_per_unit: number }[];
  const todo = rows
    .map((r) => ({ r, kg: W[String(r.sku ?? "").trim().toUpperCase()] }))
    .filter((x) => x.kg > 0 && Math.abs(Number(x.r.weight_per_unit || 0) - x.kg) >= 0.005);

  const skipped = rows.length - todo.length;
  if (!todo.length) return ok({ updated: 0, skipped, note: "ไม่มีรายการที่ต้องเติม (ตรงอยู่แล้ว หรือรหัสไม่มีน้ำหนักในไฟล์)" });

  // อัปเดตทีละกลุ่มตามค่าน้ำหนัก (ค่าเดียวกันยิงรวดเดียว) — ลดจำนวน query
  const byKg = new Map<number, number[]>();
  for (const t of todo) byKg.set(t.kg, [...(byKg.get(t.kg) ?? []), t.r.id]);

  let updated = 0;
  const errs: string[] = [];
  for (const [kg, groupIds] of byKg) {
    const { error } = await sb.from("stock_items").update({ weight_per_unit: kg }).in("id", groupIds);
    if (error) errs.push(`${kg} กก.: ${error.message}`);
    else updated += groupIds.length;
  }
  if (errs.length && !updated) return fail(`เติมน้ำหนักไม่สำเร็จ: ${errs[0]}`, 500);

  return ok({
    updated, skipped,
    warns: errs.length ? [`บางกลุ่มไม่สำเร็จ (${errs.length}) — ${errs[0]}`] : [],
    note: "เติมน้ำหนักแล้ว · ราคายังเท่าเดิม — ถ้าจะให้ราคาขยับ ไปกด \"ตั้งเรตต่อโล\" ที่หน้าเรตอลู",
  });
}
