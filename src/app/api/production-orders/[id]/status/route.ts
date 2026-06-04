import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { z } from "zod";

const StatusSchema = z.object({
  status: z.enum(["queued", "measuring", "manufacturing", "qc", "ready", "installed", "done", "cancelled"]),
});

// PATCH /api/production-orders/[id]/status  { status }
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("production_orders", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) return err("สถานะไม่ถูกต้อง", 422, parsed.error.flatten());

  const { data, error } = await ctx.supabase
    .from("production_orders")
    .update({ status: parsed.data.status })
    .eq("id", params.id)
    .select("id, status")
    .single();
  if (error) return err(error.message, 500);
  return ok(data);
});
