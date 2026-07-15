import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import CutlistEditorClient from "@/components/cutlist/CutlistEditorClient";
import { stockColorOptions, fetchAllStockRows, type StockLite } from "@/lib/cutlist/stock-match";

export const dynamic = "force-dynamic";

// ใบตัด / BOQ — หน้า editor ต่อใบ: ข้อ (รุ่น+ขนาด) → ตารางตัดสด + BOQ รวม + สต็อกคงเหลือ + ปุ่มตัดสต็อก
// ดึงข้อมูลสต็อกทั้งชุด ฝั่ง server — ส่งเป็น "ลิสต์เต็ม" (รวมตัว sku ว่างที่รหัสฝังในชื่อ เช่น SlimLux/OPK)
// เพื่อให้ resolveStock จับคู่ทั้ง sku เป๊ะ + ชื่อมีรหัส+สี ได้ · editor เทียบ "ต้องใช้ vs คงเหลือ" ได้สด
export default async function CutlistEditorPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as unknown as { from: (t: string) => any };

  // ⚠ ต้องดึงแบบแบ่งหน้า (fetchAllStockRows) — สต็อก ~1,800 แถว เกิน cap 1,000/ครั้งของ Supabase
  //   ดึงครั้งเดียว = รหัสหลังแถว 1,000 หายเงียบ โชว์ "ไม่มีในสต็อก" ทั้งที่มีจริง
  const stock = await fetchAllStockRows<{ sku: string | null; name: string | null; qty_on_hand: number | null; image_url: string | null }>(
    sb, "sku, name, qty_on_hand, image_url",
  );
  const stockList: StockLite[] = stock
    .map((r) => ({ sku: r.sku ?? "", name: r.name ?? "", qty: Number(r.qty_on_hand) || 0, image: r.image_url || "" }));
  const colorOptions = stockColorOptions(stockList);

  const canWrite = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"].includes(profile?.role ?? "");
  return <CutlistEditorClient cutlistId={Number(params.id)} stock={stockList} colorOptions={colorOptions} canWrite={canWrite} />;
}
