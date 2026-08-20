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

// หน้าตรวจ "ราคาในคิดราคา 4.0 ผูกกับสินค้าในสโตร์ครบไหม" (เจ้าของสั่ง 8 ส.ค.69)
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
