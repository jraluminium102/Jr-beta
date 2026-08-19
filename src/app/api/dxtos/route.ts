import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read-only — สถานะ BL2569080044 + งาน + finance + บิลอื่นของงาน (เคส 7,000 บล็อก) · token-gated · ลบหลังใช้
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const code = url.searchParams.get("bl") ?? "BL2569080044";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: bn } = await sb.from("billing_notes")
    .select("id, code, job_id, quotation_id, total, status, billing_installments(id, seq, label, amount, paid_amount, paid_date, status)")
    .eq("code", code).maybeSingle();
  const jobId = bn?.job_id ?? null;

  let job = null, finance = null, allBillsForJob = null;
  if (jobId) {
    const { data: j } = await sb.from("jobs")
      .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount")
      .eq("id", jobId).maybeSingle();
    job = j;
    const { data: fe } = await sb.from("finance_entries")
      .select("id, type, amount, payment_date, is_voided, is_auto_created, source, billing_installment_id")
      .eq("job_id", jobId).order("payment_date");
    finance = fe;
    const { data: bills } = await sb.from("billing_notes")
      .select("id, code, status, total, billing_installments(id, seq, amount, paid_amount)")
      .eq("job_id", jobId).order("created_at");
    allBillsForJob = bills;
  }
  return NextResponse.json({ billing_note: bn, job, finance, allBillsForJob });
}
