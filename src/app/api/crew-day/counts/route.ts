import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/crew-day/counts?from=YYYY-MM-DD&to=YYYY-MM-DD
// จำนวนทีม + "ชื่อลูกค้าที่จัดไว้" ต่อวัน — ใช้ทำ badge/รายชื่อบนปฏิทินรายเดือน + ลิสต์หน้าประวัติ
// ไม่ระบุ from/to → ย้อนหลัง 180 วัน ถึง ล่วงหน้า 60 วัน (ดีฟอลต์หน้าประวัติ)
//
// ทำไมต้องมี customers: ปฏิทินเดือนโชว์แต่ install_assignments (แผน) — ลูกค้าที่ "เพิ่มในจัดทีมรายวัน"
// จึงไม่โผล่บนปฏิทินเลย เห็นแค่ตัวเลขทีม (เจ้าของแจ้ง 16 ก.ค.2569: ใส่ "คุณน้ำหวาน" แล้วไม่ขึ้นในตาราง)
// ยังคงหลักการเดิม: ปฏิทิน→รายวัน ทิศเดียว · ตรงนี้แค่ "อ่าน" มาโชว์ ไม่ได้ sync ข้อมูลกลับ
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
    .select("work_date, sort_order, crew_team_sites(site_no, customer_name)")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("sort_order");
  // 0097 ยังไม่รัน → คืน "ว่าง" แทน 500 — endpoint นี้เลี้ยง badge บนปฏิทินหน้าใช้ทุกวัน
  // (500 ทำให้ react-query retry ฟรี 3 รอบทุกครั้งที่เปิด/เปลี่ยนเดือน · badge ไม่ขึ้นอยู่ดี)
  if (error && /crew_day_teams|does not exist|42P01/i.test(error.message ?? "")) return ok([]);
  if (error) return err(error.message, 500);

  type Row = { work_date: string; sort_order: number; crew_team_sites: { site_no: number; customer_name: string }[] | null };
  const counts = new Map<string, number>();
  const custs = new Map<string, string[]>();
  for (const row of (data ?? []) as Row[]) {
    counts.set(row.work_date, (counts.get(row.work_date) ?? 0) + 1);
    const list = custs.get(row.work_date) ?? [];
    for (const s of (row.crew_team_sites ?? []).slice().sort((a, b) => a.site_no - b.site_no)) {
      const name = String(s.customer_name ?? "").trim();
      // กันชื่อซ้ำ (2 ทีมไปบ้านเดียวกัน) — ปฏิทินมีที่น้อย โชว์ชื่อเดียวพอ
      if (name && !list.includes(name)) list.push(name);
    }
    custs.set(row.work_date, list);
  }
  const result = [...counts.entries()]
    .map(([work_date, team_count]) => ({ work_date, team_count, customers: custs.get(work_date) ?? [] }))
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1)); // ล่าสุดก่อน
  return ok(result);
});
