import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/crew-day?date=YYYY-MM-DD → ทีมทั้งหมดของวันนั้น (พร้อมสถานที่ + ชื่อหัวหน้า) เรียงตาม sort_order
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "read");
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("ต้องระบุ date=YYYY-MM-DD", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const { data, error } = await sb
    .from("crew_day_teams")
    .select("*, leader:crew_people(id,name), crew_team_sites(*)")
    .eq("work_date", date)
    .order("sort_order", { ascending: true });
  // ตารางยังไม่มี (0097 ยังไม่รัน) → บอกชัดว่าต้องรัน migration — ไม่งั้นแท็บดูเหมือน "วันว่าง" เฉยๆ คนงงว่าฟีเจอร์พัง
  if (error && /crew_day_teams|crew_people|does not exist|42P01/i.test(error.message ?? "")) {
    return err("ยังไม่ได้รัน migration 0097 (จัดทีมช่างรายวัน) — รัน supabase/migrations/0097_crew_day_teams.sql ก่อนใช้งาน", 400);
  }
  if (error) return err(error.message, 500);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = (data ?? []).map((t: any) => ({
    ...t,
    crew_team_sites: (t.crew_team_sites ?? []).sort((a: { site_no: number }, b: { site_no: number }) => a.site_no - b.site_no),
  }));
  return ok(teams);
});
