import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const STATES = ["NOT_STARTED", "DRAWING", "PENDING_CUSTOMER", "REVISING", "DONE"] as const;
type DState = (typeof STATES)[number];

// PATCH /api/designer/[id] — เปลี่ยนสถานะงานเขียนแบบผ่าน RPC set_design_state
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body || !body.state || !STATES.includes(body.state)) return fail("สถานะไม่ถูกต้อง");
  const state = body.state as DState;
  const note = typeof body.note === "string" ? body.note : "";

  const supabase = createClient();

  // stamp design_start ครั้งแรกเมื่อเข้าสู่ขั้นทำงานใดๆ (DRAWING/REVISING/PENDING_CUSTOMER)
  // ครอบคลุมกรณีถูกส่งแก้ก่อนเคยเริ่มเขียน ป้องกันงานหายจาก Gantt (#14)
  if (state === "DRAWING" || state === "REVISING" || state === "PENDING_CUSTOMER") {
    await supabase
      .from("jobs")
      .update({ design_start: new Date().toISOString().slice(0, 10) })
      .eq("id", params.id)
      .is("design_start", null);
  }

  // เปลี่ยนสถานะ + นับรอบแก้ + ปิด design_end ผ่าน RPC (RBAC ซ้ำชั้นใน DB)
  const { data, error } = await supabase.rpc("set_design_state", {
    p_job: params.id,
    p_state: state,
    p_note: note,
  });
  if (error) return fail("เปลี่ยนสถานะไม่สำเร็จ: " + error.message, 500);

  // audit ถ้ามีตาราง audit_logs (best-effort — ไม่ให้พังถ้าไม่มี/ไม่มีสิทธิ์)
  await supabase
    .from("audit_logs")
    .insert({
      job_id: params.id,
      user_id: profile.id,
      action: "DESIGN_STATE_CHANGED",
      table_name: "jobs",
      record_id: params.id,
      new_value: { design_state: state, note },
    })
    .then(undefined, () => {});

  return ok({ design_state: data ?? state });
}
