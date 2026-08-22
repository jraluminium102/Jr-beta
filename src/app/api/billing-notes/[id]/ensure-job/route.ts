import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { ensureBillingJobAndPromote } from "@/lib/billing";

// POST /api/billing-notes/[id]/ensure-job
// "ผูกงาน + ดันเข้าผลิต" — ซ่อมใบวางบิลที่ยังไม่มีงาน (job_id null) แล้วชำระไปแล้วแต่งานไม่เข้าผลิต
//   (ใบเสนอนอกระบบพิมพ์เอง ลูกค้าใหม่ยังไม่มีงาน → วางบิล/ชำระ แต่ไม่มี job ให้ดัน)
// idempotent: รันซ้ำได้ — สร้างงาน+ผูก (ถ้ายังไม่มี), เติมเงินย้อนหลัง, ดันเข้าผลิตถ้ามัดจำจ่ายแล้ว
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN();

  const supabase = createClient();
  const res = await ensureBillingJobAndPromote(supabase, params.id, profile.id);
  if (res.error) return fail(res.error, 400);
  return ok(res);
}
