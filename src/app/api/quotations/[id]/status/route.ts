import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { z } from "zod";

const StatusSchema = z.object({
  status: z.enum(["draft", "sent", "approved", "cancelled"]),
});

// PATCH /api/quotations/[id]/status  { status }
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("quotations", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) return err("สถานะไม่ถูกต้อง", 422, parsed.error.flatten());

  const { data, error } = await ctx.supabase
    .from("quotations")
    .update({ status: parsed.data.status })
    .eq("id", params.id)
    .select("id, status")
    .single();
  if (error) return err(error.message, 500);
  return ok(data);
});
