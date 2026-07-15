import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

const Schema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// POST /api/crew-day/duplicate → ทำซ้ำการจัดทีมของวัน from_date ไปเป็นวัน to_date
// (ของจริงใช้บ่อยมาก — วันถัดไปทีมเดิม/สถานที่คล้ายเดิม ค่อยปรับ) · ต่อท้ายทีมเดิมของ to_date ถ้ามีอยู่แล้ว ไม่ทับ
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  if (p.data.from_date === p.data.to_date) return err("วันต้นทางกับปลายทางต้องไม่ใช่วันเดียวกัน", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const { data: srcTeams, error: srcErr } = await sb
    .from("crew_day_teams").select("*, crew_team_sites(*)")
    .eq("work_date", p.data.from_date).order("sort_order", { ascending: true });
  if (srcErr) return err(srcErr.message, 500);
  if (!srcTeams || srcTeams.length === 0) return err("วันต้นทางยังไม่มีการจัดทีม", 400);

  const { data: maxRow } = await sb
    .from("crew_day_teams").select("sort_order")
    .eq("work_date", p.data.to_date).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  let nextSort = (maxRow?.sort_order ?? 0) + 1;

  const created: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of srcTeams as any[]) {
    const { data: newTeam, error: teamErr } = await sb
      .from("crew_day_teams")
      .insert({
        work_date: p.data.to_date, sort_order: nextSort++,
        start_time: t.start_time, leader_id: t.leader_id, member_ids: t.member_ids,
        note: t.note, created_by: ctx.user.id,
      })
      .select("*").single();
    if (teamErr) return err(teamErr.message, 500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sites = (t.crew_team_sites ?? []) as any[];
    if (sites.length > 0) {
      const siteRows = sites.map((s) => ({
        team_id: newTeam.id, site_no: s.site_no, job_id: s.job_id,
        customer_name: s.customer_name, appointment_time: s.appointment_time,
        address: s.address, phone: s.phone,
      }));
      const { error: siteErr } = await sb.from("crew_team_sites").insert(siteRows);
      if (siteErr) return err(siteErr.message, 500);
    }
    created.push(newTeam);
  }

  await audit({ userId: ctx.user.id, action: "CREW_DAY_DUPLICATE", table: "crew_day_teams", newValue: { from: p.data.from_date, to: p.data.to_date, count: created.length } });
  return ok({ created: created.length });
});
