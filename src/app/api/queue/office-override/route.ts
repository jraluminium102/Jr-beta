import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

type OfficeSlot = { weekday: number; half: string };
type OfficeOverride = { date: string; half: string; action: "add" | "remove" };

// POST /api/queue/office-override — ตั้งสถานะ office ของเซลล์ "เฉพาะวัน/ครึ่งวัน" (ADMIN)
// body: { sales_id, date:"YYYY-MM-DD", half:"AM"|"PM", want:boolean }
//   want=true  → ให้มี office วันนั้น (ถ้า pattern ไม่มี → add override; ถ้า pattern มี → ลบ override)
//   want=false → เอา office ออกวันนั้น (ถ้า pattern มี → remove override; ถ้าไม่มี → ลบ override)
// เก็บ override น้อยสุด (เฉพาะที่ต่างจาก pattern)
const bodySchema = z.object({
  sales_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD"),
  half: z.enum(["AM", "PM"]),
  want: z.boolean(),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const { sales_id, date, half, want } = bodySchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const { data: sales, error: gErr } = await sb
    .from("queue_sales").select("id, office_slots, office_overrides").eq("id", sales_id).maybeSingle();
  if (gErr) throw dbError(gErr);
  if (!sales) throw new HttpError(404, "ไม่พบเซลล์นี้");

  const weekday = new Date(date + "T00:00:00Z").getUTCDay(); // 0=อา..6=ส
  const slots: OfficeSlot[] = Array.isArray(sales.office_slots) ? sales.office_slots : [];
  const inPattern = slots.some((o) => o.weekday === weekday && o.half === half);

  // ตัด override เดิมของ (date,half) ออกก่อน แล้วเติมใหม่เฉพาะถ้าต่างจาก pattern
  const prev: OfficeOverride[] = Array.isArray(sales.office_overrides) ? sales.office_overrides : [];
  const next = prev.filter((o) => !(o.date === date && o.half === half));
  if (want && !inPattern) next.push({ date, half, action: "add" });
  if (!want && inPattern) next.push({ date, half, action: "remove" });

  const { error: uErr } = await sb.from("queue_sales").update({ office_overrides: next }).eq("id", sales_id);
  if (uErr) throw dbError(uErr);

  return ok({ sales_id, office_overrides: next });
});
