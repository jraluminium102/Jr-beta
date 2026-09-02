import { getQuotePin } from "@/lib/quick-quote/pin";
import pricebook from "@/lib/quick-quote/pricebook.json";

export const dynamic = "force-dynamic";

/**
 * POST /api/quick-quote/unlock  { pin }  → { pricebook }  (ถ้ารหัสถูก)
 *
 * ราคา (pricebook.json) อยู่ฝั่ง server เท่านั้น — import ที่นี่จุดเดียว ไม่ไปโผล่ใน client bundle
 *   → ต่อให้เดา path หน้าเจอ ถ้าไม่มีรหัส ก็ดึงราคาไม่ได้ (กันคู่แข่งเห็นราคาทั้งร้าน)
 * public route (ไม่ต้อง login) · เซลล์ใส่รหัสครั้งเดียว หน้าเว็บ cache pricebook ในเครื่อง
 */
export async function POST(req: Request) {
  const expected = await getQuotePin();
  if (!expected) {
    return Response.json({ error: "ยังไม่ได้ตั้งรหัสผ่าน — รัน migration 0132 หรือ set app_config quote_pin ก่อน" }, { status: 503 });
  }
  let pin = "";
  try {
    const body = await req.json();
    pin = String(body?.pin ?? "").trim();
  } catch {
    return Response.json({ error: "payload ไม่ถูกต้อง" }, { status: 400 });
  }
  // เทียบแบบไม่รีบคืน (กัน timing เดา) — PIN สั้นอยู่แล้ว เอาพอเป็นพิธี
  const okPin = pin.length > 0 && pin === expected;
  if (!okPin) {
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  return Response.json({ pricebook });
}
