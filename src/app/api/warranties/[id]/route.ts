import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";

// GET /api/warranties/[id]  → ใบรับประกันเดี่ยว
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("warranties", "read");

  const { data, error } = await ctx.supabase
    .from("warranties")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return notFound("ไม่พบใบรับประกัน");
  return ok(data);
});
