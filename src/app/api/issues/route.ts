import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// GET /api/issues — list (filter status, phase)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("issues", "read");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const phase = url.searchParams.get("phase");

  let query = ctx.supabase
    .from("issues")
    .select("*, job:job_id(job_code, customer_name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (phase) query = query.eq("phase", phase);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ok(data ?? [], { can_write: can(ctx.role, "issues", "write") });
});

const createSchema = z.object({
  job_id: z.string().uuid(),
  phase: z.enum(["SALES", "MEASUREMENT", "PRODUCTION", "INSTALLATION", "POST_SALE"]),
  type: z.enum(["WRONG_DESIGN", "CUSTOMER_CHANGES", "MATERIAL_SHORTAGE", "PRODUCTION_DELAY", "INSTALLATION_DELAY", "CUSTOMER_COMPLAINT", "OTHER"]).default("OTHER"),
  detail: z.string().min(1, "กรุณาระบุรายละเอียดปัญหา"),
  owner_name: z.string().optional(),
});

// POST /api/issues — แจ้งปัญหาใหม่เอง (issue_code มาจาก trigger)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("issues", "write");
  const body = createSchema.parse(await req.json());
  const { data, error } = await ctx.supabase
    .from("issues")
    .insert({ ...body, reporter_id: ctx.user.id, is_auto_created: false, status: "OPEN" })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  await audit({ jobId: body.job_id, userId: ctx.user.id, action: "ISSUE_CREATED", table: "issues", recordId: data.id });
  return created(data);
});
