import { z } from "zod";
import { getContext, Http } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const bodySchema = z.object({
  reason: z.string().min(1, "ระบุเหตุผลพักงาน"),
});

// POST /api/jobs/:id/hold
// Guard: ADMIN || DESIGNER (designer:write) || SALES (sales_closure:write)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  // โหลด context ด้วย jobs:read (ต่ำสุด) จากนั้นตรวจ OR permission
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();

  const { role } = ctx;
  const allowed =
    role === "ADMIN" ||
    can(role, "designer", "write") ||
    can(role, "sales_closure", "write");
  if (!allowed) throw Http.forbidden();

  const body = await req.json() as unknown;
  const { reason } = bodySchema.parse(body);

  // ตรวจว่างานมีอยู่
  const { data: cur, error: selErr } = await ctx.supabase
    .from("jobs")
    .select("id, on_hold")
    .eq("id", params.id)
    .single();

  if (selErr || !cur) return notFound("ไม่พบงานนี้");

  const { data, error } = await ctx.supabase
    .from("jobs")
    .update({ on_hold: true, on_hold_reason: reason })
    .eq("id", params.id)
    .select("id, on_hold, on_hold_reason")
    .single();

  if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Update failed" });

  await audit({
    jobId: params.id,
    userId: ctx.user.id,
    action: "JOB_HELD",
    table: "jobs",
    recordId: params.id,
    newValue: { on_hold: true, on_hold_reason: reason },
  });

  return ok(data);
});
