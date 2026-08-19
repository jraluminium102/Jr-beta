import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — production state ของ JR2026-193 (ช่างเจี๊ยบ) · token-gated · ลบทันที
const JOB_ID = "e2bfa0a7-6e0f-4d70-9bd2-51171cede4bc";
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const { data: job } = await sb.from("jobs")
    .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount, design_state").eq("id", JOB_ID).maybeSingle();
  const { data: prod } = await sb.from("productions")
    .select("id, status, status_updated_at, measure_scheduled, measure_actual, production_queued, production_done, created_at").eq("job_id", JOB_ID);
  const { data: covers } = await sb.from("cover_sheets").select("id, created_at").eq("job_id", JOB_ID);
  const { data: draws } = await sb.from("job_drawings").select("id, title").eq("job_id", JOB_ID);
  return NextResponse.json({ job, productions: prod, cover_sheets: covers, job_drawings: draws });
}
