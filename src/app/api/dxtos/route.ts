import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — เทียบ jobs.net_amount กับ net ของใบเสนอที่ผูก (งานมัดจำในช่วง) · token-gated · ลบทันที
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const from = url.searchParams.get("from") ?? "2026-08-01";
  const to = url.searchParams.get("to") ?? "2026-08-31";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // งานมัดจำในช่วง (ไม่ยกเลิก)
  const { data: jobs } = await sb.from("jobs")
    .select("id, job_code, customer_name, status, net_amount, deposit_date")
    .gte("deposit_date", from).lte("deposit_date", to).neq("status", "CANCELLED");
  const jobIds = (jobs ?? []).map((j: any) => j.id);

  // ใบเสนอล่าสุด (ไม่ยกเลิก) ต่องาน — net จริงที่ขาย
  const { data: quotes } = jobIds.length
    ? await sb.from("quotations").select("job_id, code, net, status, created_at").in("job_id", jobIds).neq("status", "cancelled").order("created_at", { ascending: false })
    : { data: [] };
  const qByJob: Record<string, { code: string; net: number }> = {};
  for (const q of (quotes ?? [])) if (!qByJob[q.job_id]) qByJob[q.job_id] = { code: q.code, net: Number(q.net) || 0 };

  let sumJobNet = 0, sumQuoteNet = 0, nullNet = 0, mismatch = 0;
  const rows = (jobs ?? []).map((j: any) => {
    const jn = Number(j.net_amount) || 0;
    const q = qByJob[j.id];
    const qn = q ? q.net : 0;
    sumJobNet += jn; sumQuoteNet += qn;
    if (j.net_amount == null) nullNet++;
    const diff = Math.round((qn - jn) * 100) / 100;
    if (Math.abs(diff) > 1) mismatch++;
    return { job: j.job_code, name: j.customer_name, job_net: j.net_amount, quote: q?.code ?? null, quote_net: qn, diff };
  }).filter((r: any) => Math.abs(r.diff) > 1 || r.job_net == null);

  return NextResponse.json({
    range: [from, to], jobsDeposited: (jobs ?? []).length,
    sumJobNet, sumQuoteNet, diffTotal: Math.round((sumQuoteNet - sumJobNet) * 100) / 100,
    nullNetCount: nullNet, mismatchCount: mismatch,
    sample: rows.slice(0, 25),
  });
}
