import { createClient } from "@/lib/supabase/server";
import CutListClient from "@/components/CutListClient";

export const dynamic = "force-dynamic";

// ใบตัด / BOQ (นำร่อง) — เอนจินใบตัดอลู · รากของ BOQ ต่องาน + ตัดสต็อก
// ดึงรูปหน้าตัดโปรไฟล์จากสต็อก (image_url ต่อ sku=รหัส B####) มาโชว์คู่แต่ละเส้น
export default async function CutListPage() {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = supabase as unknown as { from: (t: string) => any };
  const { data: stock } = await anyDb
    .from("stock_items")
    .select("sku, image_url")
    .neq("image_url", "")
    .eq("is_active", true);
  const imagesByCode: Record<string, string> = {};
  for (const r of (stock ?? []) as { sku: string | null; image_url: string | null }[]) {
    const sku = String(r.sku ?? "").trim().toUpperCase();
    if (sku && r.image_url && !imagesByCode[sku]) imagesByCode[sku] = r.image_url;
  }
  return <CutListClient imagesByCode={imagesByCode} />;
}
