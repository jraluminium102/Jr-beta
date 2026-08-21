import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — งานมัดจำ ส.ค. ที่ net_amount ว่าง/0 (ทำให้สถิติขาด) · token-gated · ลบทันที
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const from = url.searchParams.get("from") ?? "2026-08-01";
  const to = url.searchParams.get("to") ?? "2026-08-31";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: jobs, error } = await sb.from("jobs")
    .select("job_code, customer_name, net_amount")
    .gte("deposit_date", from).lte("deposit_date", to).neq("status", "CANCELLED");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sum = 0, nullCnt = 0, zeroCnt = 0;
  const missing: { job: string; name: string; net: any }[] = [];
  for (const j of (jobs ?? [])) {
    const n = Number(j.net_amount) || 0;
    sum += n;
    if (j.net_amount == null) { nullCnt++; missing.push({ job: j.job_code, name: j.customer_name, net: null }); }
    else if (n === 0) { zeroCnt++; missing.push({ job: j.job_code, name: j.customer_name, net: 0 }); }
  }
  return NextResponse.json({
    range: [from, to], deposited: (jobs ?? []).length,
    sumNet: sum, nullNetCount: nullCnt, zeroNetCount: zeroCnt,
    missingSample: missing.slice(0, 20),
  });
}
