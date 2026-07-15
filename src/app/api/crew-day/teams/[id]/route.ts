import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

const Schema = z.object({
  start_time: z.string().optional(),
  leader_id: z.string().uuid().nullable().optional(),
  member_ids: z.array(z.string().uuid()).optional(),
  note: z.string().optional(),
  sort_order: z.number().int().optional(),
});

// PATCH /api/crew-day/teams/[id] → แก้เวลาเริ่ม/หัวหน้า/สมาชิก/หมายเหตุ/ลำดับ
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb
    .from("crew_day_teams").update({ ...p.data, updated_at: new Date().toISOString() }).eq("id", params.id)
    .select("*, leader:crew_people(id,name), crew_team_sites(*)").single();
  if (error) return err(error.message, 500);
  if (!data) return notFound("ไม่พบทีมนี้");
  return ok(data);
});

// DELETE /api/crew-day/teams/[id] → ลบทีม (สถานที่ในทีมถูกลบตามด้วย cascade)
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { error } = await sb.from("crew_day_teams").delete().eq("id", params.id);
  if (error) return err(error.message, 500);
  return ok({ ok: true });
});
