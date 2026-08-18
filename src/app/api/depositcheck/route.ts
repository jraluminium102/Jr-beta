import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ⚠ TEMP DIAG — ดูสถานะงานก่อนรับมัดจำ (อ่านอย่างเดียว · จะลบหลังตรวจ) · gate ด้วย token
const TOKEN = "depchk-5c8e2a";

const NAMES = ["ทศริน", "ทัศริน", "มงคลชัย", "อดิศร", "นวพร", "รัมภา", "กนกพิชญ์"];
const WON = ["DEPOSITED", "COMPLETED", "IN_PRODUCTION", "INSTALLING"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });

  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const out: any[] = [];

  for (const name of NAMES) {
    const { data: jobs } = await sb
      .from("jobs")
      .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount, net_amount, total_amount, quote_sent_date")
      .ilike("customer_name", `%${name}%`)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });

    const rows = jobs ?? [];
    const enriched = [];
    for (const j of rows) {
      const { data: qs } = await sb
        .from("quotations")
        .select("code, total, net, status, issue_date")
        .eq("job_id", j.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      const quotes = qs ?? [];
      enriched.push({
        job_code: j.job_code,
        customer_name: j.customer_name,
        status: j.status,
        stage: j.current_stage,
        already_deposited: !!j.deposit_date || WON.includes(j.status),
        deposit_date: j.deposit_date,
        deposit_amount: j.deposit_amount,
        job_total: j.total_amount,
        job_net: j.net_amount,
        quote_sent: j.quote_sent_date,
        quotations: quotes.map((q: any) => ({ code: q.code, total: q.total, status: q.status, issue_date: q.issue_date })),
      });
    }
    out.push({ search: name, found: rows.length, jobs: enriched });
  }

  return Response.json({ results: out });
}
