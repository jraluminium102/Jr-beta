import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, canSeeCost } from "@/lib/rbac";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { buildPriceOverride, applyPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
import { CUT_SPEC_BY_ID } from "@/lib/cutlist/products";
import { applyLineOverrides } from "@/lib/calculator40/line-overrides";
import {
  buildLinkRowsWithPricebook, attachStockAndOverrides, CALC_OVERRIDE_SELECT,
  type OverrideRow, type LinkStockRow,
} from "@/lib/calculator40/link-rows";
import LinkClient from "./LinkClient";

export const dynamic = "force-dynamic";

// หน้ารวม "สโตร์ ↔ ใบตัด ↔ คิดราคา 4.0" (เจ้าของสั่ง 1 ก.ย.69 — ดู docs/SPEC-หน้าลิงก์รวม-สโตร์-ใบตัด-คิดราคา.md)
//   ยุบ 2 หน้าเดิม (เทียบใบตัด + ตรวจผูกสโตร์) เข้าเป็นหน้าเดียว 1 แถว = 1 วัสดุ มี 3 ช่องความจริง
// ⚠ RBAC: ใช้ resource "calc_overrides" ตรง ๆ (ไม่ใช่ canWrite ของหน้าเดิม) — PRODUCTION ต้องแก้ได้ที่นี่
//   (RBAC เดิมของ compare/stock-audit จำกัดแค่ ADMIN/SALES/ACCOUNTING ซึ่งกัน PRODUCTION ผิดคน เพราะ PRODUCTION
//   คือ "คนคุมสูตรผลิต/ใบตัดจริง" ตาม comment ใน rbac.ts calc_overrides ของ role นั้น)
export default async function CalcLinkPage() {
  const profile = await getProfile();
  if (!profile || !can(profile.role, "calc_overrides", "read")) redirect("/calculator40");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };

  const [stock, overridesRes] = await Promise.all([
    // ⚠ ต้องดึงแบบแบ่งหน้า — สต็อกเกิน 1,000 แถว/query แล้ว ([[supabase-1000-row-cap]])
    fetchAllPaged<LinkStockRow>((f, t) =>
      anyDb
        .from("stock_items")
        .select("id, name, sku, color, category, supplier, is_weight_based, unit_cost, price_per_kg, weight_per_unit, qty_on_hand")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(f, t),
    ),
    anyDb.from("calc_line_overrides").select(CALC_OVERRIDE_SELECT).order("updated_at", { ascending: false }) as Promise<{
      data: OverrideRow[] | null;
    }>,
  ]);
  const overrides = overridesRes.data ?? [];

  // ── ประกบ override เข้าสูตรก่อนคำนวณแถว ──
  //   ⚠ ต้องใช้ applyLineOverrides (pure — คืน dict ใหม่) ไม่ใช่ applyOverridesInPlace ตรงนี้
  //   เพราะนี่คือฝั่งเซิร์ฟเวอร์ — PRODUCTS/CUT_SPEC_BY_ID เป็น module singleton ที่ request อื่น (คนอื่น) ใช้ร่วมกันได้
  //   ถ้า mutate ในที่ override cut-scope จะรั่วไปกระทบใบตัด/BOQ จริงของคนอื่นเงียบ ๆ (นอกขอบเขตรอบนี้)
  //   ฝั่ง client (Calculator40Client.tsx) ปลอดภัยกว่าเพราะแยกตาม browser tab ของแต่ละคน จึงใช้ applyOverridesInPlace ได้ที่นั่น
  // eslint-disable-next-line @typescript-eslint/no-explicit-any — PRODUCTS/CUT_SPEC_BY_ID เป็น .mjs/.ts ที่ไม่มี generic type แคบพอ (เหมือนไฟล์อื่นในโฟลเดอร์นี้)
  const effProducts = applyLineOverrides(PRODUCTS as Record<string, any>, overrides, "calc");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effCutSpecs = applyLineOverrides(CUT_SPEC_BY_ID as Record<string, any>, overrides, "cut");

  // priceOverride (เล็ก แค่ราคาที่ถูกทับ) ส่งลง client แทนทั้ง pricebook — client bundle มี pricebook.json เองอยู่แล้ว
  //   (แพตเทิร์นเดียวกับ Calculator40Client.tsx) ใช้คำนวณ "ผลกระทบต่อทุน" ตอนพรีวิวก่อนเซฟ ไม่ต้องยิง API ทุกครั้งที่พิมพ์
  const priceOverride = buildPriceOverride(stock as unknown as StockRow[], PRICEBOOK);
  const pb = applyPriceOverride(JSON.parse(JSON.stringify(PRICEBOOK)), priceOverride);

  const rows = buildLinkRowsWithPricebook(effProducts, pb, effCutSpecs);
  const fullRows = attachStockAndOverrides(rows, stock, overrides);

  const canEdit = can(profile.role, "calc_overrides", "write");
  const seeCost = canSeeCost(profile.role);

  // ⚠ role ที่ห้ามเห็นทุน ต้อง "ตัดตัวเลขทิ้งที่เซิร์ฟเวอร์" ไม่ใช่แค่ซ่อนคอลัมน์ใน UI
  //   (QA รอบ 2 ชี้: ของเดิมส่งราคาลง client เต็ม ๆ แล้วค่อยซ่อน = หลุดผ่าน network ได้)
  //   แพตเทิร์นเดียวกับ /api/stock ที่ redact ให้ role STORE ตั้งแต่ฝั่งเซิร์ฟเวอร์
  const safeRows = seeCost ? fullRows : fullRows.map((r) => ({
    ...r, calcPrice: null, calcAmount: null, stockPrice: null,
  }));
  const safeStock = seeCost ? stock : stock.map((s) => ({ ...s, unit_cost: 0, price_per_kg: 0 }));

  return (
    <LinkClient
      rows={safeRows}
      stock={safeStock}
      stockCount={stock.length}
      priceOverride={priceOverride}
      canSeeCost={seeCost}
      canEdit={canEdit && seeCost}
    />
  );
}
