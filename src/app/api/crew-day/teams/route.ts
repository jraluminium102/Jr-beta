import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

const Schema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD"),
  sort_order: z.number().int().optional(),
  start_time: z.string().optional().default(""),
  leader_id: z.string().uuid().nullable().optional(),
  member_ids: z.array(z.string().uuid()).optional().default([]),
  note: z.string().optional().default(""),
});

// POST /api/crew-day/teams → เพิ่มทีมใหม่ในวันที่ระบุ (sort_order ต่อท้ายอัตโนมัติถ้าไม่ส่งมา)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  let sortOrder = p.data.sort_order;
  if (sortOrder == null) {
    const { data: maxRow } = await sb
      .from("crew_day_teams").select("sort_order")
      .eq("work_date", p.data.work_date).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    sortOrder = (maxRow?.sort_order ?? 0) + 1;
  }

  const { data, error } = await sb
    .from("crew_day_teams")
    .insert({ ...p.data, sort_order: sortOrder, created_by: ctx.user.id })
    .select("*, leader:crew_people(id,name), crew_team_sites(*)")
    .single();
  if (error) return err(error.message, 500);
  return ok(data);
});
