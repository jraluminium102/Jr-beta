import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";
import type { DesignState } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type TimelineJob = {
  id: string;
  job_code: string | null;
  customer_name: string;
  design_start: string | null;
  design_end: string | null;
  design_due_date: string | null;
  design_state: DesignState;
  designer_lookup: { name: string } | null; // join on designer_ref → designers(name)
};

// GET /api/designer/timeline — ข้อมูล Gantt (เฉพาะงานที่มี design_start)
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "read")) return FORBIDDEN();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, job_code, customer_name, design_start, design_end, design_due_date, design_state, designer_lookup:designer_ref(name)"
    )
    .neq("status", "CANCELLED")
    .not("design_start", "is", null)
    .order("design_start", { ascending: true });
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as unknown as TimelineJob[];
  const items = rows.map((r) => ({
    id: r.id,
    job_code: r.job_code,
    customer_name: r.customer_name,
    designer_name: r.designer_lookup?.name ?? "ยังไม่มอบหมาย",
    design_start: r.design_start,
    design_end: r.design_end,
    design_due_date: r.design_due_date,
    design_state: r.design_state,
  }));

  return ok({ items });
}
