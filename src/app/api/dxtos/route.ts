import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP write — บันทึกชำระ งวด 1 BL2569080044 (มัดจำ token 7,000 โตเป็น 138,044.27) ผ่าน service client
//   ทำแบบเดียวกับ applyInstallmentPayment(force) เป๊ะ · token-gated · ลบทันทีหลังใช้
const BN_ID = 88;
const INST_ID = 346;
const PAID = 138044.27;
const PAID_DATE = "2026-08-19";

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // 0) กันทำซ้ำ — ถ้างวดนี้จ่ายแล้วออกไปเลย
  const { data: inst0 } = await sb.from("billing_installments").select("paid_amount, seq").eq("id", INST_ID).single();
  if (Number(inst0?.paid_amount) > 0) return NextResponse.json({ note: "จ่ายแล้ว ไม่ทำซ้ำ", inst0 });

  // 1) mark งวด paid
  const { error: e1 } = await sb.from("billing_installments")
    .update({ paid_amount: PAID, paid_date: PAID_DATE, status: "paid" }).eq("id", INST_ID);
  if (e1) return NextResponse.json({ step: 1, error: e1.message }, { status: 500 });

  // 2) recompute billing note status
  const { data: bn } = await sb.from("billing_notes")
    .select("total, job_id, billing_installments(paid_amount)").eq("id", BN_ID).single();
  const totalPaid = (bn?.billing_installments ?? []).reduce((a: number, i: any) => a + (Number(i.paid_amount) || 0), 0);
  const total = Number(bn?.total) || 0;
  const st = totalPaid <= 0 ? "unpaid" : totalPaid >= total ? "paid" : "partial";
  const { error: e2 } = await sb.from("billing_notes").update({ status: st }).eq("id", BN_ID).neq("status", "cancelled");
  if (e2) return NextResponse.json({ step: 2, error: e2.message }, { status: 500 });

  // 3) sync finance — link มัดจำ token เข้างวด 1 + อัปยอดเป็นยอดงวดจริง (paid >= deposit)
  const jobId = bn?.job_id;
  let financeAction = "none";
  if (jobId) {
    const { data: dep } = await sb.from("finance_entries").select("id, amount")
      .eq("job_id", jobId).eq("type", "DEPOSIT").eq("is_auto_created", true).eq("is_voided", false)
      .is("billing_installment_id", null).maybeSingle();
    if (dep?.id) {
      const newAmount = Math.max(Number(dep.amount) || 0, PAID);
      const { error: e3 } = await sb.from("finance_entries")
        .update({ amount: newAmount, payment_date: PAID_DATE, billing_installment_id: INST_ID, source: "BILLING" })
        .eq("id", dep.id);
      if (e3) return NextResponse.json({ step: 3, error: e3.message }, { status: 500 });
      financeAction = `linked+updated dep ${dep.id} → ${newAmount}`;
    } else {
      const { error: e3b } = await sb.from("finance_entries").insert({
        job_id: jobId, amount: PAID, payment_date: PAID_DATE, type: "DEPOSIT", channel: "TRANSFER",
        source: "BILLING", billing_installment_id: INST_ID, is_auto_created: false, is_voided: false,
      });
      if (e3b) return NextResponse.json({ step: "3b", error: e3b.message }, { status: 500 });
      financeAction = "inserted new";
    }
  }
  return NextResponse.json({ ok: true, billStatus: st, totalPaid, financeAction });
}
