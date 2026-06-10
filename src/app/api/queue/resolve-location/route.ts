import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { resolveMapLink } from "@/lib/queue-geo";

export const dynamic = "force-dynamic";

const schema = z.object({ url: z.string().min(1) });

// POST /api/queue/resolve-location — แกะพิกัดจากลิงก์ Google Maps (รองรับลิงก์ย่อ maps.app.goo.gl)
// ใช้ให้ฟอร์มคิวโชว์พิกัดที่อ่านได้ทันที (กฎ 45 นาที + โซนทำงานถูกต้อง)
export const POST = withRoute(async (req: Request) => {
  await requirePermission("queue", "read");
  const { url } = schema.parse(await req.json());
  const co = await resolveMapLink(url);
  if (!co) return err("อ่านพิกัดจากลิงก์ไม่ได้ — ลองวางลิงก์ Google Maps แบบเต็ม หรือพิมพ์พิกัด lat,lng", 422);
  return ok(co);
});
