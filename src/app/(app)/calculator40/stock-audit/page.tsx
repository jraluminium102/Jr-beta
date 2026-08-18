import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { buildPriceOverride, applyPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import { auditStockLink, bumpTest, type AuditStockRow } from "@/lib/calculator40/stock-audit";
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
      .select("id, name, sku, color, category, supplier, is_weight_based, unit_cost, price_per_kg")
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

  return <AuditClient rows={rows} bump={bump} stockCount={stock.length} />;
}
