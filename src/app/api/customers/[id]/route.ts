import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";

const CustomerPatchSchema = z.object({
  name:           z.string().min(1).optional(),
  job:            z.string().optional(),
  address:        z.string().optional(),
  tax_id:         z.string().optional(),
  line_id:        z.string().optional(),
  phone:          z.string().optional(),
  contact_person: z.string().optional(),
  is_active:      z.boolean().optional(),
}).strict();

export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("customers", "read");

  const { data, error } = await ctx.supabase.from("customers").select("*").eq("id", params.id).single();
  if (error) return notFound("ไม่พบลูกค้า");
  return ok(data);
});

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("customers", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = CustomerPatchSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return err("ไม่มีข้อมูลให้แก้ไข");

  const { data, error } = await ctx.supabase
    .from("customers")
    .update(parsed.data)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return err(error.message, 500);
  return ok(data);
});
