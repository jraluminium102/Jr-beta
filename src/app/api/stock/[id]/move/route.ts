import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { StockMoveType } from "@/lib/types";

const TYPES: StockMoveType[] = ["in", "out", "adjust"];

// POST /api/stock/[id]/move  → บันทึกความเคลื่อนไหว
// หมายเหตุ: trigger ฝั่ง DB จะปรับ qty_on_hand ให้เอง — ที่นี่ insert move เท่านั้น
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const type = body?.type as StockMoveType;
  if (!TYPES.includes(type)) return fail("ประเภทไม่ถูกต้อง (in/out/adjust)");
  const qty = Number(body?.qty);
  if (!Number.isFinite(qty) || qty === 0) return fail("ต้องระบุจำนวน");

  const supabase = createClient();
  const { error } = await supabase.from("stock_moves").insert({
    stock_item_id: Number(params.id),
    type,
    qty,
    ref: body.ref ?? "",
    note: body.note ?? "",
    created_by: profile.id,
  });
  if (error) return fail(error.message, 500);
  return ok({ ok: true }, 201);
}
