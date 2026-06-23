import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const SELECT = "*, sales:sales_id(id,name,code,team,role)";

const bodySchema = z.object({
  sales_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD"),
  kind: z.enum(["LEAVE_FULL", "LEAVE_HALF", "OFFICE_HALF", "HOLIDAY", "WFH"]),
  half: z.enum(["AM", "PM"]).nullish(),
  note: z.string().nullish(),
});

// GET /api/queue/availability — list sales_availability records
// Optional ?sales_id=<uuid> to filter by one sales rep
// Optional ?month=YYYY-MM    to filter by specific month (for list view per-month)
// No date filter by default — returns ALL records so past-month leaves are visible
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;

  const url = new URL(req.url);
  const salesFilter = url.searchParams.get("sales_id");
  const monthFilter = url.searchParams.get("month"); // "YYYY-MM"

  let query = sb
    .from("sales_availability")
    .select(SELECT)
    .order("date", { ascending: true })
    .order("sales_id");

  // กรองตาม month ถ้าระบุมา — ใช้สำหรับ conflict check ใน QueueModal
  if (monthFilter) {
    const mMatch = monthFilter.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      const [, yr, mo] = mMatch;
      const dateFrom = `${yr}-${mo}-01`;
      const last = new Date(Number(yr), Number(mo), 0);
      const dateTo = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
      query = query.gte("date", dateFrom).lte("date", dateTo);
    }
  }

  if (salesFilter) {
    query = query.eq("sales_id", salesFilter);
  }

  const { data, error } = await query;
  if (error) throw dbError(error);
  return ok(data ?? []);
});

// POST /api/queue/availability — create a leave/availability record (ADMIN)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = bodySchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  // half is required for LEAVE_HALF
  if (body.kind === "LEAVE_HALF" && !body.half) {
    throw new HttpError(422, "LEAVE_HALF ต้องระบุ half (AM หรือ PM)");
  }

  const { data, error } = await sb
    .from("sales_availability")
    .insert({
      sales_id: body.sales_id,
      date: body.date,
      kind: body.kind,
      half: body.half ?? null,
      note: body.note ?? null,
    })
    .select(SELECT)
    .single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(400, "บันทึกวันลาไม่สำเร็จ");
  return created(data);
});

// DELETE /api/queue/availability?id=<uuid> — remove a leave record (ADMIN)
export const DELETE = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const sb = ctx.supabase as unknown as Sb;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new HttpError(400, "ต้องระบุ id ของรายการที่จะลบ (?id=...)");

  const { data, error } = await sb
    .from("sales_availability")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw dbError(error);
  if (!data || data.length === 0)
    throw new HttpError(404, "ไม่พบรายการวันลานี้ (อาจถูกลบไปแล้ว)");
  return ok({ id });
});
