import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncSchedule(sb: any, jobId: string) {
  const { data } = await sb.from("install_assignments").select("date").eq("job_id", jobId).order("date", { ascending: true }).limit(1);
  const first = data?.[0]?.date ?? null;
  await sb.from("installations").update({ install_scheduled: first }).eq("job_id", jobId);
}

const Schema = z.object({
  // งานในระบบ = job_id · คิวนอกระบบ (งานพิเศษ) = custom_title (ไม่มี job) — ต้องมีอย่างใดอย่างหนึ่ง (0100)
  job_id: z.string().uuid().nullable().optional(),
  custom_title: z.string().trim().max(120).optional(),
  team_id: z.string().uuid().nullable().optional(),   // เลิกใช้ (0089) — รับไว้เพื่อ backward compat
  lead_name: z.string().optional().default(""),       // หัวหน้าช่าง (พิมพ์อิสระ)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD"),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // ลงช่วงวันทีเดียว (งานหลายวัน) — สร้างวันละแถว day_no/day_total อัตโนมัติ
  crew: z.string().optional().default(""),
  day_no: z.number().int().positive().nullable().optional(),
  day_total: z.number().int().positive().nullable().optional(),
  note: z.string().optional().default(""),
}).refine((d) => d.job_id || (d.custom_title && d.custom_title.length > 0), {
  message: "ต้องระบุงานในระบบ หรือชื่องานพิเศษ (คิวนอกระบบ)",
});

// POST /api/install-assignments → เพิ่มการเข้าติดตั้ง (วันเดียว หรือช่วงวันด้วย date_to)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  // ช่วงวัน: date..date_to (สูงสุด 14 วัน กันพลาด) — day_no/day_total ใส่ให้อัตโนมัติ
  const dates: string[] = [];
  if (p.data.date_to && p.data.date_to > p.data.date) {
    const d = new Date(p.data.date + "T00:00:00");
    const end = new Date(p.data.date_to + "T00:00:00");
    while (d <= end && dates.length < 14) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      d.setDate(d.getDate() + 1);
    }
  } else {
    dates.push(p.data.date);
  }

  const rows = dates.map((dt, i) => ({
    job_id: p.data.job_id ?? null, custom_title: p.data.custom_title || null,
    team_id: p.data.team_id ?? null, lead_name: p.data.lead_name ?? "",
    date: dt, crew: p.data.crew ?? "",
    day_no: dates.length > 1 ? i + 1 : (p.data.day_no ?? null),
    day_total: dates.length > 1 ? dates.length : (p.data.day_total ?? null),
    note: p.data.note ?? "", created_by: ctx.user.id,
  }));
  const { data, error } = await sb.from("install_assignments").insert(rows).select("*");
  if (error && /lead_name/i.test(error.message ?? "")) return err("ยังไม่ได้รัน migration 0089 — รันก่อนใช้งาน", 400);
  if (error && /custom_title|job_id.*null|ia_job_or_title/i.test(error.message ?? "")) return err("ยังไม่ได้รัน migration 0100 (คิวนอกระบบ) — รันก่อนใช้งาน", 400);
  if (error) return err(error.message, 500);
  if (p.data.job_id) await syncSchedule(sb, p.data.job_id);   // คิวนอกระบบไม่มี job → ไม่ต้อง sync
  await audit({ userId: ctx.user.id, action: "INSTALL_ASSIGN_ADD", table: "install_assignments", recordId: data?.[0]?.id, newValue: { rows: data?.length, ...rows[0] } });
  return ok(data?.length === 1 ? data[0] : data);
});
