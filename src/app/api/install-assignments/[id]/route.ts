import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { syncSchedule } from "../route";

const Schema = z.object({
  team_id: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  crew: z.string().optional(),
  day_no: z.number().int().positive().nullable().optional(),
  day_total: z.number().int().positive().nullable().optional(),
  note: z.string().optional(),
});

// PATCH /api/install-assignments/[id] → แก้ทีม/วัน/ลูกน้อง/โน้ต
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb.from("install_assignments").update(p.data).eq("id", params.id).select("*").single();
  if (error) return err(error.message, 500);
  if (!data) return notFound("ไม่พบรายการ");
  await syncSchedule(sb, data.job_id);
  await audit({ userId: ctx.user.id, action: "INSTALL_ASSIGN_EDIT", table: "install_assignments", recordId: params.id, newValue: p.data });
  return ok(data);
});

// DELETE /api/install-assignments/[id]
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data: row } = await sb.from("install_assignments").select("job_id").eq("id", params.id).single();
  const { error } = await sb.from("install_assignments").delete().eq("id", params.id);
  if (error) return err(error.message, 500);
  if (row?.job_id) await syncSchedule(sb, row.job_id);
  await audit({ userId: ctx.user.id, action: "INSTALL_ASSIGN_DEL", table: "install_assignments", recordId: params.id });
  return ok({ ok: true });
});
