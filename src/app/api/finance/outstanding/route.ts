import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// GET /api/finance/outstanding — ลูกหนี้: งานที่ยอดรวม > เงินที่รับแล้ว
export const GET = withRoute(async () => {
  const ctx = await requirePermission("finance", "read");

  // ดึง jobs พร้อม billing_notes (status != cancelled) + finance_entries
  const { data, error } = await ctx.supabase
    .from("jobs")
    .select(`
      id, job_code, customer_name, total_amount, status,
      finance_entries(amount, is_voided),
      billing_notes(total, status)
    `)
    .in("status", ["DEPOSITED", "COMPLETED"])
    .not("total_amount", "is", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((j: Record<string, unknown>) => {
      const jobTotal = Number(j.total_amount ?? 0);

      // ยอดบิล active (status != cancelled) — ถ้ามีให้ใช้แทน jobs.total_amount
      const billingNotes = (j.billing_notes as { total: number; status: string }[] | null) ?? [];
      const activeBillingNotes = billingNotes.filter((bn) => bn.status !== "cancelled");
      const billingTotal = activeBillingNotes.reduce((s, bn) => s + Number(bn.total), 0);

      // ฐานค้างรับ: ถ้ามีบิล active ใช้ sum(billing_notes.total) ไม่งั้นใช้ jobs.total_amount
      const base = activeBillingNotes.length > 0 ? billingTotal : jobTotal;

      const entries = (j.finance_entries as { amount: number; is_voided: boolean }[] | null) ?? [];
      const paid = entries.filter((e) => !e.is_voided).reduce((s, e) => s + Number(e.amount), 0);
      const outstanding = round2(base - paid);

      return {
        job_id: j.id,
        job_code: j.job_code,
        customer_name: j.customer_name,
        total: base,
        paid: round2(paid),
        outstanding,
        status: j.status,
        has_billing: activeBillingNotes.length > 0,
      };
    })
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const totalOutstanding = round2(rows.reduce((s, r) => s + r.outstanding, 0));
  return ok(rows, { total_outstanding: totalOutstanding, can_write: can(ctx.role, "finance", "write") });
});
