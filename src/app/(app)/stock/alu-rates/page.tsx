import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AluRatesClient from "./AluRatesClient";

export const dynamic = "force-dynamic";

const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];

// หน้า "เรตอลูต่อโล" — ตั้งราคา ฿/กก. ต่อกลุ่มซีรีส์×สี แล้วระบบคูณน้ำหนักรายเส้น อัปเดตราคาทุกเส้นในกลุ่ม
// ราคาคิด 4.0 ขยับตามทันที (ผูกรายเส้นด้วยรหัส sku — ALUCODE)
export default async function AluRatesPage() {
  const profile = await getProfile();
  const role = profile?.role ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as unknown as { from: (t: string) => any };

  const [{ data: withWeight }, { count: noWeight }] = await Promise.all([
    supabase.from("stock_items")
      .select("id, sku, name, supplier, weight_per_unit, unit_cost, price_per_kg")
      .eq("is_active", true).gt("weight_per_unit", 0).neq("sku", "")
      .order("sku", { ascending: true }),
    supabase.from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true).eq("category", "อลูมิเนียม")
      .or("weight_per_unit.is.null,weight_per_unit.eq.0"),
  ]);

  return (
    <AluRatesClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items={(withWeight ?? []) as any[]}
      noWeightCount={noWeight ?? 0}
      canEdit={PRICE_WRITE.includes(role)}
    />
  );
}
