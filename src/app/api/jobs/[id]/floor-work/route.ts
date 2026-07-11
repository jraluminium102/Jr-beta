import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { Role } from "@/lib/database.types";

const VALID = ["none", "jr", "customer"];

// POST /api/jobs/[id]/floor-work → ติ๊กงานพื้น ผรม. ต่อ job (หน้าเช็คลิสต์ใบเสนอราคา)
// body: { floor_work: 'none'|'jr'|'customer', floor_note?: string }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role as Role, "jobs", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const fw = String(body?.floor_work ?? "");
  if (!VALID.includes(fw)) return fail("floor_work ไม่ถูกต้อง");
  const note = String(body?.floor_note ?? "").slice(0, 300);

  const sb = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("jobs")
    .update({ floor_work: fw, floor_note: fw === "none" ? "" : note })
    .eq("id", params.id);
  if (error && /floor_work|floor_note/i.test(error.message ?? "")) return fail("ยังไม่ได้รัน migration 0090 — รันก่อนใช้งาน", 400);
  if (error) return fail(error.message, 500);
  return ok({ ok: true, floor_work: fw, floor_note: fw === "none" ? "" : note });
}
