import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { installCompleteBlockReason } from "@/lib/production/install-gate";

type Params = { params: { id: string } };

const schema = z.object({
  status: z.enum(["PENDING","INSTALLING","PENDING_INSPECT","REVISING","COMPLETED","ISSUE"]).optional(),
  install_scheduled:  z.string().nullish(),
  install_actual:     z.string().nullish(),
  lead_installer_id:  z.string().uuid().nullish(),
  inspect_date:       z.string().nullish(),
  inspect_result:     z.enum(["PASSED","MINOR_FIX","REJECTED"]).nullish(),
  inspect_note:       z.string().nullish(),
  revision_done:      z.string().nullish(),
  completed_date:     z.string().nullish(),
  problem1: z.string().nullish(), responsible1: z.string().nullish(),
  problem2: z.string().nullish(), responsible2: z.string().nullish(),
  problem3: z.string().nullish(), responsible3: z.string().nullish(),
  problem4: z.string().nullish(), responsible4: z.string().nullish(),
  remark:   z.string().nullish(),
  handover_date:        z.string().nullish(),
  handover_signoff_url: z.string().nullish(),
  handover_photo_url:   z.string().nullish(),
});

export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("installation", "write");
  const body = schema.parse(await req.json());

  // Guard: ห้าม rollback จาก COMPLETED
  if (body.status && body.status !== "ISSUE") {
    const { data: current } = await ctx.supabase
      .from("installations").select("status, job_id").eq("id", params.id).single();
    if (current?.status === "COMPLETED" && body.status !== "COMPLETED") {
      return err("งานจบแล้ว ไม่สามารถเปลี่ยนสถานะกลับได้", 409);
    }
    // 0131: ปิดงาน (COMPLETED) — ชุดผลิต active ต้องติดตั้งครบ + ห้ามมี hold ค้าง
    if (body.status === "COMPLETED" && current?.job_id) {
      const sbAny = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const blockReason = await installCompleteBlockReason(sbAny, current.job_id);
      if (blockReason) return err(blockReason, 409);
    }
  }

  const { data, error } = await ctx.supabase
    .from("installations").update(body).eq("id", params.id).select().single();
  if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Update failed" });

  if (body.status) {
    await audit({
      jobId: data.job_id, userId: ctx.user.id, action: "INSTALL_STATUS",
      table: "installations", recordId: params.id, newValue: { status: body.status },
    });
  }
  return ok(data);
});
