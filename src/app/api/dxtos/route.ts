import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — สภาพ bn 64 (งวด/ใบเสร็จ/รับเงิน) เต็ม · token-gated · ลบทันที
const BN = 64;
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: bn } = await sb.from("billing_notes")
    .select("id, code, job_id, quotation_id, total, subtotal, vat_rate, vat_amt, wht_rate, wht_amt, status, customer_snapshot")
    .eq("id", BN).maybeSingle();
  const { data: insts } = await sb.from("billing_installments")
    .select("id, seq, label, amount, base_amt, vat_amt, wht_amt, paid_amount, status").eq("billing_note_id", BN).order("seq");
  const instIds = (insts ?? []).map((i: any) => i.id);
  const { data: rcs } = await sb.from("receipts")
    .select("id, code, installment_id, amount, base_amt, vat_amt, wht_amt, net, issue_date, is_voided").eq("billing_note_id", BN);
  const { data: fes } = instIds.length
    ? await sb.from("finance_entries").select("id, type, amount, billing_installment_id, is_voided, source, receipt_id").in("billing_installment_id", instIds)
    : { data: [] };

  return NextResponse.json({
    bn: bn ? { id: bn.id, code: bn.code, total: bn.total, subtotal: bn.subtotal, vat_rate: bn.vat_rate, vat_amt: bn.vat_amt, status: bn.status, name: bn.customer_snapshot?.name, job_id: bn.job_id } : null,
    installments: insts,
    receipts: rcs,
    finance_entries: fes,
  });
}
