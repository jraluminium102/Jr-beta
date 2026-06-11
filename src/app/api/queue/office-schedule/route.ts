import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// POST /api/queue/office-schedule — แทนที่ตารางวันอยู่ออฟฟิศประจำทั้งหมด (ADMIN)
// body.slots = array ของ { sales_id, weekday(0-6), half('AM'|'PM') }
// กติกา: ห้าม 2 เซลล์อยู่ออฟฟิศ "ครึ่งเดียวกันของวันเดียวกัน" (weekday+half ห้ามซ้ำข้ามเซลล์)
const bodySchema = z.object({
  slots: z.array(z.object({
    sales_id: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    half: z.enum(["AM", "PM"]),
  })).max(60),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const { slots } = bodySchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  // ตรวจกติกา: weekday+half ห้ามซ้ำข้ามเซลล์ (ไล้/แม็กห้ามเจอกัน)
  const seen = new Map<string, string>(); // "wd-half" -> sales_id
  const WD_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  for (const s of slots) {
    const key = `${s.weekday}-${s.half}`;
    const prev = seen.get(key);
    if (prev && prev !== s.sales_id) {
      throw new HttpError(422, `มีเซลล์อยู่ออฟฟิศซ้ำช่อง ${WD_TH[s.weekday]} ${s.half === "AM" ? "เช้า" : "บ่าย"} — ปรับให้คนละช่วง`);
    }
    seen.set(key, s.sales_id);
  }

  // เซลล์หลักทั้งหมด (เป้าหมายที่จะอัปเดต — เคลียร์ของที่ไม่มีใน body ด้วย)
  const { data: mainSales, error: mErr } = await sb
    .from("queue_sales").select("id").eq("active", true).neq("role", "ASSISTANT");
  if (mErr) throw dbError(mErr);

  // จัดกลุ่ม slots ตาม sales_id
  const bySales = new Map<string, { weekday: number; half: string }[]>();
  for (const s of slots) {
    if (!bySales.has(s.sales_id)) bySales.set(s.sales_id, []);
    bySales.get(s.sales_id)!.push({ weekday: s.weekday, half: s.half });
  }

  // อัปเดตเซลล์หลักทุกคน (มีใน body = ตั้งตามนั้น, ไม่มี = เคลียร์เป็น [])
  for (const ms of (mainSales ?? []) as { id: string }[]) {
    const officeSlots = bySales.get(ms.id) ?? [];
    const { error } = await sb.from("queue_sales").update({ office_slots: officeSlots }).eq("id", ms.id);
    if (error) throw dbError(error);
  }

  return ok({ updated: (mainSales ?? []).length });
});
