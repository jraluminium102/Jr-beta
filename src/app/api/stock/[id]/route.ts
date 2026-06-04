import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";

const StockPatchSchema = z.object({
  sku:       z.string().optional(),
  name:      z.string().min(1).optional(),
  category:  z.string().optional(),
  unit:      z.string().optional(),
  min_qty:   z.number().nonnegative().optional(),
  note:      z.string().optional(),
  is_active: z.boolean().optional(),
}).strict();

// GET /api/stock/[id]  → วัสดุ + ประวัติความเคลื่อนไหวล่าสุด
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("stock", "read");

  const { data: item, error } = await ctx.supabase
    .from("stock_items")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return notFound("ไม่พบวัสดุ");

  const { data: moves } = await ctx.supabase
    .from("stock_moves")
    .select("*")
    .eq("stock_item_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return ok({ ...item, stock_moves: moves ?? [] });
});

// PATCH /api/stock/[id]  → แก้ข้อมูลวัสดุ
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("stock", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = StockPatchSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return err("ไม่มีข้อมูลให้แก้ไข");

  const { data, error } = await ctx.supabase
    .from("stock_items")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return err(error.message, 500);
  return ok(data);
});
