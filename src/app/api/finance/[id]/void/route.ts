import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

type Params = { params: { id: string } };
const schema = z.object({ reason: z.string().min(1, "ระบุเหตุผล") });

// POST /api/finance/:id/void — ห้ามลบตรง ต้อง void + เหตุผล (REQ-04)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("finance", "void");
  const { reason } = schema.parse(await req.json());

  const { data, error } = await ctx.supabase
    .from("finance_entries")
    .update({
      is_voided: true,
      void_reason: reason,
      voided_at: new Date().toISOString(),
      voided_by: ctx.user.id,
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Void failed");

  await audit({
    jobId: data.job_id, userId: ctx.user.id, action: "FINANCE_VOID",
    table: "finance_entries", recordId: params.id, newValue: { reason },
  });
  return ok(data);
});
