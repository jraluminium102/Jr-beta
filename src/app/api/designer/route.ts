import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";
import type { DesignState } from "@/lib/database.types";

export const dynamic = "force-dynamic";

// Row shape returned from DB (select includes designer_ref join)
type DesignerRow = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_id: string | null;
  designer_ref: number | null;
  design_state: DesignState;
  design_due_date: string | null;
  design_start: string | null;
  design_end: string | null;
  design_revise_count: number;
  current_stage: number;
  designer_lookup: { name: string } | null; // join on designer_ref → designers(name)
};

// GET /api/designer — list งานเขียนแบบ + KPI aggregate (filter ?designer= & ?state=)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "read")) return FORBIDDEN();

  const url = new URL(req.url);
  // filter by designer_ref (numeric id from designers table)
  const designerRef = url.searchParams.get("designer");
  const state = url.searchParams.get("state");

  const supabase = createClient();

  // Fetch all non-CANCELLED jobs — we filter DONE by window in JS after fetch
  // (removing .neq("design_state","DONE") so the DONE column is no longer empty)
  let query = supabase
    .from("jobs")
    .select(
      "id, job_code, customer_name, designer_id, designer_ref, design_state, design_due_date, design_start, design_end, design_revise_count, current_stage, designer_lookup:designer_ref(name)"
    )
    .neq("status", "CANCELLED")
    .order("design_due_date", { ascending: true, nullsFirst: false });

  if (designerRef) query = query.eq("designer_ref", designerRef);
  if (state) query = query.eq("design_state", state);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as unknown as DesignerRow[];
  const today = new Date().toISOString().slice(0, 10);

  // Return all non-CANCELLED jobs — no DONE window filter.
  // Board limits DONE column client-side; Gantt uses full history.
  const visibleRows = rows;

  // ─── KPI aggregate ────────────────────────────────────────────────
  // total/overdue/avg_revise counts active (non-DONE) jobs only
  // done_count is a separate per-designer counter
  const perDesigner: Record<
    string,
    { designer_ref: number | null; name: string; count: number; overdue: number; done: number }
  > = {};
  let overdueTotal = 0;
  let reviseSum = 0;
  let activeCount = 0;

  for (const r of visibleRows) {
    const key = r.designer_ref != null ? String(r.designer_ref) : "__none__";
    if (!perDesigner[key]) {
      perDesigner[key] = {
        designer_ref: r.designer_ref,
        name: (r.designer_lookup as { name: string } | null)?.name ?? "ยังไม่มอบหมาย",
        count: 0,
        overdue: 0,
        done: 0,
      };
    }

    if (r.design_state === "DONE") {
      perDesigner[key].done += 1;
    } else {
      perDesigner[key].count += 1;
      activeCount += 1;
      reviseSum += r.design_revise_count ?? 0;

      const isOverdue = !!r.design_due_date && r.design_due_date < today;
      if (isOverdue) {
        perDesigner[key].overdue += 1;
        overdueTotal += 1;
      }
    }
  }

  const kpi = {
    total: activeCount,
    overdue: overdueTotal,
    avg_revise: activeCount ? Math.round((reviseSum / activeCount) * 10) / 10 : 0,
    per_designer: Object.values(perDesigner).sort((a, b) => b.count - a.count),
  };

  // Build card items — add overdue flag for the frontend
  const items = visibleRows.map((r) => ({
    id: r.id,
    job_code: r.job_code,
    customer_name: r.customer_name,
    designer_id: r.designer_id,
    designer_ref: r.designer_ref,
    designer_name: (r.designer_lookup as { name: string } | null)?.name ?? null,
    design_state: r.design_state,
    design_due_date: r.design_due_date,
    design_start: r.design_start,
    design_end: r.design_end,
    design_revise_count: r.design_revise_count,
    current_stage: r.current_stage,
    overdue: r.design_state !== "DONE" && !!r.design_due_date && r.design_due_date < today,
  }));

  return ok({ items, kpi, can_write: can(profile.role, "designer", "write") });
}
