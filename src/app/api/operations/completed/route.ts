import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// GET /api/operations/completed?q=&month=YYYY-MM
//   รายการงานที่จบแล้ว (COMPLETED) — คลัง data ย้อนหลัง ไว้ดู BOQ/ใบเสนอ/มัดจำต่องาน
//   month กรองตามวันจบงาน (completed_date) ถ้าไม่มีค่อย fallback วันมัดจำ (deposit_date)
//   คลิกงาน → เปิดสรุปงาน (/api/jobs/[id]/summary)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("dashboard", "read");
  const showNet = can(ctx.role, "jobs:finance_fields", "read"); // ยอดเงินโชว์เฉพาะ role การเงิน
  const sb = createServiceClient() as unknown as { from: (t: string) => Any };

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const month = url.searchParams.get("month"); // YYYY-MM (ตาม deposit_date เดือนที่มัดจำ)

  let query = sb
    .from("jobs")
    .select(
      "id, job_code, customer_name, customer_tel, customer_area, net_amount, deposit_date, updated_at, " +
      "installations(completed_date)"
    )
    .eq("status", "COMPLETED")
    .order("updated_at", { ascending: false })
    .limit(400);

  if (q) {
    const safe = q.replace(/[,()*\\]/g, " ");
    query = query.or(`customer_name.ilike.%${safe}%,job_code.ilike.%${safe}%`);
  }

  const { data } = await query;
  let rows = ((data ?? []) as Any[]).map((j) => {
    const inst = Array.isArray(j.installations) ? j.installations[0] : j.installations;
    return {
      id: j.id as string,
      job_code: (j.job_code as string | null) ?? null,
      customer_name: j.customer_name as string,
      customer_tel: (j.customer_tel as string | null) ?? null,
      customer_area: (j.customer_area as string | null) ?? null,
      net: showNet && j.net_amount != null ? Number(j.net_amount) : null,
      deposit_date: (j.deposit_date as string | null) ?? null,
      completed_date: (inst?.completed_date as string | null) ?? null,
    };
  });

  if (month) {
    rows = rows.filter((r) => {
      const ref = r.completed_date ?? r.deposit_date;
      return ref ? String(ref).startsWith(month) : false;
    });
  }

  return ok(rows, { total: rows.length });
});
