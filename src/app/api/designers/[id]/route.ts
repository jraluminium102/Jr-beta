import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// DELETE /api/designers/[id] — ปิดใช้งานผู้ออกแบบ (soft delete: active=false)
//   ไม่ลบจริง → เก็บประวัติงานที่เคยเขียน (designer_ref บนงานเก่ายังชี้ชื่อได้)
//   บล็อกถ้ายังมีงานค้าง (ยังไม่เสร็จ/ไม่ยกเลิก) — ต้องย้ายผู้เขียนก่อน
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "write")) return FORBIDDEN();

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return fail("รหัสผู้ออกแบบไม่ถูกต้อง");

  const supabase = createClient() as unknown as Sb;

  // มีงานค้างอยู่ไหม (ยังไม่ DONE และไม่ CANCELLED)
  const { count, error: cErr } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("designer_ref", id)
    .neq("design_state", "DONE")
    .neq("status", "CANCELLED");
  if (cErr) return fail(cErr.message, 500);
  if ((count ?? 0) > 0) {
    return fail(`ผู้ออกแบบนี้ยังมีงานค้างอยู่ ${count} งาน — ย้ายผู้เขียนงานเหล่านั้นให้คนอื่นก่อน แล้วค่อยลบ`, 409);
  }

  const { data, error } = await supabase
    .from("designers")
    .update({ active: false })
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) return fail(error.message, 500);

  return ok({ designer: data });
}
