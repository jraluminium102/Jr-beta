import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP verify — สถานะสุดท้าย คุณทศรินทร์ หลังดันเข้าผลิต · token-gated · ลบทันทีหลังใช้
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const jobId = "cce8e500-b22b-477e-bf73-1c31cb4e24a4";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: job } = await sb.from("jobs")
    .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount, customer_id")
    .eq("id", jobId).maybeSingle();
  const { data: finance } = await sb.from("finance_entries")
    .select("id, type, amount, payment_date, is_voided, is_auto_created, source, billing_installment_id")
    .eq("job_id", jobId);
  const { data: production } = await sb.from("productions")
    .select("id, status, created_at").eq("job_id", jobId);
  const { data: bn } = await sb.from("billing_notes")
    .select("id, code, job_id, quotation_id, status").eq("code", "BL2569080040").maybeSingle();

  return NextResponse.json({ job, finance, production, billing_note: bn });
}
