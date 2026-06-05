import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

type Sb = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };

const schema = z.object({ to: z.number().int().min(1).max(24), note: z.string().nullish() });

// POST /api/jobs/[id]/advance — เดินหน้า/ย้อน loop ใน state machine 24 stage (RPC advance_stage)
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "write");
  const { to, note } = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.rpc("advance_stage", { p_job: params.id, p_to: to, p_note: note ?? null });
  if (error) throw dbError(error);
  await audit({ jobId: params.id, userId: ctx.user.id, action: "STAGE_ADVANCE", table: "jobs", recordId: params.id, newValue: { stage: data } });
  return ok({ current_stage: data });
});
