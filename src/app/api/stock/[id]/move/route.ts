import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { z } from "zod";

const MoveSchema = z.object({
  type: z.enum(["in", "out", "adjust"]),
  qty:  z.number().refine((n) => Number.isFinite(n) && n !== 0, { message: "ต้องระบุจำนวน" }),
  ref:  z.string().optional().default(""),
  note: z.string().optional().default(""),
});

// POST /api/stock/[id]/move  → บันทึกความเคลื่อนไหว
// หมายเหตุ: trigger ฝั่ง DB จะปรับ qty_on_hand ให้เอง — ที่นี่ insert move เท่านั้น
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("stock", "write");

  const body = await req.json().catch(() => null);
  const parsed = MoveSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { type, qty, ref, note } = parsed.data;

  const { error } = await ctx.supabase.from("stock_moves").insert({
    stock_item_id: Number(params.id),
    type,
    qty,
    ref,
    note,
    created_by: ctx.user.id,
  });
  if (error) return err(error.message, 500);
  return ok({ ok: true }, undefined, 201);
});
