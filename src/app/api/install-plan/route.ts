import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/install-plan?from=YYYY-MM-DD&to=YYYY-MM-DD
// คืน { teams, assignments(ในช่วง+ข้อมูลงาน), ready(งานผลิตเสร็จ รอจัดคิว) }
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "read");
  const u = new URL(req.url);
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  if (!from || !to) return err("ต้องระบุ from/to", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const [teamsR, asgR, readyR] = await Promise.all([
    sb.from("install_teams").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    sb.from("install_assignments").select("*, jobs(*)").gte("date", from).lte("date", to).order("date", { ascending: true }),
    sb.from("installations").select("id, job_id, status, install_scheduled, jobs(*)").eq("status", "PENDING"),
  ]);

  return ok({
    teams: teamsR.data ?? [],
    assignments: asgR.data ?? [],
    ready: readyR.data ?? [],
  });
});
