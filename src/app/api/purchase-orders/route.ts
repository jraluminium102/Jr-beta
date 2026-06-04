import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

// GET /api/purchase-orders?job_id=... — ใบสั่งของของงาน
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "read");
  const jobId = new URL(req.url).searchParams.get("job_id");
  const sb = ctx.supabase as unknown as Sb;
  let query = sb.from("purchase_orders").select("*").order("created_at", { ascending: false });
  if (jobId) query = query.eq("job_id", jobId);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return ok(data ?? [], { can_write: can(ctx.role, "production", "write") });
});

const createSchema = z.object({
  job_id: z.string().uuid(),
  material: z.enum(["ALUM", "GLASS", "HARDWARE", "OTHER"]).default("OTHER"),
  title: z.string().optional().default(""),
  supplier: z.string().nullish(),
  status: z.enum(["PENDING", "ORDERED", "RECEIVED"]).optional(),
  order_date: z.string().nullish(),
  expected_date: z.string().nullish(),
  note: z.string().nullish(),
});

// POST /api/purchase-orders — เปิดใบสั่งของ
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const body = createSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("purchase_orders")
    .insert({ ...body, created_by: ctx.user.id }).select("*").single();
  if (error) throw dbError(error);
  return created(data);
});
