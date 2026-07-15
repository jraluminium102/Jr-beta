import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/crew-day/counts?from=YYYY-MM-DD&to=YYYY-MM-DD
// จำนวนทีมต่อวัน ในช่วงที่ระบุ — ใช้ทำ badge บนปฏิทินรายเดือน + ลิสต์หน้าประวัติ
// ไม่ระบุ from/to → ย้อนหลัง 180 วัน ถึง ล่วงหน้า 60 วัน (ดีฟอลต์หน้าประวัติ)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "read");
  const url = new URL(req.url);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const defFrom = new Date(today); defFrom.setDate(defFrom.getDate() - 180);
  const defTo = new Date(today); defTo.setDate(defTo.getDate() + 60);
  const from = url.searchParams.get("from") || iso(defFrom);
  const to = url.searchParams.get("to") || iso(defTo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return err("รูปแบบวันที่ไม่ถูกต้อง", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb
    .from("crew_day_teams")
    .select("work_date")
    .gte("work_date", from)
    .lte("work_date", to);
  if (error) return err(error.message, 500);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { work_date: string }[]) {
    counts.set(row.work_date, (counts.get(row.work_date) ?? 0) + 1);
  }
  const result = [...counts.entries()]
    .map(([work_date, team_count]) => ({ work_date, team_count }))
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1)); // ล่าสุดก่อน
  return ok(result);
});
