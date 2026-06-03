import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

type Params = { params: { id: string } };

const schema = z.object({
  status:     z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(),
  type:       z.enum(["WRONG_DESIGN","CUSTOMER_CHANGES","MATERIAL_SHORTAGE","PRODUCTION_DELAY","INSTALLATION_DELAY","CUSTOMER_COMPLAINT","OTHER"]).optional(),
  owner_id:   z.string().uuid().nullish(),
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
    .from("issues").update(patch).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");
  return ok(data);
});
