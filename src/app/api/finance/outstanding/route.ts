import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// GET /api/finance/outstanding — ลูกหนี้: งานที่ยอดรวม > เงินที่รับแล้ว
export const GET = withRoute(async () => {
  const ctx = await requirePermission("finance", "read");

  const { data, error } = await ctx.supabase
    .from("jobs")
    .select("id, job_code, customer_name, total_amount, status, finance_entries(amount, is_voided)")
    .in("status", ["DEPOSITED", "COMPLETED"])
    .not("total_amount", "is", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((j: Record<string, unknown>) => {
      const total = Number(j.total_amount ?? 0);
      const entries = (j.finance_entries as { amount: number; is_voided: boolean }[] | null) ?? [];
      const paid = entries.filter((e) => !e.is_voided).reduce((s, e) => s + Number(e.amount), 0);
      const outstanding = Math.round((total - paid) * 100) / 100;
      return {
        job_id: j.id, job_code: j.job_code, customer_name: j.customer_name,
        total, paid, outstanding, status: j.status,
      };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  return ok(rows, { total_outstanding: totalOutstanding, can_write: can(ctx.role, "finance", "write") });
});
