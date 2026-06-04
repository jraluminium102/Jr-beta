import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { z } from "zod";

const CustomerInsertSchema = z.object({
  name:           z.string().min(1, "ต้องระบุชื่อลูกค้า"),
  job:            z.string().optional().default(""),
  address:        z.string().optional().default(""),
  tax_id:         z.string().optional().default(""),
  line_id:        z.string().optional().default(""),
  phone:          z.string().optional().default(""),
  contact_person: z.string().optional().default(""),
});

// GET /api/customers?q=คำค้น  → รายชื่อลูกค้า
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("customers", "read");

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  let query = ctx.supabase
    .from("customers")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (q) query = query.or(`name.ilike.%${q}%,job.ilike.%${q}%,phone.ilike.%${q}%,line_id.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/customers  → เพิ่มลูกค้า
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("customers", "write");

  const body = await req.json().catch(() => null);
  const parsed = CustomerInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { data, error } = await ctx.supabase
    .from("customers")
    .insert({ ...parsed.data, name: parsed.data.name.trim(), created_by: ctx.user.id })
    .select("*")
    .single();

  if (error) return err(error.message, 500);
  return ok(data, undefined, 201);
});
