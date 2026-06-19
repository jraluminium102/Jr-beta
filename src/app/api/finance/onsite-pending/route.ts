import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// GET /api/finance/onsite-pending
// มัดจำหน้างานที่ยังไม่กรอกยอด → เงินรับจริงยังไม่ลงบัญชี (เตือนแอดมินให้ตามกรอก)
// เงื่อนไข: onsite_deposit=true + deposit_amount IS NULL + ยังไม่ยกเลิก
export const GET = withRoute(async () => {
  const ctx = await requirePermission("finance", "read");
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb
    .from("jobs")
    .select("id, job_code, customer_name, customer_area, deposit_date")
    .eq("onsite_deposit", true)
    .is("deposit_amount", null)
    .neq("status", "CANCELLED")
    .order("deposit_date", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((j: any) => ({
    job_id: j.id,
    job_code: j.job_code,
    customer_name: j.customer_name,
    customer_area: j.customer_area ?? null,
    deposit_date: j.deposit_date ?? null,
  }));
  return ok(rows);
});
