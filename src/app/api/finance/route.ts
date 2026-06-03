import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// GET /api/finance — list (filter job, date range)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "read");
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = ctx.supabase
    .from("finance_entries")
    .select("*, job:job_id(job_code, customer_name, total_amount)")
    .eq("is_voided", false)
    .order("payment_date", { ascending: false });
  if (jobId) query = query.eq("job_id", jobId);
  if (from) query = query.gte("payment_date", from);
  if (to) query = query.lte("payment_date", to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ok(data ?? [], {
    can_write: can(ctx.role, "finance", "write"),
    can_void: can(ctx.role, "finance", "void"),
  });
});

const schema = z.object({
  job_id: z.string().uuid(),
  payment_date: z.string().min(1, "กรุณาระบุวันที่รับเงิน"),
  amount: z.number().positive(),
  type: z.enum(["DEPOSIT", "INSTALLMENT_2", "INSTALLMENT_3", "FINAL"]),
  channel: z.enum(["TRANSFER", "CASH", "CHEQUE"]),
  note: z.string().optional(),
});

// POST /api/finance — บันทึกรับเงิน (งวด 2/3/สุดท้าย)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const body = schema.parse(await req.json());

  // กันมัดจำซ้ำ: มัดจำถูกสร้างอัตโนมัติตอนงาน DEPOSITED แล้ว
  if (body.type === "DEPOSIT") {
    const { count } = await ctx.supabase
      .from("finance_entries")
      .select("id", { count: "exact", head: true })
      .eq("job_id", body.job_id)
      .eq("type", "DEPOSIT")
      .eq("is_voided", false);
    if ((count ?? 0) > 0) return err("งานนี้มีรายการมัดจำอยู่แล้ว (ระบบสร้างอัตโนมัติตอนมัดจำ)", 409);
  }

  const { data, error } = await ctx.supabase
    .from("finance_entries")
    .insert({ ...body, is_auto_created: false })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return created(data);
});
