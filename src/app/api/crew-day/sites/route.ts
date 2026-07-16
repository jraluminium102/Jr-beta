import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

const Schema = z.object({
  team_id: z.string().uuid(),
  site_no: z.number().int().min(1).max(4),
  job_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().optional().default(""),
  appointment_time: z.string().optional().default(""),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  off_board: z.boolean().optional(),   // ธงจุดงานนอกบอร์ดพร้อมติดตั้ง (import SetTeam/งานพิเศษ) — 0100
});

// POST /api/crew-day/sites → เพิ่มสถานที่ (จุดที่ 1-4) ให้ทีม
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb.from("crew_team_sites").insert(p.data).select("*").single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message ?? "")) return err("ทีมนี้มีจุดที่ " + p.data.site_no + " อยู่แล้ว", 409);
    return err(error.message, 500);
  }
  return ok(data);
});
