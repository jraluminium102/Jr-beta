import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { detectTeam } from "@/lib/queue";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const schema = z.object({
  sales_id: z.string().uuid().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  address: z.string().nullish(),
});

// POST /api/queue/suggest — เสนอ วัน-เวลา-เซลล์ ที่ว่างเร็วที่สุดตามกฎจัดคิว
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const { data: salesAll, error: e1 } = await sb.from("queue_sales").select("*").eq("active", true);
  if (e1) throw dbError(e1);
  let sales = (salesAll ?? []) as any[];
  if (!sales.length) throw new HttpError(422, "ยังไม่มีเซลล์ในระบบ");

  // เลือกผู้สมัคร: ระบุเซลล์มา = คนนั้น · ไม่ระบุ = ตามโซนของที่อยู่
  if (body.sales_id) sales = sales.filter((s) => s.id === body.sales_id);
  else { const team = detectTeam(body.address); sales = sales.filter((s) => s.team === team); }
  if (!sales.length) throw new HttpError(422, "ไม่มีเซลล์ที่ตรงเงื่อนไข/โซน");

  const today = iso(new Date());
  const { data: entriesRaw } = await sb.from("queue_entries")
    .select("sales_id,queue_date,queue_time,status").not("queue_date", "is", null).neq("status", "CANCELLED").gte("queue_date", today);
  const entries = (entriesRaw ?? []) as { sales_id: string | null; queue_date: string; queue_time: string | null }[];
  const { data: availRaw } = await sb.from("sales_availability").select("sales_id,date,kind,half").gte("date", today);
  const avail = (availRaw ?? []) as { sales_id: string; date: string; kind: string; half: string | null }[];

  // จำนวนคิวล่วงหน้าต่อเซลล์ (ใช้กระจายงานสมดุล)
  const load: Record<string, number> = {};
  entries.forEach((e) => { if (e.sales_id) load[e.sales_id] = (load[e.sales_id] ?? 0) + 1; });

  const base = new Date(); base.setUTCHours(0, 0, 0, 0);
  for (let d = 1; d <= 70; d++) {
    const day = new Date(base.getTime() + d * 86400000);
    const dow = day.getUTCDay();
    if (dow === 0) continue;                 // อาทิตย์หยุด
    const dateStr = iso(day);

    // เรียงเซลล์: โหลดน้อยก่อน (กระจายสมดุล)
    const ordered = [...sales].sort((a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0));
    for (const s of ordered) {
      const av = avail.filter((a) => a.sales_id === s.id && a.date === dateStr);
      if (av.some((a) => a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY")) continue;  // ลา/หยุดทั้งวัน
      let slots = ["10:00", "14:00"];
      if (av.some((a) => a.kind === "OFFICE_HALF")) slots = ["14:00"];                 // เช้าอยู่ออฟฟิศ
      const halfLeave = av.find((a) => a.kind === "LEAVE_HALF");
      if (halfLeave) slots = halfLeave.half === "PM" ? ["10:00"] : ["14:00"];

      const used = entries.filter((e) => e.sales_id === s.id && e.queue_date === dateStr).map((e) => e.queue_time);
      if (body.job_size === "FULLDAY") {
        if (used.length === 0 && slots.length === 2) {
          return ok({ queue_date: dateStr, queue_time: "10:00", sales_id: s.id, sales_name: s.name,
            reason: `งานเต็มวัน → ${s.name} ว่างทั้งวัน ${DOW_TH[dow]} ${dateStr}` });
        }
        continue;
      }
      const free = slots.find((t) => !used.includes(t));
      if (free) {
        return ok({ queue_date: dateStr, queue_time: free, sales_id: s.id, sales_name: s.name,
          reason: `${s.name} ว่างเร็วสุด ${DOW_TH[dow]} ${dateStr} ${free === "10:00" ? "(เช้า)" : "(บ่าย)"}` });
      }
    }
  }
  throw new HttpError(422, "ไม่พบช่องว่างใน 70 วันข้างหน้า — ตรวจวันลา/โควตา");
});
