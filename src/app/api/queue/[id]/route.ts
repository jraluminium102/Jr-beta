import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const SELECT = "*, sales:sales_id(id,name,code,team)";

function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));
}

const patchSchema = z.object({
  status: z.enum(["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"]).optional(),
  queue_date: z.string().nullish(),
  queue_time: z.string().nullish(),
  job_type: z.string().nullish(),
  sales_id: z.string().uuid().nullish(),
  line_contact: z.string().nullish(),
  customer_name: z.string().min(1).optional(),
  tel: z.string().nullish(),
  address: z.string().nullish(),
  location_url: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  job_count: z.number().int().nullish(),
  assess_fee: z.number().nullish(),
  payment: z.string().nullish(),
  receipt_done: z.boolean().optional(),
  note_admin: z.string().nullish(),
  note_ai: z.string().nullish(),
});

// PATCH /api/queue/[id] — แก้ไขคิว (ADMIN)
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const body = patchSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb.from("queue_entries")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", params.id).select(SELECT).single();
  if (error || !data) throw new Error(error?.message ?? "แก้ไขคิวไม่สำเร็จ");
  return ok(data);
});

// DELETE /api/queue/[id] — ลบคิว (ADMIN)
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const sb = ctx.supabase as unknown as Sb;

  const { error } = await sb.from("queue_entries").delete().eq("id", params.id);
  if (error) throw new Error(error.message);
  return ok({ id: params.id });
});
