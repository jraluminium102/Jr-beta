import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

type Params = { params: { id: string } };

const schema = z.object({
  reason: z.string().min(1, "กรุณาระบุเหตุผลที่ต้องวัดซ้ำ"),
  scope_note: z.string().nullish(),
});

// GET /api/production/[id]/remeasure — ประวัติรอบวัด (measure_rounds) ของงานนี้
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const { data, error } = await ctx.supabase
    .from("measure_rounds")
    .select("*")
    .eq("production_id", params.id)
    .order("round_no", { ascending: false });
  if (error) throw dbError(error);
  return ok(data ?? []);
});

// POST /api/production/[id]/remeasure — วัดซ้ำ (0130)
//   เจ้าของเคาะ: วัดซ้ำได้ทุกเฟสก่อนติดตั้ง · ห้ามถอย jobs.current_stage (ใช้ป้าย "วัดรอบ N" แทน)
//   gate เฉพาะ ADMIN/PRODUCTION (ไม่ให้ CHANG ผ่านลิงก์กดวัดซ้ำ — เป็นงานตัดสินใจของออฟฟิศ/ผลิต)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  if (ctx.role !== "ADMIN" && ctx.role !== "PRODUCTION") {
    return err("บทบาทนี้สั่งวัดซ้ำไม่ได้ (ต้องเป็นออฟฟิศ/ผลิต)", 403);
  }
  const body = schema.parse(await req.json());

  const { data: current, error: curErr } = await ctx.supabase
    .from("productions")
    .select("id, job_id, status, measure_round_no, measure_scheduled, measure_time, measure_actual, measure_actual_time, measurer_name, measured_by_name")
    .eq("id", params.id)
    .single();
  if (curErr || !current) throw dbError(curErr ?? { message: "ไม่พบงานผลิตนี้" });

  // เจ้าของเคาะ: วัดซ้ำได้ "ทุกเฟสก่อนติดตั้ง" — ก่อน READY/ติดตั้ง (READY = พร้อมส่งติดตั้งแล้ว)
  if (current.status === "READY") {
    return err("งานนี้พร้อมติดตั้งแล้ว (READY) — วัดซ้ำไม่ได้ (ย้ายเฟสกลับก่อนถ้าต้องวัดจริง ๆ)", 409);
  }
  // ห้ามวัดซ้ำถ้าเข้าสู่ขั้นติดตั้งจริงแล้ว (installations มี row ที่ status ไม่ใช่ PENDING = เริ่มติดตั้งแล้ว)
  const { data: inst } = await ctx.supabase
    .from("installations")
    .select("status")
    .eq("job_id", current.job_id)
    .maybeSingle();
  if (inst && inst.status !== "PENDING") {
    return err("งานนี้เข้าสู่ขั้นติดตั้งแล้ว — วัดซ้ำไม่ได้ (แก้ที่หน้าติดตั้งแทน)", 409);
  }

  const roundNo = current.measure_round_no ?? 1;

  // snapshot รอบปัจจุบันก่อนเคลียร์
  const { error: insErr } = await ctx.supabase.from("measure_rounds").insert({
    production_id: current.id,
    job_id: current.job_id,
    round_no: roundNo,
    scheduled: current.measure_scheduled,
    sched_time: current.measure_time,
    measurer_name: current.measurer_name,
    measured: current.measure_actual,
    measured_time: current.measure_actual_time,
    measured_by: current.measured_by_name ?? current.measurer_name,  // measured_by_name อาจว่าง → ใช้ชื่อผู้วัด (measurer_name เป็นหลักตาม measure-schedule)
    reason: body.reason,
    scope_note: body.scope_note || "",
    created_by: ctx.user.id || null,
  });
  if (insErr) throw dbError(insErr);

  // เคลียร์รอบวัด + เด้งกลับ "รอวัด" — ⚠ ห้ามแตะ jobs.current_stage (เจ้าของเคาะข้อ 2)
  const { data, error } = await ctx.supabase
    .from("productions")
    .update({
      status: "PENDING_MEASURE",
      measure_round_no: roundNo + 1,
      measure_scheduled: null,
      measure_time: null,
      measure_actual: null,
      measure_actual_time: null,
      measurer_name: null,
      measured_by_name: null,
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error || !data) throw dbError(error ?? { message: "วัดซ้ำไม่สำเร็จ" });

  await audit({
    jobId: current.job_id, userId: ctx.user.id || null, action: "PRODUCTION_REMEASURE",
    table: "productions", recordId: params.id,
    newValue: { round_no: roundNo + 1, reason: body.reason, scope_note: body.scope_note || undefined },
  });

  return ok(data);
});
