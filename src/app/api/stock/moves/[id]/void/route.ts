import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { recomputeStockItem } from "@/lib/stock/recompute";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];

// POST /api/stock/moves/[id]/void → ยกเลิกรายการเคลื่อนไหว (soft void) + recompute ยอด/ต้นทุนใหม่ (ไม่ลบข้อมูล เก็บประวัติ)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const reason = (body?.reason ?? "").toString().trim();
  if (!reason) return fail("ต้องระบุเหตุผลการยกเลิก");

  const sb = createClient();
  const { data: mv, error: e0 } = await sb
    .from("stock_moves").select("id, stock_item_id, is_voided").eq("id", params.id).single();
  if (e0 || !mv) return fail("ไม่พบรายการ", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((mv as any).is_voided) return fail("รายการนี้ถูกยกเลิกไปแล้ว", 409);

  const { error } = await sb.from("stock_moves").update({
    is_voided: true, voided_at: new Date().toISOString(), voided_by: profile.id, void_reason: reason,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).eq("id", params.id);
  if (error && /is_voided/i.test(error.message ?? "")) return fail("ยังไม่ได้รัน migration 0087 — รันก่อนใช้งาน", 400);
  if (error) return fail(error.message, 500);
  await recomputeStockItem(sb, (mv as { stock_item_id: number }).stock_item_id);
  return ok({ ok: true });
}
