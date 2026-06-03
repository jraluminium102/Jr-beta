import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

type Params = { params: { id: string } };
const schema = z.object({
  role: z.enum(["ADMIN","SALES","DESIGNER","PRODUCTION","INSTALLER","ACCOUNTING","VIEWER"]).optional(),
  is_active: z.boolean().optional(),
});

// PATCH /api/users/:id — admin: เปลี่ยน role / เปิด-ปิดผู้ใช้
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("users", "write");
  const body = schema.parse(await req.json());

  const { data, error } = await ctx.supabase
    .from("profiles").update(body).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");

  await audit({
    userId: ctx.user.id, action: "USER_UPDATED",
    table: "profiles", recordId: params.id, newValue: body,
  });
  return ok(data);
});
