import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";
import { resolveMapLink } from "@/lib/queue-geo";

export const dynamic = "force-dynamic";

// Supabase generics are too complex for conditional chaining — use as any, same as /api/jobs
type Sb = { from: (t: string) => any };

const SELECT = "*, sales:sales_id(id,name,code,team), assistant:assistant_id(id,name,code)";
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// "" -> null (prevent date/uuid/number blanks from breaking DB)
// normalize queue_time format เก่า → HH:MM (จุด→โคลอน, ตัดวินาที) กัน import "10.00"/"9:30:00" เด้ง
function normTime(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s;
}

function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) =>
      [k, k === "queue_time" ? normTime(v) : (v === "" ? null : v)])
  );
}

const entrySchema = z.object({
  status: z.enum(["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"]).nullish(),
  queue_date: z.string().nullish(),
  queue_time: z.string().regex(TIME_RE, "รูปแบบเวลาต้องเป็น HH:MM").nullish(),
  job_type: z.string().nullish(),
  sales_id: z.string().uuid().nullish(),
  assistant_id: z.string().uuid().nullish(),
  line_contact: z.string().nullish(),
  contact_channel: z.enum(["LINE", "FB"]).optional(),
  customer_name: z.string().min(1, "กรุณาระบุชื่อลูกค้า"),
  tel: z.string().nullish(),
  address: z.string().nullish(),
  location_url: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  job_count: z.number().int().nullish(),
  assess_fee: z.number().nullish(),
  payment: z.string().nullish(),
  receipt_done: z.boolean().optional(),
  fee_paid: z.boolean().optional(),
  note_admin: z.string().nullish(),
  note_ai: z.string().nullish(),
  target_job_id: z.string().uuid().nullish(),      // (0044) เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม
  target_customer_id: z.number().int().nullish(),  // (0045) ลูกค้าเก่าหน้างานใหม่
});

// GET /api/queue — list entries + sales dropdown
// Supports query params:
//   ?month=YYYY-MM   filter by calendar month  (default: current month)
//   ?week=YYYY-Www   filter by ISO week        (overrides month if both given)
//   ?sales=<uuid>    filter by sales_id        (ADMIN only, ignored for SALES role)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;
  const canWrite = can(ctx.role, "queue", "write");

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month"); // "YYYY-MM"
  const weekParam  = url.searchParams.get("week");  // "YYYY-Www"
  const salesParam = url.searchParams.get("sales"); // uuid

  const { data: salesRows } = await sb
    .from("queue_sales")
    .select("*")
    .eq("active", true)
    .order("team")
    .order("name");

  let query = sb
    .from("queue_entries")
    .select(SELECT)
    .order("queue_date", { ascending: true, nullsFirst: true })
    .order("queue_time", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  // Compute date range filter (default = current month)
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (weekParam) {
    // Parse ISO week "YYYY-Www" → Monday and Sunday of that week
    const m = weekParam.match(/^(\d{4})-W(\d{2})$/);
    if (m) {
      const [, yr, wk] = m;
      const [wFrom, wTo] = isoWeekRange(Number(yr), Number(wk));
      dateFrom = wFrom;
      dateTo = wTo;
    }
  } else {
    // Default or explicit month filter
    const monthStr = monthParam ?? currentMonth();
    const mMatch = monthStr.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      const [, yr, mo] = mMatch;
      dateFrom = `${yr}-${mo}-01`;
      dateTo = lastDayOfMonth(Number(yr), Number(mo));
    }
  }

  if (dateFrom && dateTo) {
    // โชว์: (1) คิวรอจัด (queue_date null) เสมอ · (2) คิวในเดือนที่ดู ·
    // (3) คิวเลยวัน "ยังไม่ปิด" (PENDING/PROPOSED/CONFIRMED ก่อนเดือนนี้) — กันงานค้างหายข้ามเดือน
    query = query.or(
      `queue_date.is.null,and(queue_date.gte.${dateFrom},queue_date.lte.${dateTo}),and(status.in.(PENDING,PROPOSED,CONFIRMED),queue_date.lt.${dateFrom})`
    );
  }

  // SALES role: show only their own queue entries (RLS also guards at DB level)
  let unlinked = false;
  if (!canWrite && ctx.role === "SALES") {
    const mine = (salesRows ?? []).find(
      (s: any) => s.profile_id === ctx.user.id
    );
    if (mine) {
      query = query.eq("sales_id", mine.id);
    } else {
      unlinked = true;
    }
  } else if (canWrite && salesParam) {
    // ADMIN can filter by sales_id via ?sales=
    query = query.eq("sales_id", salesParam);
  }

  const rows = unlinked ? [] : (await query).data ?? [];

  return ok(rows, {
    can_write: canWrite,
    role: ctx.role,
    unlinked,
    sales: salesRows ?? [],
    filter: { date_from: dateFrom, date_to: dateTo, sales_id: salesParam ?? null },
  });
});

// POST /api/queue — create new queue entry (ADMIN)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = entrySchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  // resolve พิกัดจากลิงก์โลเคชั่น (รองรับลิงก์ย่อ goo.gl) ถ้ายังไม่มี lat/lng
  if (body.location_url && (body.lat == null || body.lng == null)) {
    const co = await resolveMapLink(body.location_url);
    if (co) { body.lat = co.lat; body.lng = co.lng; }
  }

  const { data, error } = await sb
    .from("queue_entries")
    .insert({ ...body, status: body.status ?? "PENDING", created_by: ctx.user.id })
    .select(SELECT)
    .single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(400, "สร้างคิวไม่สำเร็จ");
  return created(data);
});

// ── helpers ────────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)); // day=0 = last day of prev month
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
}

// Returns [monday, saturday] ISO strings for ISO week wk of year yr
// ร้านทำงาน จ-ส (6 วัน) ให้ตรงกับ weekDays() ใน QueueCalendarView ที่ render 6 คอลัมน์เท่านั้น
// เดิมคืน sunday (+6) → คิววันอาทิตย์ถูกนับใน count แต่ไม่ render → แก้เป็น +5 (เสาร์)
function isoWeekRange(yr: number, wk: number): [string, string] {
  // Jan 4 is always in week 1 (ISO 8601)
  const jan4 = new Date(Date.UTC(yr, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // 1=Mon…7=Sun
  const monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000 + (wk - 1) * 7 * 86400000);
  const saturday = new Date(monday.getTime() + 5 * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return [fmt(monday), fmt(saturday)];
}
