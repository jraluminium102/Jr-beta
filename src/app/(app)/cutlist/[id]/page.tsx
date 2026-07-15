import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import CutlistEditorClient from "@/components/cutlist/CutlistEditorClient";

export const dynamic = "force-dynamic";

// ใบตัด / BOQ — หน้า editor ต่อใบ: ข้อ (รุ่น+ขนาด) → ตารางตัดสด + BOQ รวม + สต็อกคงเหลือ + ปุ่มตัดสต็อก
// ดึงข้อมูลสต็อกทั้งชุด (sku → คงเหลือ/รูป/ชื่อ) ฝั่ง server — editor เทียบ "ต้องใช้ vs คงเหลือ" ได้สด
export default async function CutlistEditorPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as unknown as { from: (t: string) => any };

  const { data: stock } = await sb
    .from("stock_items")
    .select("sku, name, qty_on_hand, image_url")
    .eq("is_active", true);

  const stockByCode: Record<string, { qty: number; image: string; name: string }> = {};
  for (const r of (stock ?? []) as { sku: string | null; name: string | null; qty_on_hand: number | null; image_url: string | null }[]) {
    const sku = String(r.sku ?? "").trim().toUpperCase();
    if (!sku || stockByCode[sku]) continue;
    stockByCode[sku] = { qty: Number(r.qty_on_hand) || 0, image: r.image_url || "", name: r.name || "" };
  }

  const canWrite = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"].includes(profile?.role ?? "");
  return <CutlistEditorClient cutlistId={Number(params.id)} stockByCode={stockByCode} canWrite={canWrite} />;
}
