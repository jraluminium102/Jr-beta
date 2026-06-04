import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";

const StockInsertSchema = z.object({
  name:        z.string().min(1, "ต้องระบุชื่อวัสดุ"),
  sku:         z.string().optional().default(""),
  category:    z.string().optional().default(""),
  unit:        z.string().optional().default(""),
  min_qty:     z.number().nonnegative().optional().default(0),
  qty_on_hand: z.number().nonnegative().optional().default(0),
  note:        z.string().optional().default(""),
});

// GET /api/stock?q=คำค้น  → รายการวัสดุ (is_active=true)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "read");

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  let query = ctx.supabase
    .from("stock_items")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,category.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/stock  → เพิ่มวัสดุ
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "write");

  const body = await req.json().catch(() => null);
  const parsed = StockInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { name, sku, category, unit, min_qty, qty_on_hand: opening, note } = parsed.data;

  // เริ่มที่ qty_on_hand=0 เสมอ — ถ้ามียอดยกมา ปล่อยให้ trigger บวกผ่าน stock_moves (มี log)
  const { data: item, error } = await ctx.supabase
    .from("stock_items")
    .insert({ sku, name: name.trim(), category, unit, min_qty, qty_on_hand: 0, note })
    .select("*")
    .single();

  if (error) return err(error.message, 500);
  if (!item) return notFound("บันทึกไม่สำเร็จ");

  // ยอดยกมา > 0 → บันทึกเป็น movement type 'in' (trigger ปรับ qty_on_hand ให้)
  if (opening > 0) {
    const { error: moveErr } = await ctx.supabase.from("stock_moves").insert({
      stock_item_id: item.id,
      type: "in",
      qty: opening,
      ref: "ยอดยกมา",
      note: "",
      created_by: ctx.user.id,
    });
    if (moveErr) return err(moveErr.message, 500);
    item.qty_on_hand = opening;
  }

  return ok(item, undefined, 201);
});
