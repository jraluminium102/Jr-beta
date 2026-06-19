import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

type Params = { params: { id: string } };

// "" → null เพื่อกัน empty string ลง date/uuid columns แล้ว Postgres cast พัง
// (เลียนแบบ src/app/api/queue/route.ts)
function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v === "" ? null : v])
  );
}

// ลำดับ happy-path (ห้ามข้าม/ถอยหลัง)
const PROD_FLOW = ["PENDING_MEASURE","MEASURED","PENDING_MEETING","REVISING","PENDING_CONFIRM","QUEUED","MANUFACTURING","QC","READY"] as const;
type ProdFlowStatus = typeof PROD_FLOW[number];

const schema = z.object({
  status: z.enum(["PENDING_MEASURE","MEASURED","PENDING_MEETING","REVISING","PENDING_CONFIRM","QUEUED","MANUFACTURING","QC","READY","ISSUE"]).optional(),
  planned_install_date: z.string().nullish(),
  measure_scheduled:    z.string().nullish(),
  measure_actual:       z.string().nullish(),
  measure_actual_time:  z.string().nullish(),
  measured_by_name:     z.string().nullish(),
  measure_time:         z.string().nullish(),
  measurer_id:          z.string().uuid().nullish(),
  measurer_name:        z.string().nullish(),
  meeting_after_measure: z.string().nullish(),
  design_revision_done: z.string().nullish(),
  quote_revision_done:  z.string().nullish(),
  customer_confirmed:   z.string().nullish(),
  production_queued:    z.string().nullish(),
  alum_order_date:      z.string().nullish(),
  glass_order_date:     z.string().nullish(),
  production_done:      z.string().nullish(),
  qc_result:  z.enum(["PASSED","FAILED"]).nullish(),
  qc_date:    z.string().nullish(),
  qc_note:    z.string().nullish(),
  producer_note: z.string().nullish(),
  notes:      z.string().nullish(),
  remark:     z.string().nullish(),
});

export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const body = schema.parse(clean(await req.json()));

  // Guard: ห้ามข้ามขั้น / ห้าม rollback จาก READY
  if (body.status && body.status !== "ISSUE") {
    const { data: current } = await ctx.supabase
      .from("productions").select("status, production_queued, planned_install_date").eq("id", params.id).single();
    if (current) {
      const curIdx = PROD_FLOW.indexOf(current.status as ProdFlowStatus);
      const newIdx = PROD_FLOW.indexOf(body.status as ProdFlowStatus);
      // ห้ามถอยหลังถ้าอยู่ที่ READY แล้ว
      if (current.status === "READY" && newIdx < curIdx) {
        return err("งานพร้อมติดตั้งแล้ว ไม่สามารถถอยสถานะได้", 409);
      }
      // เริ่มผลิต (ลงวันผลิต) — ProductionStepModal ตัดขั้น QUEUED ออก: เข้า MANUFACTURING
      // ตรงจากหลังประชุม/ยืนยันแบบได้ (PENDING_MEETING/REVISING/PENDING_CONFIRM) + จาก QUEUED(งานเก่า)/ISSUE
      const MFG_FROM = ["PENDING_MEETING", "REVISING", "PENDING_CONFIRM", "QUEUED", "ISSUE"];
      if (body.status === "MANUFACTURING" && !MFG_FROM.includes(current.status as string)) {
        return err("ต้องผ่านขั้นประชุม/ยืนยันแบบก่อนจึงเริ่มผลิตได้", 409);
      }
      // ลงคิวผลิต (QUEUED จากหน้าตารางผลิต) — ได้จากขั้นวัด/ประชุม/ยืนยัน (กันลงคิวตั้งแต่ยังไม่วัด)
      const QUEUE_FROM = ["MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM"];
      if (body.status === "QUEUED" && !QUEUE_FROM.includes(current.status as string)) {
        return err("ต้องวัด/ประชุมแบบก่อนจึงลงคิวผลิตได้", 409);
      }
      // ห้ามข้ามไป READY โดยตรง (ต้องผ่าน QC ก่อน)
      if (body.status === "READY" && current.status !== "QC") {
        return err("ต้องผ่านขั้น QC ก่อนจึงจะพร้อมติดตั้งได้", 409);
      }
    }

    // Guard: install_date >= produce_date (ถ้า field ทั้งสองมีค่า)
    const produceDate = body.production_queued ?? null;
    const installDate = body.planned_install_date ?? null;
    if (produceDate && installDate && installDate < produceDate) {
      return err("วันติดตั้งต้องไม่ก่อนวันผลิต", 400);
    }
  }

  // Guard: บังคับกรอกข้อมูลที่สำคัญเมื่อเปลี่ยนสถานะ
  if (body.status === "MEASURED" && !body.measure_actual) {
    return err("กรุณาบันทึกวันวัดจริง", 400);
  }
  if (body.status === "QC" && !body.production_done) {
    return err("กรุณาบันทึกวันผลิตเสร็จ", 400);
  }
  if (body.status === "READY") {
    if (!body.qc_result) return err("กรุณาเลือกผลตรวจ QC ก่อนส่งติดตั้ง", 400);
    if (!body.qc_date)   return err("กรุณาบันทึกวันตรวจ QC", 400);
  }

  const { data, error } = await ctx.supabase
    .from("productions").update(body).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");

  // แก้แบบหลังวัด → เด้งงานกลับหน้าเขียนแบบ (ตั้ง design_state=REVISING + นับรอบแก้)
  // นับ +1 เฉพาะตอนเพิ่งเข้า REVISING (กันนับซ้ำกับ send-revise/กดซ้ำ — guard เดียวกับ send-revise route)
  if (body.status === "REVISING" && data.job_id) {
    const { data: jobRow } = await ctx.supabase
      .from("jobs").select("design_state, design_revise_count").eq("id", data.job_id).single();
    const alreadyRevising = jobRow?.design_state === "REVISING";
    await ctx.supabase.from("jobs").update({
      design_state: "REVISING",
      design_revise_count: alreadyRevising
        ? (jobRow?.design_revise_count ?? 0)
        : (jobRow?.design_revise_count ?? 0) + 1,
    }).eq("id", data.job_id);
  }

  if (body.status) {
    await audit({
      jobId: data.job_id, userId: ctx.user.id, action: "PRODUCTION_STATUS",
      table: "productions", recordId: params.id, newValue: { status: body.status },
    });
  }
  return ok(data);
});
