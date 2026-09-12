import { requirePermission, Http } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";

// POST /api/jobs/[id]/hide  { hidden: boolean }
// ซ่อน/เอากลับ งานในหน้าผลิต (soft delete · กู้คืนได้) — ไม่แตะสถานะงาน/เงิน/เอกสาร
//   ใช้กับงานที่ "โผล่มาเอง"/ซ้ำ ในหน้าผลิต · กดผิดก็เอากลับได้
// สิทธิ์: production:write (ครอบ CHANG) → จำกัด ADMIN/PRODUCTION · ใช้ service client (jobs RLS update = ADMIN/SALES/DESIGNER)
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("production", "write");
  if (ctx.role !== "ADMIN" && ctx.role !== "PRODUCTION") throw Http.forbidden();

  const body = await req.json().catch(() => null);
  const hidden = !!(body && body.hidden);

  const jobId = params.id;
  const { data: job } = await ctx.supabase.from("jobs").select("id, job_code, customer_name").eq("id", jobId).maybeSingle<{ id: string; job_code: string | null; customer_name: string | null }>();
  if (!job) return notFound("ไม่พบงานนี้");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error: upErr } = await svc
    .from("jobs")
    .update({
      hidden_from_production: hidden,
      hidden_at: hidden ? new Date().toISOString() : null,
      hidden_by: hidden ? ctx.user.id : null,
    })
    .eq("id", jobId);
  if (upErr) {
    if (/hidden_from_production|hidden_at|hidden_by/i.test(upErr.message ?? "")) {
      return err("ยังไม่ได้รัน migration 0152 (ซ่อนงานจากผลิต) — รันก่อนใช้งาน", 400);
    }
    return err(upErr.message, 500);
  }

  await audit({
    jobId, userId: ctx.user.id,
    action: hidden ? "JOB_HIDDEN_FROM_PRODUCTION" : "JOB_UNHIDDEN_FROM_PRODUCTION",
    table: "jobs", recordId: jobId,
    newValue: { job_code: job.job_code, customer_name: job.customer_name, by: ctx.user.email },
  });
  return ok({ ok: true, hidden });
});
