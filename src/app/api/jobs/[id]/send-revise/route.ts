import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, notFound, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// POST /api/jobs/:id/send-revise
// SALES ส่งงานให้ช่างแก้แบบ → transition design_state → REVISING
// ใช้ direct UPDATE (ไม่เรียก RPC set_design_state) เพื่อเลี่ยง DB role-gate
// ที่บังคับ has_role('ADMIN') or has_role('DESIGNER') ใน migration 0036
export const POST = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("sales_closure", "write");

  // โหลด job ปัจจุบัน
  const { data: cur, error: selErr } = await ctx.supabase
    .from("jobs")
    .select("id, status, design_state, design_start, design_revise_count")
    .eq("id", params.id)
    .single();

  if (selErr || !cur) return notFound("ไม่พบงานนี้");

  // กันงานที่ผ่านมัดจำหรือยกเลิกแล้ว
  const BLOCKED_STATUSES = ["DEPOSITED", "IN_PRODUCTION", "INSTALLING", "COMPLETED", "CANCELLED"] as const;
  if (BLOCKED_STATUSES.includes(cur.status as typeof BLOCKED_STATUSES[number])) {
    return err("งานนี้ผ่านมัดจำหรือยกเลิกแล้ว ส่งแก้แบบไม่ได้", 409);
  }

  const today = new Date().toISOString().slice(0, 10);

  // นับรอบแก้ +1 เฉพาะตอนเพิ่งเข้า REVISING (กันกดซ้ำ)
  const newReviseCount =
    cur.design_state !== "REVISING"
      ? (cur.design_revise_count ?? 0) + 1
      : (cur.design_revise_count ?? 0);

  // stamp design_start ครั้งแรก (เหมือน designer/[id] route) — คงค่าเดิมถ้ามีแล้ว
  const newDesignStart = cur.design_start ?? today;

  const { data, error: updErr } = await ctx.supabase
    .from("jobs")
    .update({
      design_state: "REVISING",
      design_revise_count: newReviseCount,
      design_start: newDesignStart,
      // quote_sent_date ห้ามแตะ — ต้องคงไว้เพื่อให้หลังแก้เสร็จงานกลับ stage 'sent' อัตโนมัติ
    })
    .eq("id", params.id)
    .select("id, design_state, design_revise_count, design_start")
    .single();

  if (updErr) throw dbError(updErr);
  if (!data) throw dbError({ message: "Update failed" });

  // audit best-effort
  await audit({
    jobId: params.id,
    userId: ctx.user.id,
    action: "DESIGN_SENT_REVISE",
    table: "jobs",
    recordId: params.id,
    newValue: { design_state: "REVISING", design_revise_count: newReviseCount },
  });

  return ok(data);
});
