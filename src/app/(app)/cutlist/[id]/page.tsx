import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import CutlistEditorClient from "@/components/cutlist/CutlistEditorClient";
import { stockColorOptions, type StockLite } from "@/lib/cutlist/stock-match";

export const dynamic = "force-dynamic";

// ใบตัด / BOQ — หน้า editor ต่อใบ: ข้อ (รุ่น+ขนาด) → ตารางตัดสด + BOQ รวม + สต็อกคงเหลือ + ปุ่มตัดสต็อก
// ดึงข้อมูลสต็อกทั้งชุด ฝั่ง server — ส่งเป็น "ลิสต์เต็ม" (รวมตัว sku ว่างที่รหัสฝังในชื่อ เช่น SlimLux/OPK)
// เพื่อให้ resolveStock จับคู่ทั้ง sku เป๊ะ + ชื่อมีรหัส+สี ได้ · editor เทียบ "ต้องใช้ vs คงเหลือ" ได้สด
export default async function CutlistEditorPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as unknown as { from: (t: string) => any };

  const { data: stock } = await sb
    .from("stock_items")
    .select("sku, name, qty_on_hand, image_url")
    .eq("is_active", true);

  const stockList: StockLite[] = ((stock ?? []) as { sku: string | null; name: string | null; qty_on_hand: number | null; image_url: string | null }[])
    .map((r) => ({ sku: r.sku ?? "", name: r.name ?? "", qty: Number(r.qty_on_hand) || 0, image: r.image_url || "" }));
  const colorOptions = stockColorOptions(stockList);

  const canWrite = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"].includes(profile?.role ?? "");
  return <CutlistEditorClient cutlistId={Number(params.id)} stock={stockList} colorOptions={colorOptions} canWrite={canWrite} />;
}
