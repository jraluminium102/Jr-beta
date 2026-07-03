import { createClient } from "@/lib/supabase/server";
import Calculator40Client from "@/components/Calculator40Client";
import { buildPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

// เครื่องคิดราคา 4.0 (ต้นทุนจริง) — แยกเอกเทศจาก /calculator (R3.9) เดิม
// • ดึงลูกค้าจากทะเบียนมาให้ผูก (เฟส B: ออกใบเสนอราคาจริง)
// • ดึงราคาจากสต๊อกจริงมา "ทับ" pricebook → แก้ราคาใน stock แล้ว 4.0 เปลี่ยนตาม (ลิงค์สด)
export default async function Calculator40Page() {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };
  const [{ data }, { data: stock }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, job, phone, address, contact_person")
      .eq("is_active", true)
      .order("name"),
    anyDb
      .from("stock_items")
      .select("name, sku, supplier, is_weight_based, unit_cost, price_per_kg")
      .eq("is_active", true),
  ]);
  const priceOverride = buildPriceOverride((stock ?? []) as StockRow[]);
  return (
    <Calculator40Client
      customers={
        (data ?? []) as Pick<Customer, "id" | "name" | "job" | "phone" | "address" | "contact_person">[]
      }
      priceOverride={priceOverride}
    />
  );
}
