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
  const stock = await fetchAllStockRows<{ id: number; sku: string | null; name: string | null; color: string | null; is_stocked: boolean | null; qty_on_hand: number | null; image_url: string | null; category: string | null; unit: string | null }>(
    sb, "id, sku, name, color, is_stocked, qty_on_hand, image_url, category, unit",
  );
  const stockList: StockLite[] = stock.map((r) => ({
    id: Number(r.id), sku: r.sku ?? "", name: r.name ?? "", color: r.color ?? "", isStocked: r.is_stocked !== false, qty: Number(r.qty_on_hand) || 0, image: r.image_url || "", category: r.category ?? "", unit: r.unit ?? "",
  }));

  // ชื่อคนเบิกเก่า (datalist ตอนตัดสต็อก) — service client (ช่างไม่มี session)
  const { data: reqRows } = await sb.from("stock_moves").select("requester").neq("requester", "").order("created_at", { ascending: false }).limit(1000);
  const requesters: string[] = [...new Set(((reqRows ?? []) as { requester: string }[]).map((r) => String(r.requester)).filter((s) => s.trim()))].slice(0, 80);

  return (
    <div className="min-h-dvh" style={{ background: "#0f1115" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: "#171a21", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <Link href={`/chang/${params.token}`} className="text-[13px] text-sky-300">← ตารางผลิต</Link>
        <span className="text-[12px] text-white/45">ใบตัดอลู · ช่างแก้ + ตัดออกสโตร์ได้</span>
      </div>
      {/* จำกัดความกว้าง + จัดกลาง — หน้าลิงก์ช่างไม่มี shell (app) เลยยืดเต็มจอบนคอม (ตาราง/ช่องกรอกโหว่กลาง) */}
      <div className="max-w-[1040px] mx-auto px-3 sm:px-4 py-4">
        <CutlistEditorClient
          cutlistId={Number(params.id)}
          stock={stockList}
          colorOptions={stockColorOptions(stockList)}
          canWrite
          canCutStock
          changToken={params.token}
          requesters={requesters}
        />
      </div>
    </div>
  );
}
