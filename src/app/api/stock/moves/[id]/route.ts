import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];

// PATCH /api/stock/moves/[id] → แก้เฉพาะข้อความ: ผู้เบิก/อ้างอิง/หมายเหตุ (ไม่แตะจำนวน/ต้นทุน — ปลอดภัย)
// แก้จำนวน/ประเภทผิด → ให้ "ยกเลิก" แล้วลงรายการใหม่ (กันยอด/ต้นทุนเพี้ยน)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  const sb = createClient();
  const { data: mv, error: e0 } = await sb.from("stock_moves").select("id, is_voided").eq("id", params.id).single();
  if (e0 || !mv) return fail("ไม่พบรายการ", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((mv as any).is_voided) return fail("รายการนี้ถูกยกเลิกแล้ว แก้ไม่ได้", 409);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd: Record<string, any> = { edited_at: new Date().toISOString() };
  if ("requester" in body) upd.requester = String(body.requester ?? "");
  if ("note" in body) upd.note = String(body.note ?? "");
  if ("ref" in body) upd.ref = String(body.ref ?? "");
  if (Object.keys(upd).length === 1) return fail("ไม่มีข้อมูลให้แก้");

  const { error } = await sb.from("stock_moves").update(upd).eq("id", params.id);
  if (error && /edited_at/i.test(error.message ?? "")) return fail("ยังไม่ได้รัน migration 0087 — รันก่อนใช้งาน", 400);
  if (error) return fail(error.message, 500);
  return ok({ ok: true });
}
