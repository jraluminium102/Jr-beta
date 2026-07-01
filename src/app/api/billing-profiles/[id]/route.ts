import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

type Sb = { from: (t: string) => any };
type Params = { params: { id: string } };

// PATCH /api/billing-profiles/[id] → แก้นามออกบิล (รวมตั้งเป็นนามหลัก)
export async function PATCH(req: Request, { params }: Params) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();
  const id = Number(params.id);
  const body = (await req.json().catch(() => null)) ?? {};
  const sb = createClient() as unknown as Sb;

  const { data: cur } = await sb.from("billing_profiles").select("customer_id").eq("id", id).maybeSingle();
  if (!cur) return fail("ไม่พบนามออกบิล", 404);

  const upd: Record<string, unknown> = {};
  if (typeof body.kind === "string") upd.kind = body.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL";
  if (typeof body.bill_name === "string") upd.bill_name = body.bill_name.trim();
  if (typeof body.tax_id === "string") upd.tax_id = body.tax_id.trim();
  if (typeof body.branch === "string") upd.branch = body.branch.trim() || "สำนักงานใหญ่";
  if (typeof body.address === "string") upd.address = body.address;
  if (typeof body.contact_person === "string") upd.contact_person = body.contact_person;
  if (typeof body.phone === "string") upd.phone = body.phone;

  // ตั้งเป็นนามหลัก → ปลดนามหลักเดิมของลูกค้าก่อน (partial unique index)
  if (body.is_default === true) {
    await sb.from("billing_profiles").update({ is_default: false })
      .eq("customer_id", (cur as { customer_id: number }).customer_id).eq("is_default", true);
    upd.is_default = true;
  }

  const { data, error } = await sb.from("billing_profiles").update(upd).eq("id", id).select("*").single();
  if (error) return fail(error.message, 500);
  return ok(data);
}

// DELETE /api/billing-profiles/[id] → ลบนาม (ต้องเหลืออย่างน้อย 1 · นามหลักลบไม่ได้)
export async function DELETE(_req: Request, { params }: Params) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();
  const id = Number(params.id);
  const sb = createClient() as unknown as Sb;

  const { data: cur } = await sb.from("billing_profiles").select("customer_id, is_default").eq("id", id).maybeSingle();
  if (!cur) return fail("ไม่พบนามออกบิล", 404);
  const c = cur as { customer_id: number; is_default: boolean };
  const { count } = await sb.from("billing_profiles").select("id", { count: "exact", head: true })
    .eq("customer_id", c.customer_id).eq("is_active", true);
  if ((count ?? 0) <= 1) return fail("ต้องมีนามออกบิลอย่างน้อย 1 นาม — ลบไม่ได้", 409);
  if (c.is_default) return fail("นามหลักลบไม่ได้ — ตั้งนามอื่นเป็นหลักก่อน", 409);

  const { error } = await sb.from("billing_profiles").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ id });
}
