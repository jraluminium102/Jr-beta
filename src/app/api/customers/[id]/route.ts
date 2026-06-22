import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";

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

  // เก็บชื่อเดิมไว้ก่อน เพื่อ audit เมื่อแก้ชื่อ (ชื่อ propagate ไปทุกเฟส/เอกสารผ่าน trigger DB 0051)
  let oldName: string | null = null;
  if ("name" in patch) {
    const { data: prev } = await supabase.from("customers").select("name").eq("id", params.id).single();
    oldName = (prev as { name?: string } | null)?.name ?? null;
  }

  const { data, error } = await supabase.from("customers").update(patch).eq("id", params.id).select("*").single();
  if (error) return fail(error.message, 500);

  if ("name" in patch && oldName !== (patch.name as string)) {
    await audit({
      userId: profile.id,
      action: "CUSTOMER_RENAME",
      table: "customers",
      recordId: String(params.id),
      oldValue: { name: oldName },
      newValue: { name: patch.name },
    });
  }

  return ok(data);
}
