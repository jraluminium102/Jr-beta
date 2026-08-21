import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — สถานะ BL2569080059 (Steve) → job/production/finance · token-gated · ลบทันที
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const code = url.searchParams.get("bl") ?? "BL2569080059";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: bn } = await sb.from("billing_notes")
    .select("id, code, job_id, quotation_id, total, status, customer_snapshot, billing_installments(id, seq, amount, paid_amount, paid_date, status)")
    .eq("code", code).maybeSingle();
  const jobId = bn?.job_id ?? null;

  let job = null, production = null, finance = null, quote = null;
  if (bn?.quotation_id) {
    const { data: q } = await sb.from("quotations").select("id, code, job_id, status, net").eq("id", bn.quotation_id).maybeSingle();
    quote = q;
  }
  if (jobId) {
    const { data: j } = await sb.from("jobs")
      .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount, customer_id").eq("id", jobId).maybeSingle();
    job = j;
    const { data: pr } = await sb.from("productions").select("id, status, created_at").eq("job_id", jobId);
    production = pr;
    const { data: fe } = await sb.from("finance_entries")
      .select("id, type, amount, is_voided, is_auto_created, source, billing_installment_id, payment_date").eq("job_id", jobId);
    finance = fe;
  }
  return NextResponse.json({ billing_note: bn ? { id: bn.id, code: bn.code, job_id: bn.job_id, quotation_id: bn.quotation_id, total: bn.total, status: bn.status, name: bn.customer_snapshot?.name, installments: bn.billing_installments } : null, quote, job, production, finance });
}
