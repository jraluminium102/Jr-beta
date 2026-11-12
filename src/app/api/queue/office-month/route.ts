import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

type OfficeOverride = { date: string; half: string; action: "add" | "remove" };

// PUT /api/queue/office-month — ตั้งวันออฟฟิศของเซลล์ทั้งเดือน (แทนที่ override ของเดือนนั้นทั้งหมด)
// body: { sales_id, month:"YYYY-MM", days:[{date:"YYYY-MM-DD", half:"AM"|"PM"}] }
// ทั้งวัน = ส่งทั้ง AM และ PM · override เดือนอื่นไม่ถูกแตะ
const bodySchema = z.object({
  sales_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "เดือนต้องเป็น YYYY-MM"),
  days: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD"),
    half: z.enum(["AM", "PM"]),
  })).max(100),
});

export const PUT = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const { sales_id, month, days } = bodySchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const inMonth = (d: string) => d.startsWith(month + "-");
  const bad = days.find((d) => !inMonth(d.date) || Number.isNaN(Date.parse(d.date + "T00:00:00Z")));
  if (bad) throw new HttpError(400, `วันที่ ${bad.date} ไม่อยู่ในเดือน ${month}`);

  const { data: sales, error: gErr } = await sb
    .from("queue_sales").select("id, office_overrides").eq("id", sales_id).maybeSingle();
  if (gErr) throw dbError(gErr);
  if (!sales) throw new HttpError(404, "ไม่พบเซลล์นี้");

  const prev: OfficeOverride[] = Array.isArray(sales.office_overrides) ? sales.office_overrides : [];
  const next: OfficeOverride[] = prev.filter((o) => !inMonth(o.date));
  const seen = new Set<string>();
  for (const d of days) {
    const k = `${d.date}|${d.half}`;
    if (seen.has(k)) continue;
    seen.add(k);
    next.push({ date: d.date, half: d.half, action: "add" });
  }

  const { error: uErr } = await sb.from("queue_sales").update({ office_overrides: next }).eq("id", sales_id);
  if (uErr) throw dbError(uErr);

  return ok({ sales_id, office_overrides: next });
});
