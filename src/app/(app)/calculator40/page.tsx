import { createClient } from "@/lib/supabase/server";
import Calculator40Client from "@/components/Calculator40Client";
import { buildPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import type { Customer } from "@/lib/types";
import { CALC_OVERRIDE_SELECT, type OverrideRow } from "@/lib/calculator40/link-rows";

export const dynamic = "force-dynamic";

// เครื่องคิดราคา 4.0 (ต้นทุนจริง) — แยกเอกเทศจาก /calculator (R3.9) เดิม
// • ดึงลูกค้าจากทะเบียนมาให้ผูก (เฟส B: ออกใบเสนอราคาจริง)
// • ดึงราคาจากสต๊อกจริงมา "ทับ" pricebook → แก้ราคาใน stock แล้ว 4.0 เปลี่ยนตาม (ลิงค์สด)
export default async function Calculator40Page() {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };
  // ⚠ สต็อกต้องดึงแบบแบ่งหน้า — เกิน cap 1,000 แถว/query แล้ว (สต็อก ~1,800)
  //   ดึงครั้งเดียว = รหัสอลูหลังแถว 1,000 ไม่ได้ราคาสต็อก → คิดราคาด้วย pricebook เก่าเงียบๆ
  const [{ data }, stock, { data: overrides }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, job, phone, address, contact_person")
      .eq("is_active", true)
      .order("name"),
    fetchAllPaged<StockRow>((f, t) =>
      anyDb
        .from("stock_items")
        .select("name, sku, supplier, is_weight_based, unit_cost, price_per_kg")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(f, t),
    ),
    // override รหัส/จำนวน/ราคา จากหน้า /calculator40/link — ต้องทับสูตรจริงที่นี่ ไม่ใช่แค่หน้าลิงก์
    anyDb.from("calc_line_overrides").select(CALC_OVERRIDE_SELECT).eq("scope", "calc") as Promise<{ data: OverrideRow[] | null }>,
  ]);
  const priceOverride = buildPriceOverride(stock);
  return (
    <Calculator40Client
      customers={
        (data ?? []) as Pick<Customer, "id" | "name" | "job" | "phone" | "address" | "contact_person">[]
      }
      priceOverride={priceOverride}
      lineOverrides={overrides ?? []}
    />
  );
}
