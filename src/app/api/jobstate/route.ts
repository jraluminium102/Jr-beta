import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const TOKEN = "jst-8a2f1c";
const NAMES = ["อดิศร", "มงคลชัย", "นวพร", "รัมภา", "กนกพิชญ์", "ทศริน"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const out: any[] = [];
  for (const name of NAMES) {
    const { data: jobs } = await sb
      .from("jobs")
      .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount")
      .ilike("customer_name", `%${name}%`)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });
    const rows = [];
    for (const j of jobs ?? []) {
      const { data: fin } = await sb.from("finance_entries").select("amount, payment_date, is_voided").eq("job_id", j.id);
      const paid = (fin ?? []).filter((f: any) => !f.is_voided);
      rows.push({
        job_code: j.job_code, name: j.customer_name, status: j.status, stage: j.current_stage,
        deposit_date: j.deposit_date, deposit_amount: j.deposit_amount,
        finance_entries: paid.length, finance_sum: paid.reduce((s: number, f: any) => s + Number(f.amount || 0), 0),
      });
    }
    out.push({ search: name, jobs: rows });
  }
  return Response.json({ results: out });
}
