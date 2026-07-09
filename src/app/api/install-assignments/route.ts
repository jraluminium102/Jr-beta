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
  job_id: z.string().uuid(),
  team_id: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD"),
  crew: z.string().optional().default(""),
  day_no: z.number().int().positive().nullable().optional(),
  day_total: z.number().int().positive().nullable().optional(),
  note: z.string().optional().default(""),
});

// POST /api/install-assignments → เพิ่มการเข้าติดตั้ง 1 วัน
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb.from("install_assignments").insert({
    job_id: p.data.job_id, team_id: p.data.team_id ?? null, date: p.data.date,
    crew: p.data.crew ?? "", day_no: p.data.day_no ?? null, day_total: p.data.day_total ?? null,
    note: p.data.note ?? "", created_by: ctx.user.id,
  }).select("*").single();
  if (error) return err(error.message, 500);
  await syncSchedule(sb, p.data.job_id);
  await audit({ userId: ctx.user.id, action: "INSTALL_ASSIGN_ADD", table: "install_assignments", recordId: data.id, newValue: data });
  return ok(data);
});
