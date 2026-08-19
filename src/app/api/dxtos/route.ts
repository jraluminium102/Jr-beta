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
    .select("id, code, job_id, quotation_id, total, status, customer_snapshot, billing_installments(id, seq, label, amount, paid_amount, paid_date)")
    .eq("code", code).maybeSingle();

  // มีงาน/ใบเสนอ/ลูกค้า ชื่อ "ทศรินทร์" อยู่ในระบบแล้วไหม
  const { data: jobsMatch } = await sb.from("jobs")
    .select("id, job_code, customer_name, status, current_stage, deposit_date, deposit_amount, customer_id")
    .ilike("customer_name", "%ทศรินทร์%");
  const { data: quotesMatch } = await sb.from("quotations")
    .select("id, code, job_id, customer_snapshot, total, status")
    .ilike("code", "%QT2026040059%");
  const { data: custMatch } = await sb.from("customers")
    .select("id, name, phone").ilike("name", "%ทศรินทร์%");

  return NextResponse.json({ billing_note: bn, jobsMatch, quotesMatch, custMatch });
}
