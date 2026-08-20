import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP read — หาใบเสร็จที่ยอดไม่ตรงงวด (งวดถูกแก้หลังออกใบเสร็จ) · token-gated · ลบทันที
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // ใบเสร็จล่าสุดที่ยังไม่ void + ผูกงวด
  const { data: rcs } = await sb.from("receipts")
    .select("id, code, installment_id, billing_note_id, amount, base_amt, vat_amt, wht_amt, net, issue_date, is_voided, created_at")
    .not("installment_id", "is", null).eq("is_voided", false)
    .order("created_at", { ascending: false }).limit(40);

  const instIds = (rcs ?? []).map((r: any) => r.installment_id).filter((x: any) => x != null);
  const { data: insts } = instIds.length
    ? await sb.from("billing_installments").select("id, seq, label, amount, base_amt, vat_amt, wht_amt, paid_amount, status, billing_note_id").in("id", instIds)
    : { data: [] };
  const instById: Record<number, any> = {};
  for (const it of (insts ?? [])) instById[it.id] = it;

  const mismatches = (rcs ?? []).map((r: any) => {
    const it = instById[r.installment_id];
    if (!it) return null;
    const diffAmt = Math.abs((Number(r.amount) || 0) - (Number(it.amount) || 0));
    const diffBase = Math.abs((Number(r.base_amt) || 0) - (Number(it.base_amt) || 0));
    if (diffAmt <= 0.01 && diffBase <= 0.01) return null;
    return {
      receipt: { id: r.id, code: r.code, amount: r.amount, base_amt: r.base_amt, vat_amt: r.vat_amt, issue_date: r.issue_date, bn: r.billing_note_id },
      installment_now: { id: it.id, seq: it.seq, amount: it.amount, base_amt: it.base_amt, vat_amt: it.vat_amt, paid_amount: it.paid_amount, status: it.status },
      diffAmt: Math.round(diffAmt * 100) / 100,
    };
  }).filter(Boolean);

  return NextResponse.json({ scanned: (rcs ?? []).length, mismatches });
}
