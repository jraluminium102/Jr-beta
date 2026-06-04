import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";

// GET /api/production-orders/[id]  → ใบสั่งผลิตเดี่ยว
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("production_orders", "read");

  const { data, error } = await ctx.supabase
    .from("production_orders")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return notFound("ไม่พบใบสั่งผลิต");
  return ok(data);
});
