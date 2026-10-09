import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { matchWeights, summarize, manualGroups, type StockLite } from "@/lib/calculator40/weight-backfill";
import WeightBackfillClient from "./WeightBackfillClient";

export const dynamic = "force-dynamic";

// หน้าเติม "น้ำหนัก กก./เส้น" ให้เส้นอลูในสโตร์ จากไฟล์ถอดทุน (เจ้าของสั่ง 19 ส.ค.69)
//   เส้นที่ไม่มีน้ำหนัก = กดเปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ (API ตั้งเรตข้ามให้เลย)
//   ⚠ ดึงสต็อกแบบแบ่งหน้า — เกิน 1,000 แถว ([[supabase-1000-row-cap]])
export default async function WeightBackfillPage() {
  const profile = await getProfile();
  if (!["ADMIN", "ACCOUNTING"].includes(profile?.role ?? "")) redirect("/stock");

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };
  const stock = await fetchAllPaged<StockLite>((f, t) =>
    anyDb
      .from("stock_items")
      .select("id, name, sku, color, category, weight_per_unit, price_per_kg, unit_cost, is_weight_based")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(f, t),
  );

  const rows = matchWeights(stock);
  // เส้นอลูที่ไฟล์ไม่มีน้ำหนักให้ → กรอกเองในหน้าเดียวกัน (เจ้าของสั่ง 9 ต.ค.69)
  const manual = manualGroups(stock);
  return <WeightBackfillClient rows={rows} counts={summarize(rows)} stockCount={stock.length} manual={manual} />;
}
