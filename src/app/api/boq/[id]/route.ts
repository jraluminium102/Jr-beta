import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";

// GET /api/boq/[id]  → หัว BOQ + รายการวัสดุ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("boqs")
    .select("*, boq_items(*), job:job_id(job_code)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "boq_items", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

// PATCH /api/boq/[id]  → แก้สถานะ / หมายเหตุ
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "boq", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!["draft", "confirmed", "ordered"].includes(body.status)) return fail("สถานะไม่ถูกต้อง");
    patch.status = body.status;
  }
  if (typeof body.note === "string") patch.note = body.note;
  if (Object.keys(patch).length === 0) return fail("ไม่มีข้อมูลให้แก้ไข");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("boqs")
    .update(patch)
    .eq("id", params.id)
    .select("id, status, note")
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
