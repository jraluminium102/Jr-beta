import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// TEMP write — sync finance ให้ตรงงวด 1 ที่จ่ายแล้ว (มัดจำ token 7,000 → 138,044.27 ผูกงวด 1)
//   ทำเฉพาะ finance (งวด/บิลจ่าย+partial แล้ว) · service client · token-gated · ลบทันที
const JOB_ID = "e2bfa0a7-6e0f-4d70-9bd2-51171cede4bc";
const INST_ID = 346;
const PAID = 138044.27;
const PAID_DATE = "2026-08-19";

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "tos-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // งวด 1 ผูก finance แล้วหรือยัง
  const { data: linked } = await sb.from("finance_entries").select("id, amount")
    .eq("billing_installment_id", INST_ID).eq("is_voided", false).maybeSingle();
  if (linked?.id) return NextResponse.json({ note: "ผูกงวดแล้ว ไม่ทำซ้ำ", linked });

  // มัดจำ token ที่ยังไม่ผูกงวด → อัปเป็นยอดงวดจริง + ผูกงวด 1
  const { data: dep } = await sb.from("finance_entries").select("id, amount")
    .eq("job_id", JOB_ID).eq("type", "DEPOSIT").eq("is_auto_created", true).eq("is_voided", false)
    .is("billing_installment_id", null).maybeSingle();
  if (!dep?.id) return NextResponse.json({ error: "ไม่พบมัดจำ token ที่ยังไม่ผูกงวด" }, { status: 404 });

  const newAmount = Math.max(Number(dep.amount) || 0, PAID);
  const { error } = await sb.from("finance_entries")
    .update({ amount: newAmount, payment_date: PAID_DATE, billing_installment_id: INST_ID, source: "BILLING" })
    .eq("id", dep.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // อ่านกลับยืนยัน
  const { data: after } = await sb.from("finance_entries")
    .select("id, type, amount, billing_installment_id, source, is_voided").eq("job_id", JOB_ID);
  return NextResponse.json({ ok: true, updated: dep.id, newAmount, finance: after });
}
