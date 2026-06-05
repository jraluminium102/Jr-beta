import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";
import type { DesignState } from "@/lib/database.types";

export const dynamic = "force-dynamic";

// แถวงานเขียนแบบที่ board ใช้ (เลือกเฉพาะ field ที่จำเป็น)
type DesignerRow = {
  id: string;
  job_code: string | null;
  customer_name: string;
  designer_id: string | null;
  design_state: DesignState;
  design_due_date: string | null;
  design_start: string | null;
  design_end: string | null;
  design_revise_count: number;
  current_stage: number;
  designer: { full_name: string | null } | null;
};

// GET /api/designer — list งานเขียนแบบ + KPI aggregate (filter ?designer= & ?state=)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "read")) return FORBIDDEN();

  const url = new URL(req.url);
  const designer = url.searchParams.get("designer");
  const state = url.searchParams.get("state");

  const supabase = createClient();
  // ดึงเฉพาะงานที่ยัง "อยู่ช่วงงานแบบ" — design_state <> DONE (งานที่ปิดแบบแล้วซ่อนจาก board)
  let query = supabase
    .from("jobs")
    .select(
      "id, job_code, customer_name, designer_id, design_state, design_due_date, design_start, design_end, design_revise_count, current_stage, designer:designer_id(full_name)"
    )
    .neq("status", "CANCELLED")
    .neq("design_state", "DONE")
    .order("design_due_date", { ascending: true, nullsFirst: false });

  if (designer) query = query.eq("designer_id", designer);
  if (state) query = query.eq("design_state", state);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const rows = (data ?? []) as unknown as DesignerRow[];
  const today = new Date().toISOString().slice(0, 10);

  // ─── KPI aggregate ────────────────────────────────────────────────
  // นับงานต่อ designer + จำนวนเลยกำหนด (due < today & state <> DONE)
  const perDesigner: Record<string, { designer_id: string | null; name: string; count: number; overdue: number }> = {};
  let overdueTotal = 0;
  // รอบแก้เฉลี่ย (เฉพาะงานที่กำลังทำอยู่)
  let reviseSum = 0;

  for (const r of rows) {
    const key = r.designer_id ?? "__none__";
    if (!perDesigner[key]) {
      perDesigner[key] = {
        designer_id: r.designer_id,
        name: r.designer?.full_name ?? "ยังไม่มอบหมาย",
        count: 0,
        overdue: 0,
      };
    }
    perDesigner[key].count += 1;
    reviseSum += r.design_revise_count ?? 0;

    const isOverdue = !!r.design_due_date && r.design_due_date < today && r.design_state !== "DONE";
    if (isOverdue) {
      perDesigner[key].overdue += 1;
      overdueTotal += 1;
    }
  }

  const kpi = {
    total: rows.length,
    overdue: overdueTotal,
    avg_revise: rows.length ? Math.round((reviseSum / rows.length) * 10) / 10 : 0,
    per_designer: Object.values(perDesigner).sort((a, b) => b.count - a.count),
  };

  // เติม flag overdue ให้แต่ละการ์ด (frontend ใช้ทำสีแดง)
  const items = rows.map((r) => ({
    id: r.id,
    job_code: r.job_code,
    customer_name: r.customer_name,
    designer_id: r.designer_id,
    designer_name: r.designer?.full_name ?? null,
    design_state: r.design_state,
    design_due_date: r.design_due_date,
    design_start: r.design_start,
    design_end: r.design_end,
    design_revise_count: r.design_revise_count,
    current_stage: r.current_stage,
    overdue: !!r.design_due_date && r.design_due_date < today && r.design_state !== "DONE",
  }));

  return ok({ items, kpi, can_write: can(profile.role, "designer", "write") });
}
