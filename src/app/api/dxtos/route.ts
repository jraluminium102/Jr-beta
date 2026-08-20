import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — หา entry ในคิวงานพื้นที่ job.floor_work != 'jr' (ดึงผิดมาก่อนหน้า) · token-gated · ลบทันที
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: entries } = await sb.from("floor_queue_entries")
    .select("id, customer_name, job_id, bucket, status, kind").not("job_id", "is", null);
  const jobIds = [...new Set((entries ?? []).map((e: any) => e.job_id))];
  const { data: jobs } = jobIds.length
    ? await sb.from("jobs").select("id, floor_work, job_code").in("id", jobIds)
    : { data: [] };
  const fwById: Record<string, string> = {};
  for (const j of (jobs ?? [])) fwById[j.id] = j.floor_work;

  const wrong = (entries ?? [])
    .filter((e: any) => fwById[e.job_id] && fwById[e.job_id] !== "jr")
    .map((e: any) => ({ id: e.id, customer_name: e.customer_name, floor_work: fwById[e.job_id], bucket: e.bucket, status: e.status }));

  return NextResponse.json({ totalWithJob: (entries ?? []).length, wrongCount: wrong.length, wrong });
}
