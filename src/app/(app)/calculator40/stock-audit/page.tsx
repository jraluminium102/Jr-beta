import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { buildPriceOverride, applyPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import { auditStockLink, auditByProduct, auditKgLink, bumpTest, type AuditStockRow } from "@/lib/calculator40/stock-audit";
import { buildBoxPrices } from "@/lib/calculator40/box-link";
import { auditBoxes, unusedBoxesInStock } from "@/lib/calculator40/box-audit";
import AuditClient from "./AuditClient";

export const dynamic = "force-dynamic";

// หน้า "มุมเสริม" ของการตรวจผูกสโตร์ (เจ้าของสั่ง 8 ส.ค.69)
//
// ⚠ 1 ก.ย.69: หน้าหลักย้ายไป /calculator40/link แล้ว (รวมกับหน้าเทียบใบตัด ตามที่เจ้าของสั่ง)
//   แต่ "ห้ามทิ้ง" 2 มุมนี้ที่หน้าใหม่ยังไม่มี — เจ้าของเคยย้ำเรื่องนี้ตรง ๆ:
//     ① ราคาต่อโล → ราคาต่อเส้น : กลัวว่าขึ้นเรตต่อกิโลในสโตร์แล้วราคาในใบเสนอไม่เด้งตาม
//     ② กล่อง/ฉาก ตามชื่อ+ขนาด+สี : ของที่ไม่มีรหัสโปรไฟล์ ผูกด้วยชื่อล้วน
//   จึงคง route นี้ไว้ใช้งานได้จริง แล้วให้หน้าใหม่ลิงก์มาหา (ไม่ redirect ทิ้ง)
//   ยิงกับสโตร์จริง → ไล่ทีละรายการ + โหลด CSV ไปกาเช็คได้
//   ⚠ ต้องดึงแบบแบ่งหน้า — สต็อกเกิน 1,000 แถว ([[supabase-1000-row-cap]])
export default async function StockAuditPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/calculator40");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };
  const stock = await fetchAllPaged<AuditStockRow>((f, t) =>
    anyDb
      .from("stock_items")
      .select("id, name, sku, color, category, supplier, is_weight_based, unit_cost, price_per_kg, weight_per_unit")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(f, t),
  );

  // ตรวจกับ pricebook ที่ "ทับราคาสโตร์แล้ว" — คือชุดราคาที่หน้าคิดราคาใช้จริง
  const pb = applyPriceOverride(
    JSON.parse(JSON.stringify(PRICEBOOK)),
    buildPriceOverride(stock as StockRow[], PRICEBOOK),
  );
  const rows = auditStockLink(stock, pb);
  const bump = bumpTest(pb, 10);
  const products = auditByProduct(rows, bump);
  const kgRows = auditKgLink(stock);   // สาย "เรตต่อโล → ราคาต่อเส้น" ต่อครบไหม
  // กล่อง/ฉาก ผูกด้วยชื่อ+ขนาด (ไม่มีรหัสโปรไฟล์) — จับคู่แล้วเจอราคาสีไหนบ้าง
  const boxRows = auditBoxes(buildBoxPrices(stock as never));
  const boxExtra = unusedBoxesInStock(stock as never, new Set(boxRows.map((b) => b.key)));

  return <AuditClient rows={rows} products={products} bump={bump} kgRows={kgRows} boxRows={boxRows} boxExtra={boxExtra} stockCount={stock.length} />;
}
