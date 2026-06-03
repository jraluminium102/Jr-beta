import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase.from("customers").select("*").eq("id", params.id).single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const allowed = ["name", "job", "address", "tax_id", "line_id", "phone", "contact_person", "is_active"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  if (Object.keys(patch).length === 0) return fail("ไม่มีข้อมูลให้แก้ไข");

  const supabase = createClient();
  const { data, error } = await supabase.from("customers").update(patch).eq("id", params.id).select("*").single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
