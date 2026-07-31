import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import StockClient from "./StockClient";
import type { StockItem, StockCategory } from "@/lib/types";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { canSeeCost } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// สโตร์/ผลิต บันทึกได้ (0073) · อัปเดตราคา = บัญชี/แอดมิน
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];
const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];

export default async function StockPage() {
  const profile = await getProfile();
  const role = profile?.role ?? "";
  const canViewCost = canSeeCost(role || null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as unknown as { from: (t: string) => any };

  // ⚠ สต็อก ~1,800 แถว เกิน cap 1,000/query — ดึงครั้งเดียวของหลังแถว 1,000 "หายจากหน้าจอเงียบๆ"
  //   (ค้นไม่เจอ นึกว่าไม่มีของ) → แบ่งหน้าด้วย fetchAllPaged · order ต้องจบด้วย id กันแถวซ้ำ/หลุดระหว่างหน้า
  const [items, { data: cats }] = await Promise.all([
    fetchAllPaged<StockItem>((f, t) =>
      supabase.from("stock_items").select("*").eq("is_active", true)
        .order("name", { ascending: true }).order("id", { ascending: true }).range(f, t),
    ),
    supabase.from("stock_categories").select("*").eq("is_active", true)
      .order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);

  // role สโตร์ = ตาบอดราคา → ตัดต้นทุนออกจาก props ที่ส่งไป client (กันหลุดใน page payload)
  const safeItems = canViewCost ? items : items.map((it) => ({ ...it, unit_cost: null, price_per_kg: null } as unknown as StockItem));

  return (
    <StockClient
      initial={safeItems}
      categories={(cats ?? []) as StockCategory[]}
      canWrite={STORE_WRITE.includes(role)}
      canPrice={PRICE_WRITE.includes(role)}
      canViewCost={canViewCost}
      isAdmin={role === "ADMIN"}
      canMerge={role === "ADMIN" || role === "STORE" || role === "ACCOUNTING"}
    />
  );
}
