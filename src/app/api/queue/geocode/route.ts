import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { geocodeAddress } from "@/lib/queue-geo";

export const dynamic = "force-dynamic";

const schema = z.object({ address: z.string().min(1) });

// POST /api/queue/geocode — ที่อยู่ตัวหนังสือ → พิกัดโดยประมาณ (ระดับถนน/แขวง) สำหรับคิวที่ไม่มีลิงก์แมพ
//   ใช้ให้กฎจับคู่ระยะในการเสนอวันทำงานได้ (เจ้าของ 9 พ.ย.69) · ผลเป็น approx เสมอ — UI ต้องบอกและให้ลากหมุดแก้ได้
export const POST = withRoute(async (req: Request) => {
  await requirePermission("queue", "read");
  const { address } = schema.parse(await req.json());
  const g = await geocodeAddress(address);
  if (!g) return err("หาพิกัดจากที่อยู่นี้ไม่เจอ — วางลิงก์ Google Maps หรือปักหมุดบนแผนที่แทน", 422);
  return ok(g);
});
