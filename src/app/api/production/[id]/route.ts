import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

type Params = { params: { id: string } };

// ลำดับ happy-path (ห้ามข้าม/ถอยหลัง)
const PROD_FLOW = ["PENDING_MEASURE","MEASURED","PENDING_MEETING","REVISING","PENDING_CONFIRM","QUEUED","MANUFACTURING","QC","READY"] as const;
type ProdFlowStatus = typeof PROD_FLOW[number];

const schema = z.object({
  status: z.enum(["PENDING_MEASURE","MEASURED","PENDING_MEETING","REVISING","PENDING_CONFIRM","QUEUED","MANUFACTURING","QC","READY","ISSUE"]).optional(),
  planned_install_date: z.string().nullish(),
  measure_scheduled:    z.string().nullish(),
  measure_actual:       z.string().nullish(),
  measurer_id:          z.string().uuid().nullish(),
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
  notes:      z.string().nullish(),
  remark:     z.string().nullish(),
});

export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const body = schema.parse(await req.json());

  // Guard: ห้าม rollback จาก READY, ห้ามข้ามไป READY โดยไม่ผ่าน QC
  if (body.status && body.status !== "ISSUE") {
    const { data: current } = await ctx.supabase
      .from("productions").select("status").eq("id", params.id).single();
    if (current) {
      const curIdx = PROD_FLOW.indexOf(current.status as ProdFlowStatus);
      const newIdx = PROD_FLOW.indexOf(body.status as ProdFlowStatus);
      // ห้ามถอยหลังถ้าอยู่ที่ READY แล้ว
      if (current.status === "READY" && newIdx < curIdx) {
        return err("งานพร้อมติดตั้งแล้ว ไม่สามารถถอยสถานะได้", 409);
      }
      // ห้ามข้ามไป READY โดยตรง (ต้องผ่าน QC ก่อน)
      if (body.status === "READY" && current.status !== "QC") {
        return err("ต้องผ่านขั้น QC ก่อนจึงจะพร้อมติดตั้งได้", 409);
      }
    }
  }

  const { data, error } = await ctx.supabase
    .from("productions").update(body).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");

  if (body.status) {
    await audit({
      jobId: data.job_id, userId: ctx.user.id, action: "PRODUCTION_STATUS",
      table: "productions", recordId: params.id, newValue: { status: body.status },
    });
  }
  return ok(data);
});
