import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// map production.status → current_stage ตัวแทน (ตรงกับ tg_production_changes 0036)
const STAGE_OF: Record<string, number | null> = {
  PENDING_MEASURE: 9, MEASURED: 10, PENDING_MEETING: 11, REVISING: 12,
  PENDING_CONFIRM: 13, QUEUED: 15, MANUFACTURING: 18, QC: 19, READY: 20, ISSUE: null,
};

const schema = z.object({
  status: z.enum(["PENDING_MEASURE","MEASURED","PENDING_MEETING","REVISING","PENDING_CONFIRM","QUEUED","MANUFACTURING","QC","READY","ISSUE"]),
});

// POST /api/production/[id]/override-status — "แก้เฟสงานผลิต" (เครื่องมือแอดมิน แก้กรณีกดผิด)
//   ต่างจาก PATCH ปกติ: ข้ามด่านลำดับ (ถอยหลัง/ข้ามได้) + reset jobs.current_stage/status ให้ตรง
//   (trigger sync เป็น forward-only → ถอยเฟสต้องเซ็ต stage เอง)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  if (ctx.role !== "ADMIN") throw new HttpError(403, "เฉพาะแอดมินแก้เฟสงานได้");
  const { status } = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as AnySb;

  const { data: prod, error: pErr } = await sb.from("productions").select("id, status, job_id").eq("id", params.id).maybeSingle();
  if (pErr) throw dbError(pErr);
  if (!prod) return err("ไม่พบงานผลิตนี้", 404);
  const jobId = prod.job_id as string | null;

  // อัปเดตสถานะผลิตตรง ๆ (trigger tg_production_changes ยังทำงาน: READY สร้างใบติดตั้ง ฯลฯ)
  const { error: uErr } = await sb.from("productions").update({ status }).eq("id", params.id);
  if (uErr) throw dbError(uErr);

  if (jobId) {
    const stage = STAGE_OF[status];
    // ถอยจาก/ข้าม READY ไปเฟสก่อนติดตั้ง → ลบใบติดตั้งที่ยังไม่เริ่ม (กัน orphan โผล่หน้าติดตั้ง)
    if (status !== "READY") {
      await sb.from("installations").delete().eq("job_id", jobId).eq("status", "PENDING");
    }
    // reset current_stage ให้ตรงเฟส (forward-only trigger ไม่ถอยให้ — เซ็ตเอง)
    //   ไม่แตะ jobs.status: flow ผลิตปกติคง status='DEPOSITED' ตลอดสายผลิต (trigger แตะแค่ current_stage)
    //   → กันเคส override ทำ status=IN_PRODUCTION แล้ว undeposit บล็อกผิด
    if (stage != null) await sb.from("jobs").update({ current_stage: stage }).eq("id", jobId);
  }

  await audit({
    jobId: jobId ?? undefined, userId: ctx.user.id, action: "PRODUCTION_STATUS_OVERRIDE",
    table: "productions", recordId: params.id,
    oldValue: { status: prod.status }, newValue: { status },
  });
  return ok({ status });
});
