import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";
import { buildPriceOverride, applyPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

// หน้าเทียบ "คิดราคา 4.0 ↔ ใบตัด" (เจ้าของสั่ง 19 ส.ค.69)
//   ใส่ขนาด → เห็นรหัส/ชื่อ/จำนวน/ราคา ทั้งสองฝั่งวางคู่กัน ว่าคิดราคาขึ้นครบเท่าใบตัดไหม
//   ⚠ ไม่มีสูตรของตัวเอง — ดึงจาก engine เดิมทั้งคู่ (compare-cut.ts) แก้ต้นทางที่เดียวเปลี่ยนทั้งเว็บ
//   ⚠ ต้องดึงสต็อกแบบแบ่งหน้า — เกิน 1,000 แถว ([[supabase-1000-row-cap]])
export default async function ComparePage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/calculator40");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };
  const stock = await fetchAllPaged<StockRow>((f, t) =>
    anyDb
      .from("stock_items")
      .select("name, sku, color, supplier, is_weight_based, unit_cost, price_per_kg")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(f, t),
  );

  // ชุดราคาเดียวกับที่หน้าคิดราคา 4.0 ใช้จริง (pricebook + ทับด้วยราคาสโตร์)
  const pb = applyPriceOverride(
    JSON.parse(JSON.stringify(PRICEBOOK)),
    buildPriceOverride(stock, PRICEBOOK),
  );

  return <CompareClient pb={pb} stockCount={stock.length} />;
}
