import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — ยืนยัน finance หลังบันทึกชำระ งวด 1 BL2569080044 · token-gated · ลบทันที
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const jobId = "e2bfa0a7-6e0f-4d70-9bd2-51171cede4bc"; // JR2026-193
  const { data: fe } = await sb.from("finance_entries")
    .select("id, type, amount, payment_date, is_voided, is_auto_created, source, billing_installment_id")
    .eq("job_id", jobId).order("payment_date");
  const total = (fe ?? []).filter((f: any) => !f.is_voided).reduce((a: number, f: any) => a + (Number(f.amount) || 0), 0);
  return NextResponse.json({ finance: fe, totalNonVoided: total });
}
