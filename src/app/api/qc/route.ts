import { z } from "zod";
import { getContext, Http, requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// GET /api/qc?job_id=... — ผล QC ของงาน
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "read");
  const jobId = new URL(req.url).searchParams.get("job_id");
  const sb = ctx.supabase as unknown as Sb;
  let query = sb.from("qc_checks").select("*, checker:checked_by(full_name)").order("checked_at", { ascending: false });
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) throw dbError(error);
  const canWrite = can(ctx.role, "production", "write") || can(ctx.role, "installation", "write");
  return ok(data ?? [], { can_write: canWrite });
});

const schema = z.object({
  job_id: z.string().uuid(),
  stage: z.enum(["FACTORY", "INSTALL", "CUSTOMER"]),
  result: z.enum(["PASSED", "FAILED"]),
  defects: z.string().optional(),
  photo_url: z.string().optional(),
  checklist: z.record(z.boolean()).optional(),   // เช็คลิสต์เทคนิค { "หัวข้อ": true/false }
});

// POST /api/qc — บันทึกผลตรวจ (ผลิต/ติดตั้ง/ลูกค้าตรวจ)
export const POST = withRoute(async (req: Request) => {
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();
  if (!(can(ctx.role, "production", "write") || can(ctx.role, "installation", "write"))) throw Http.forbidden();
  const body = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("qc_checks")
    .insert({ ...body, checked_by: ctx.user.id }).select("*, checker:checked_by(full_name)").single();
  if (error) throw dbError(error);
  return created(data);
});
