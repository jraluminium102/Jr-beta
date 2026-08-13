import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { computeSuggestion } from "@/lib/queue-suggest";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const schema = z.object({
  sales_id: z.string().uuid().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  address: z.string().nullish(),
  location_url: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  from_date: z.string().nullish(), // (0042) วันเริ่มหา slot — ถ้าไม่ส่งมา = today+1
  fixed_time: z.enum(["10:00", "14:00"]).nullish(), // (ข้อ 12) ล็อกเวลาเอง → ระบบหาแค่วัน
});

// POST /api/queue/suggest — เสนอ slot ว่างเร็วสุดตามกฎคิว (ตรรกะอยู่ใน @/lib/queue-suggest)
//   R-Sunday / R-2slot / R-45min / R-Zone / R-Leave / R-Balance · auto = เฉพาะเซลล์ role=MAIN
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;
  const result = await computeSuggestion(sb, body);
  return ok(result);
});
