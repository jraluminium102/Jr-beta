import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

type Params = { params: { id: string } };

const SELECT = "*, job:job_id(job_code, customer_name), owner:owner_id(full_name)";

// GET /api/issues/:id — รายละเอียด issue เดียว (สำหรับหน้า track detail)
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("issues", "read");
  const { data, error } = await ctx.supabase
    .from("issues").select(SELECT).eq("id", params.id).single();
  if (error || !data) throw dbError(error ?? { code: "PGRST116", message: "ไม่พบ issue" });

  const { data: owners } = await ctx.supabase
    .from("profiles").select("id, full_name").eq("is_active", true).order("full_name");

  return ok(data, { can_write: can(ctx.role, "issues", "write"), owners: owners ?? [] });
});

const schema = z.object({
  status:     z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(),
  type:       z.enum(["WRONG_DESIGN","CUSTOMER_CHANGES","MATERIAL_SHORTAGE","PRODUCTION_DELAY","INSTALLATION_DELAY","CUSTOMER_COMPLAINT","OTHER"]).optional(),
  severity:   z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  owner_id:   z.string().uuid().nullish(),
  due_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").nullish(), // YYYY-MM-DD
  priority:   z.number().int().min(0).max(3).optional(),
  resolution: z.string().nullish(),
});

// PATCH /api/issues/:id — ปิด issue ได้เมื่อมี resolution (REQ-05)
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("issues", "write");
  const body = schema.parse(await req.json());

  if (body.status === "CLOSED" && !body.resolution) {
    return err("ต้องระบุวิธีแก้ก่อนปิด issue", 422);
  }

  const patch: Record<string, unknown> = { ...body };
  if (body.status === "CLOSED") patch.resolved_at = new Date().toISOString();

  const { data, error } = await ctx.supabase
    .from("issues").update(patch).eq("id", params.id).select(SELECT).single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");
  return ok(data);
});
