import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

const querySchema = z.object({
  customer_id: z.coerce.number().int().positive("customer_id ต้องเป็นตัวเลขบวก"),
});

// GET /api/jobs/by-customer?customer_id=<n>
// คืนงาน active (ไม่ใช่ COMPLETED/CANCELLED) ของลูกค้า เรียง created_at desc
// ใช้สำหรับ QuotationForm เลือกงานที่จะผูกใบเสนอราคา
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "read");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ customer_id: url.searchParams.get("customer_id") });
  if (!parsed.success) return err("customer_id ไม่ถูกต้อง", 400);

  const { customer_id } = parsed.data;

  const { data, error } = await ctx.supabase
    .from("jobs")
    .select("id, job_code, current_stage, status, created_at")
    .eq("customer_id", customer_id)
    .not("status", "in", "(COMPLETED,CANCELLED)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ok(data ?? []);
});
