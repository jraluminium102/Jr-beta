import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import StockClient from "./StockClient";
import type { StockItem, StockCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

// สโตร์/ผลิต บันทึกได้ (0073) · อัปเดตราคา = บัญชี/แอดมิน
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];
// การซ่อนราคาจากฝ่ายสโตร์ = ยังไม่เปิด (ตอนนี้ทุกคนที่เข้าหน้านี้เห็นราคา)
// ไว้สร้างแอคเคาท์สโตร์ (role เฉพาะ) แล้วค่อยตั้ง COST_VIEW ให้ไม่รวม role นั้น
const COST_VIEW: string[] | null = null; // null = เห็นราคาได้ทุกคน

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
      canViewCost={COST_VIEW === null ? true : COST_VIEW.includes(role)}
      isAdmin={role === "ADMIN"}
    />
  );
}
