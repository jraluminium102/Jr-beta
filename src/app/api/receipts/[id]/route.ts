import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";

// GET /api/receipts/[id]  → ใบเสร็จเดี่ยว
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("receipts", "read");

  const { data, error } = await ctx.supabase
    .from("receipts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return notFound("ไม่พบใบเสร็จ");
  return ok(data);
});
