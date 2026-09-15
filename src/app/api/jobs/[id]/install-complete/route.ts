import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { holdSetsBlockReason, markActiveSetsInstalledForClose } from "@/lib/production/install-gate";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };

// POST /api/jobs/[id]/install-complete
//   "จบงานเลย" จากชิป "พร้อมติดตั้ง" ในหน้าติดตั้ง — ปิดงานตรง ๆ ไม่ต้องลงคิว/หาในปฏิทิน
//   ตั้ง installations.status = COMPLETED → trigger 0002 เลื่อน job → COMPLETED (จบงาน)
//   งานพร้อมติดตั้ง (READY) มีใบติดตั้ง PENDING อยู่แล้ว (trigger 0036) → update ได้เลย แม้ยังไม่ลงคิว
export const POST = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("installation", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const today = new Date().toISOString().slice(0, 10);

  // 0131 (name-based 15 ก.ย.69): เหลือบล็อกเฉพาะชุดที่ hold ค้าง — เช็คก่อน mutate ใด ๆ
  const blockReason = await holdSetsBlockReason(sb, params.id);
  if (blockReason) return err(blockReason, 409);

  const { data, error } = await sb.from("installations")
    .update({ status: "COMPLETED", install_actual: today, completed_date: today })
    .eq("job_id", params.id).select("id, job_id, status").maybeSingle();
  if (error) throw dbError(error);
  // ไม่มีใบติดตั้ง = งานยังไม่ถึงขั้นติดตั้ง (ยังผลิตไม่เสร็จ) — กันปิดงานข้ามผลิต
  if (!data) return err("งานนี้ยังไม่ถึงขั้นติดตั้ง (ยังผลิตไม่เสร็จ) — ปิดงานยังไม่ได้", 404);

  // ปิดสำเร็จแล้ว → มาร์คชุด active ที่ยังไม่ติดตั้ง = INSTALLED (ไม่บังคับติ๊กรายชุด · เจ้าของสั่ง 15 ก.ย.69)
  const actor = ctx.profile?.full_name ?? ctx.user.email ?? "ไม่ทราบ";
  const marked = await markActiveSetsInstalledForClose(sb, params.id, actor);
  if (marked > 0) await audit({ jobId: params.id, userId: ctx.user.id, action: "SET_INSTALL_STATUS", table: "production_sets", newValue: { auto: true, count: marked, by: actor, from: "job-close" } });

  await audit({
    jobId: params.id, userId: ctx.user.id, action: "INSTALL_STATUS",
    table: "installations", recordId: data.id, newValue: { status: "COMPLETED", from: "ready-chip" },
  });
  return ok(data);
});
