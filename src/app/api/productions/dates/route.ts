import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

const schema = z.object({
  job_id:               z.string().uuid(),
  measure_scheduled:    z.string().date().nullish(),
  production_due_date:  z.string().date().nullish(),
  planned_install_date: z.string().date().nullish(),
});

// PATCH /api/productions/dates
// Set measure/production-due/planned-install dates via RPC set_production_dates.
// DB-level guard: ADMIN only (42501). BFF guard: production write.
export const PATCH = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const body = schema.parse(await req.json());

  const { job_id, measure_scheduled, production_due_date, planned_install_date } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (ctx.supabase as any).rpc("set_production_dates", {
    p_job:                 job_id,
    p_measure_scheduled:   measure_scheduled   ?? null,
    p_production_due_date: production_due_date ?? null,
    p_planned_install_date: planned_install_date ?? null,
  });

  if (error) {
    // 42501 = permission denied from DB security definer guard
    if (error.code === "42501" || error.message?.includes("FORBIDDEN")) {
      return err("ไม่มีสิทธิ์ตั้งวันกำหนด (ต้องเป็น ADMIN)", 403);
    }
    throw new Error(error.message ?? "set_production_dates failed");
  }

  await audit({
    jobId: job_id,
    userId: ctx.user.id,
    action: "SET_PRODUCTION_DATES",
    table: "productions",
    newValue: { measure_scheduled, production_due_date, planned_install_date },
  });

  return ok({ job_id, measure_scheduled, production_due_date, planned_install_date });
});
