import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

// GET /api/quotations/[id]  → ใบเสนอ + รายการ
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("quotations", "read");

  const { data, error } = await ctx.supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "quotation_items", ascending: true })
    .single();
  if (error) return notFound("ไม่พบใบเสนอราคา");
  return ok(data);
});
