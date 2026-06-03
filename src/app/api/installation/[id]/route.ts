import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

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
});

export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("installation", "write");
  const body = schema.parse(await req.json());

  const { data, error } = await ctx.supabase
    .from("installations").update(body).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");

  if (body.status) {
    await audit({
      jobId: data.job_id, userId: ctx.user.id, action: "INSTALL_STATUS",
      table: "installations", recordId: params.id, newValue: { status: body.status },
    });
  }
  return ok(data);
});
