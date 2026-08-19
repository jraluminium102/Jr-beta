import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read-only diagnostic — สถานะ คุณทศรินทร์ (BL2569080040) ก่อนดันเข้าผลิต · token-gated · ลบหลังใช้
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const code = url.searchParams.get("bl") ?? "BL2569080040";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: bn } = await sb.from("billing_notes")
    .select("*, billing_installments(*)").eq("code", code).maybeSingle();
  const jobId = bn?.job_id ?? null;

  let job = null, finance = null, production = null;
  if (jobId) {
    const { data: j } = await sb.from("jobs")
      .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount, customer_id")
      .eq("id", jobId).maybeSingle();
    job = j;
    const { data: fe } = await sb.from("finance_entries")
      .select("id, type, amount, payment_date, is_voided, is_auto_created, channel, note")
      .eq("job_id", jobId);
    finance = fe;
    const { data: pr } = await sb.from("production")
      .select("id, status, current_stage, created_at").eq("job_id", jobId);
    production = pr;
  }
  return NextResponse.json({ billing_note: bn, job, finance, production });
}
