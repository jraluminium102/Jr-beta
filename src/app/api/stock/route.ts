import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { colorFromName } from "@/lib/cutlist/stock-match";
import { canSeeCost } from "@/lib/rbac";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { aluRateOf, storeColorOf, ALU_BRAND_LABEL } from "@/lib/calculator40/alu-brand";
import { createServiceClient } from "@/lib/supabase/admin";

// สโตร์/ผลิต บันทึกวัสดุได้ด้วย (0073) — ไม่ใช่แค่ ADMIN/SALES/ACCOUNTING
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];

// GET /api/stock?q=คำค้น  → รายการวัสดุ (is_active=true)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = createClient();
  // ⚠ 5 ต.ค.69: เดิม select ครั้งเดียว → PostgREST ตัดที่ 1,000 แถว "เงียบ ๆ" (สโตร์มี 2,191 รายการ)
  //   ค้นหาแบบไม่ใส่คำค้นเลยได้แค่ของที่ชื่อขึ้นต้นด้วย ก. → ใช้ fetchAllPaged เหมือนสมุดสโตร์
  const q2 = q.replace(/[,%()]/g, " ").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] = [];
  let error: unknown = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data = await fetchAllPaged<any>((from, to) => {
      let query = supabase
        .from("stock_items")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .order("id", { ascending: true })   // กันหน้าถัดไปแถวซ้ำ/หาย (ชื่อซ้ำกันได้)
        .range(from, to);
      if (q2) query = query.or(`name.ilike.%${q2}%,sku.ilike.%${q2}%,category.ilike.%${q2}%`);
      return query;
    });
  } catch (e) { error = e; }
  if (error) return fail(error instanceof Error ? error.message : String(error), 500);
  // role สโตร์ = ตาบอดราคา → ตัดฟิลด์ต้นทุนออกก่อนส่ง (กันหลุดผ่าน network)
  if (!canSeeCost(profile.role)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok((data ?? []).map((r: any) => ({ ...r, unit_cost: null, price_per_kg: null })));
  }
  return ok(data);
}

// เพิ่มสินค้าใหม่ = ทุก write role "ยกเว้น STORE" (มิ้ง เบิก/รับ/ปรับ/แก้ได้ แต่ห้ามเพิ่ม/ลบสินค้า — เจ้าของสั่ง)
const ITEM_CREATE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];

// POST /api/stock  → เพิ่มวัสดุ
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!ITEM_CREATE.includes(profile.role)) return FORBIDDEN();

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

  // ── อลูเลือกแบรนด์ (เจ้าของสั่ง 16 ต.ค.69) — เรต ฿/กก. ล็อกตามตาราง PB.ALU_BRAND (ไม่รับตัวเลขจากหน้าจอ) ──
  //   fuji/sms/market = คิดต่อโล บังคับ · ต้องมีสีที่แบรนด์นั้นมีเรต + น้ำหนัก/หน่วย > 0
  //   fixed = ซื้อเป็นเส้น ไม่คิดต่อโล (กรอกต้นทุน/เส้นเองตามเดิม)
  const aluBrand = ["fuji", "sms", "market", "fixed"].includes(String(body.alu_brand ?? "")) ? String(body.alu_brand) : "";
  const isAluCategory = /อลู/.test(categoryName);
  if (isAluCategory && !aluBrand) return fail("วัสดุหมวดอลู ต้องเลือกแบรนด์ (Fuji / SMS / ตลาด / ซื้อเป็นเส้น)");
  const brandLocked = aluBrand === "fuji" || aluBrand === "sms" || aluBrand === "market";
  let lockedRate = 0;
  let lockedColor = "";
  if (brandLocked) {
    if (!String(body.color ?? "").trim()) return fail("เลือกสีของเส้นอลูก่อน (เรตขึ้นกับแบรนด์ × สี)");
    const r = aluRateOf(aluBrand, body.color);
    if (!(r.rate > 0)) return fail(`แบรนด์ ${ALU_BRAND_LABEL[aluBrand]} ไม่มีสี "${body.color}" ในตารางเรต — เลือกสีจากรายการ หรือเลือก "ซื้อเป็นเส้น"`);
    if (!(Number(body.weight_per_unit) > 0)) return fail("กรอกน้ำหนักต่อเส้น (กก.) — ราคาเส้น = น้ำหนัก × เรตแบรนด์");
    lockedRate = r.rate;
    lockedColor = storeColorOf(body.color);
  }

  const isWeight = brandLocked ? true : (aluBrand === "fixed" ? false : !!body.is_weight_based);
  const weightPerUnit = Number(body.weight_per_unit) || 0;
  const pricePerKg = brandLocked ? lockedRate : (Number(body.price_per_kg) || 0);
  // ต้นทุนต่อหน่วย: อลูคิดต่อโล → price_per_kg × น้ำหนัก/หน่วย · อื่นๆ → unit_cost ที่กรอกตรง
  const unitCost = isWeight ? Math.round(pricePerKg * weightPerUnit * 100) / 100 : (Number(body.unit_cost) || 0);

  // เริ่มที่ qty_on_hand=0 เสมอ — ถ้ามียอดยกมา ปล่อยให้ trigger บวกผ่าน stock_moves (มี log)
  const baseRow: Record<string, unknown> = {
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
    is_stocked: body.is_stocked !== false,   // 0125 — ปิด = ของสั่งตามงาน ใช้เป็นราคาอย่างเดียว
    weight_per_unit: weightPerUnit,
    price_per_kg: pricePerKg,
    unit_cost: unitCost,
  };
  let { data: item, error } = await supabase
    .from("stock_items").insert({ ...baseRow, ...(aluBrand ? { alu_brand: aluBrand } : {}) }).select("*").single();
  // 0157 ยังไม่รัน (ไม่มีคอลัมน์ alu_brand) → บันทึกต่อได้ แต่แบรนด์ไม่ถูกเก็บ (เรตยังล็อกถูก)
  if (error && /alu_brand/i.test(error.message ?? "")) {
    ({ data: item, error } = await supabase.from("stock_items").insert(baseRow).select("*").single());
  }

  if (error) return fail(error.message, 500);

  // รหัสสินค้าอัตโนมัติ: เว้นว่าง → สร้าง "JR" + id 5 หลัก (เช่น JR00368) — แก้ไขได้ (ถ้ากรอกมาใช้ตามนั้น)
  //   ต้องทำหลัง insert เพราะต้องรู้ id ก่อน · pattern เดียวกับ backfill 0103 (generic sku = JR#####)
  if (!String(body.sku ?? "").trim()) {
    const autoSku = "JR" + String(item.id).padStart(5, "0");
    const { error: skuErr } = await supabase.from("stock_items").update({ sku: autoSku }).eq("id", item.id);
    if (!skuErr) item.sku = autoSku;
  }

  // สี (0106) — เขียนแยกแบบ non-fatal · ถ้าไม่กรอกสี แต่ชื่อมีสี (เช่น "...-อบขาว") → ดึงสีจากชื่อมาเติมอัตโนมัติ
  const colorVal = lockedColor || String(body.color ?? "").trim() || colorFromName(body.name, item.sku);
  if (colorVal) {
    const { error: colErr } = await supabase.from("stock_items").update({ color: colorVal }).eq("id", item.id);
    if (!colErr) item.color = colorVal;
  }

  // บันทึกราคาเริ่มต้นเข้าประวัติ (ถ้ามี) — trigger sync unit_cost/price_per_kg ให้อยู่แล้ว
  let priceWarn = "";
  if (unitCost > 0 || pricePerKg > 0) {
    // แบรนด์ล็อก: เรตมาจากตารางเรตแบรนด์ (ไม่ใช่ตัวเลขที่ผู้ใช้พิมพ์) → เขียนประวัติผ่าน service client ได้
    //   (RLS stock_prices เขียนได้แค่ ADMIN/ACCOUNTING แต่ ผลิต/เซลส์ ก็เพิ่มวัสดุได้ — เดิมประวัติหายเงียบ)
    const ph = brandLocked ? (createServiceClient() as unknown as typeof supabase) : supabase;
    const { error: phErr } = await ph.from("stock_prices").insert({
      stock_item_id: item.id,
      price_per_kg: isWeight ? pricePerKg : null,
      unit_cost: unitCost,
      supplier: body.supplier ?? "",
      note: brandLocked ? `ราคาเริ่มต้น — เรตแบรนด์ ${ALU_BRAND_LABEL[aluBrand]} · ${lockedColor} ${pricePerKg} ฿/กก.` : "ราคาเริ่มต้น",
      created_by: profile.id,
    });
    if (phErr) priceWarn = "บันทึกวัสดุแล้ว แต่ประวัติราคาไม่ถูกบันทึก: " + phErr.message;
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

  return ok(priceWarn ? { ...item, warn: priceWarn } : item, 201);
}
