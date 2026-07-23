import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangToken } from "@/lib/chang-token";
import { createServiceClient } from "@/lib/supabase/admin";
import CutlistEditorClient from "@/components/cutlist/CutlistEditorClient";
import { stockColorOptions, fetchAllStockRows, type StockLite } from "@/lib/cutlist/stock-match";

export const dynamic = "force-dynamic";

/**
 * ใบตัดสำหรับช่าง — ลิงก์ลับ ไม่ต้อง login (นอกกลุ่ม (app) จึงไม่มี auth layout)
 *
 * ช่าง: ดู + สร้าง/แก้ + **ตัดสต็อกได้** (canCutStock=true — เจ้าของเคาะ 23 ก.ค.69 ยืนยันใช้จริงหน้างาน)
 * ใช้ editor ตัวเดียวกับฝั่งออฟฟิศ แค่แนบโทเคนไปกับทุก request (ดู src/lib/cutlist/actor.ts)
 *
 * ⚠ ไม่มี session → ต้องใช้ service client อ่านสต็อก (RLS จะบล็อก)
 */
export default async function ChangCutlistPage({ params }: { params: { token: string; id: string } }) {
  const expected = await getChangToken();
  if (!expected || params.token !== expected) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // ⚠ ต้องแบ่งหน้า — สต็อก ~1,800 แถว เกิน cap 1,000/ครั้งของ Supabase (ดึงรวดเดียว = รหัสหลังแถว 1,000 หายเงียบ)
  const stock = await fetchAllStockRows<{ sku: string | null; name: string | null; qty_on_hand: number | null; image_url: string | null }>(
    sb, "sku, name, qty_on_hand, image_url",
  );
  const stockList: StockLite[] = stock.map((r) => ({
    sku: r.sku ?? "", name: r.name ?? "", qty: Number(r.qty_on_hand) || 0, image: r.image_url || "",
  }));

  return (
    <div className="min-h-dvh" style={{ background: "#0f1115" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: "#171a21", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <Link href={`/chang/${params.token}`} className="text-[13px] text-sky-300">← ตารางผลิต</Link>
        <span className="text-[12px] text-white/45">ใบตัดอลู · ช่างแก้ + ตัดออกสโตร์ได้</span>
      </div>
      <CutlistEditorClient
        cutlistId={Number(params.id)}
        stock={stockList}
        colorOptions={stockColorOptions(stockList)}
        canWrite
        canCutStock
        changToken={params.token}
      />
    </div>
  );
}
