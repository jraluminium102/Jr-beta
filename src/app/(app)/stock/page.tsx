import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import StockClient from "./StockClient";
import type { StockItem, StockCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

// สโตร์/ผลิต บันทึกได้ (0073) · อัปเดต+เห็นราคา = บัญชี/แอดมิน
// ฝ่ายสโตร์ (PRODUCTION) รับเข้า/เบิกออกได้ แต่ "ไม่เห็นราคา/ต้นทุน"
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];
const COST_VIEW = ["ADMIN", "ACCOUNTING"];

export default async function StockPage() {
  const profile = await getProfile();
  const role = profile?.role ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as unknown as { from: (t: string) => any };

  const [{ data: items }, { data: cats }] = await Promise.all([
    supabase.from("stock_items").select("*").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("stock_categories").select("*").eq("is_active", true)
      .order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);

  return (
    <StockClient
      initial={(items ?? []) as StockItem[]}
      categories={(cats ?? []) as StockCategory[]}
      canWrite={STORE_WRITE.includes(role)}
      canPrice={PRICE_WRITE.includes(role)}
      canViewCost={COST_VIEW.includes(role)}
      isAdmin={role === "ADMIN"}
    />
  );
}
