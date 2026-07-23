import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canSeeCost } from "@/lib/rbac";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import AluRatesClient from "./AluRatesClient";

export const dynamic = "force-dynamic";

const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];

// หน้า "เรตอลูต่อโล" — ตั้งราคา ฿/กก. ต่อกลุ่มซีรีส์×สี แล้วระบบคูณน้ำหนักรายเส้น อัปเดตราคาทุกเส้นในกลุ่ม
// ราคาคิด 4.0 ขยับตามทันที (ผูกรายเส้นด้วยรหัส sku — ALUCODE)
export default async function AluRatesPage() {
  const profile = await getProfile();
  const role = profile?.role ?? "";
  if (!canSeeCost(role || null)) redirect("/stock");   // role สโตร์ = ตาบอดราคา ห้ามเข้าหน้าเรตอลู
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as unknown as { from: (t: string) => any };

  // ⚠ อลูมี sku ~1,100+ แถว ใกล้/เกิน cap 1,000 ต่อ query — แบ่งหน้ากันแถวท้ายหายเงียบ
  const [withWeight, { count: noWeight }, { data: rateLog }] = await Promise.all([
    fetchAllPaged<Record<string, unknown>>((f, t) =>
      supabase.from("stock_items")
        .select("id, sku, name, supplier, weight_per_unit, unit_cost, price_per_kg")
        .eq("is_active", true).gt("weight_per_unit", 0).neq("sku", "")
        .order("sku", { ascending: true }).order("id", { ascending: true }).range(f, t),
    ),
    supabase.from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true).eq("category", "อลูมิเนียม")
      .or("weight_per_unit.is.null,weight_per_unit.eq.0"),
    supabase.from("alu_rate_log")
      .select("id, series, color, prev_rate, rate, item_count, changed_by_name, created_at")
      .order("created_at", { ascending: false }).limit(60),
  ]);

  return (
    <AluRatesClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items={(withWeight ?? []) as any[]}
      noWeightCount={noWeight ?? 0}
      canEdit={PRICE_WRITE.includes(role)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rateLog={(rateLog ?? []) as any[]}
    />
  );
}
