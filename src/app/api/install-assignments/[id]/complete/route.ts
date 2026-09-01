import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { installCompleteBlockReason } from "@/lib/production/install-gate";

type Params = { params: { id: string } };

// POST /api/install-assignments/[id]/complete
//   ปุ่ม "✓ ติดตั้งเสร็จแล้ว" บนการ์ดปฏิทิน → ปิดงานเลย (เจ้าของเคาะ 24 ก.ค.: ปุ่มเดียวจบ ไม่มีขั้นรอตรวจ)
//   ตั้ง installations.status = COMPLETED → trigger 0002 เลื่อน job เป็น COMPLETED (จบงาน) ให้เอง
export const POST = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("installation", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  // การ์ดในปฏิทิน = install_assignments · หา job_id ของงานนั้น (คิวนอกระบบ = ไม่มี job → กดจบไม่ได้)
  const { data: asg } = await sb.from("install_assignments").select("job_id").eq("id", params.id).maybeSingle();
  if (!asg?.job_id) return err("งานพิเศษ (คิวนอกระบบ · ไม่ผูกงานในระบบ) — กดจบงานไม่ได้", 400);

  // 0131: ชุดผลิต active ต้องติดตั้งครบ + ห้ามมี hold ค้าง ก่อนปิดงาน
  const blockReason = await installCompleteBlockReason(sb, asg.job_id);
  if (blockReason) return err(blockReason, 409);

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("installations")
    .update({ status: "COMPLETED", install_actual: today, completed_date: today })
    .eq("job_id", asg.job_id).select("id, job_id, status").maybeSingle();
  if (error) throw dbError(error);
  if (!data) return err("ไม่พบใบติดตั้งของงานนี้ (อาจยังไม่ถึงขั้นติดตั้ง)", 404);

  await audit({
    jobId: asg.job_id, userId: ctx.user.id, action: "INSTALL_STATUS",
    table: "installations", recordId: data.id, newValue: { status: "COMPLETED", from: "calendar-card" },
  });
  return ok(data);
});
