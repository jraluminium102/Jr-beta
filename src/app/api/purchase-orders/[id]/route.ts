import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

const patchSchema = z.object({
  material: z.enum(["ALUM", "GLASS", "HARDWARE", "OTHER"]).optional(),
  title: z.string().optional(),
  supplier: z.string().nullish(),
  status: z.enum(["PENDING", "ORDERED", "RECEIVED"]).optional(),
  order_date: z.string().nullish(),
  expected_date: z.string().nullish(),
  received_date: z.string().nullish(),
  note: z.string().nullish(),
});

// PATCH /api/purchase-orders/[id]
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("production", "write");
  const body = patchSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("purchase_orders").update(body).eq("id", params.id).select("*").maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "ไม่พบใบสั่งของ");
  return ok(data);
});

// DELETE /api/purchase-orders/[id]
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("purchase_orders").delete().eq("id", params.id).select("id");
  if (error) throw dbError(error);
  if (!data || data.length === 0) throw new HttpError(404, "ไม่พบใบสั่งของ");
  return ok({ id: params.id });
});
