import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { STAGE_NAMES } from "@/lib/stages";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Stages that represent the quoting/negotiation window (5=ทำใบเสนอราคา, 6=เจรจาราคา, 7=ส่งใบเสนอให้ลูกค้า)
const CLOSURE_STAGES = [5, 6, 7] as const;

// Shape of each row returned to the client
export type ClosureRow = {
  id: string;
  job_code: string | null;
  customer_name: string;
  current_stage: number;
  stage_name: string;
  status: string;
  design_state: string;
  /** Latest quotation linked to this job */
  quotation_id: number | null;
  quotation_code: string | null;
  net: number | null;
  /** Allowed to send back to designer revision */
  can_revise: boolean;
};

// GET /api/sales-closure — jobs รอปิดการขาย (stage 5/6/7) พร้อม quotation ล่าสุด
export const GET = withRoute(async () => {
  const ctx = await requirePermission("sales_closure", "read");
  const sb = ctx.supabase as { from: (t: string) => any };

  // Fetch jobs at closure stages with their latest linked quotation
  const { data: jobs, error } = await sb
    .from("jobs")
    .select(
      [
        "id",
        "job_code",
        "customer_name",
        "current_stage",
        "status",
        "design_state",
        // PostgREST: embed ผ่าน FK quotations.job_id ให้ชัด (ไม่งั้นใบเสนอ job_id=null resolve ไม่เจอ ขึ้น '—')
        "quotations!quotations_job_id_fkey(id, code, net, created_at)",
      ].join(",")
    )
    .in("current_stage", CLOSURE_STAGES)
    .neq("status", "CANCELLED")
    .order("year", { ascending: false })
    .order("sequence", { ascending: false });

  if (error) throw new Error(error.message);

  // Determine whether the caller has write permission (for showing action buttons)
  const canWrite = can(ctx.role, "sales_closure", "write");

  const rows: ClosureRow[] = (jobs ?? []).map((j: Record<string, unknown>) => {
    // PostgREST returns embedded rows as array; pick the latest by created_at
    const quotes = Array.isArray(j.quotations)
      ? (j.quotations as { id: number; code: string; net: number | null; created_at: string }[])
      : j.quotations
      ? [j.quotations as { id: number; code: string; net: number | null; created_at: string }]
      : [];

    const latestQ = quotes.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;

    const stage = Number(j.current_stage);

    return {
      id: j.id as string,
      job_code: j.job_code as string | null,
      customer_name: j.customer_name as string,
      current_stage: stage,
      stage_name: STAGE_NAMES[stage] ?? `ขั้น ${stage}`,
      status: j.status as string,
      design_state: j.design_state as string,
      quotation_id: latestQ?.id ?? null,
      quotation_code: latestQ?.code ?? null,
      net: latestQ?.net ?? null,
      can_revise: canWrite,
    };
  });

  return ok(rows, { can_write: canWrite });
});

