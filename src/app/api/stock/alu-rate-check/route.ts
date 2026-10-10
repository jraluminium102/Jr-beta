import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { canSeeCost } from "@/lib/rbac";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { aluBrandOfRow, ALU_BRAND_LABEL } from "@/lib/calculator40/alu-brand";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";

// GET /api/stock/alu-rate-check → "กดอัปเดตเรตแล้ว ราคาเปลี่ยนจริงทั้งระบบไหม"
//   เจ้าของถาม 10 ต.ค.69 "เช็คว่าอัพเดทราคาแล้วราคาเปลี่ยนใหม่ทั้งระบบ คิดราคา สโตร์ — ชั้นไม่ชัวร์"
// ตรวจ 3 ชั้นให้ตรงกันหมด
//   ① ตารางเรต   PB.ALU_BRAND[แบรนด์][สี]                 = เลขที่เจ้าของส่งมา
//   ② ทุนในสโตร์  unit_cost = weight_per_unit × price_per_kg  (API alu-rates เขียนให้ตอนกดอัปเดต)
//   ③ เรตที่ใช้จริง price_per_kg = เรตในตารางของ แบรนด์ × สี ของแถวนั้น
// ①=②=③ → ทั้งคิดราคา 4.0 และสโตร์ ใช้เลขชุดเดียวกัน (คิดราคาคูณ น้ำหนัก × เรต จากตารางเดียวกันนี้)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = { from: (t: string) => any };
type Row = {
  id: number; sku: string; name: string; color: string | null;
  weight_per_unit: number | null; price_per_kg: number | null; unit_cost: number | null; category: string | null;
};

// ชื่อสีในสโตร์ → ชื่อสีในตารางเรต (ตารางใช้ชื่อแบบไฟล์ถอดทุน)
const COLOR_KEY: Record<string, string> = {
  "อบขาว": "อบขาว", "ขาว": "อบขาว", "ดำ": "ดำ", "เทาซาฮาร่า": "เทาซาฮาร่า", "ดำซาฮาร่า": "ดำซาฮาร่า",
  "Aztec gray": "แอทแทคเกรย์", "Aztecgray": "แอทแทคเกรย์", "ลายไม้สักทอง": "ลายไม้สักทอง",
  "มะฮอกกานี": "มะฮอกกานี", "ไวท์โอ็ค": "ไวท์โอ๊ค", "ไวท์โอ๊ค": "ไวท์โอ๊ค", "มิว": "มิว",
  "ขาว NA": "ขาว NA", "สีชา": "สีชา",
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canSeeCost(profile.role)) return FORBIDDEN();   // role สโตร์ = ตาบอดราคา

  const sb = createClient() as unknown as Sb;
  const rows = await fetchAllPaged<Row>((f, t) =>
    sb.from("stock_items")
      .select("id, sku, name, color, weight_per_unit, price_per_kg, unit_cost, category")
      .eq("is_active", true).order("id", { ascending: true }).range(f, t));

  const RATE = ((PRICEBOOK as any).ALU_BRAND ?? {}) as Record<string, Record<string, number>>;
  const alu = rows.filter((r) => /อลู/.test(String(r.category ?? "")));

  let same = 0;
  const costOff: unknown[] = [];    // ทุน ≠ น้ำหนัก × เรต (ตารางสโตร์เองไม่สอดคล้อง)
  const rateOff: unknown[] = [];    // เรตที่ตั้งไว้ ≠ เรตในตารางแบรนด์ (ยังไม่ได้กดอัปเดต / กดไม่ครบ)
  const noRate: unknown[] = [];     // มีน้ำหนักแต่ยังไม่มีเรต (ซื้อเป็นเส้น หรือแบรนด์ไม่มีสีนี้ขาย)
  const noWeight: unknown[] = [];

  for (const r of alu) {
    const w = Number(r.weight_per_unit) || 0;
    const k = Number(r.price_per_kg) || 0;
    const c = Number(r.unit_cost) || 0;
    const brand = aluBrandOfRow(r.sku, r.name);
    const ck = COLOR_KEY[String(r.color ?? "").trim()] ?? "";
    const want = brand && ck ? Number((RATE[brand] ?? {})[ck]) || 0 : 0;
    const base = { sku: r.sku, name: r.name, color: r.color, brand: ALU_BRAND_LABEL[brand] ?? "", kg: w, rate: k, cost: c, rateWant: want };
    if (!(w > 0)) { noWeight.push(base); continue; }
    if (!(k > 0)) { noRate.push({ ...base, why: want > 0 ? "ตารางมีเรตแล้ว แต่ยังไม่ได้กดอัปเดต" : "ซื้อเป็นเส้น / แบรนด์นี้ไม่มีสีนี้ขาย" }); continue; }
    if (Math.abs(c - r2(w * k)) > 0.02) { costOff.push({ ...base, costWant: r2(w * k) }); continue; }
    if (want > 0 && Math.abs(k - want) > 0.5) { rateOff.push(base); continue; }
    same++;
  }

  return ok({
    checkedAt: new Date().toISOString(),
    total: alu.length,
    same,                                   // ทุน = น้ำหนัก × เรต และเรตตรงตาราง
    costOff, rateOff, noRate, noWeight,
    note: costOff.length || rateOff.length
      ? "ยังมีแถวที่ไม่ตรง — กด \"อัปเดต\" ที่กลุ่มแบรนด์ × สี ของแถวนั้นอีกครั้ง"
      : "ทุน/หน่วยในสโตร์ = น้ำหนัก × เรต และเรตตรงกับตาราง 3 แบรนด์ทุกแถว — คิดราคา 4.0 คูณจากตารางเดียวกันนี้",
  });
}
