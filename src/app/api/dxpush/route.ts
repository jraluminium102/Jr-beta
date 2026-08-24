import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureBillingJobAndPromote } from "@/lib/billing";

// TEMP (จะลบทิ้ง) — ดันใบวางบิลเข้าผลิต: สร้างงาน(ถ้ายังไม่มี)+เติมเงินย้อนหลัง+ดันเข้าผลิตถ้ามัดจำจ่ายแล้ว
// GET /api/dxpush?t=push-2026&bn=BL2569080082
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "push-2026") {
    return NextResponse.json({ error: "no" }, { status: 404 });
  }
  const code = url.searchParams.get("bn") || "BL2569080082";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: bn } = await sb.from("billing_notes")
    .select("id, code, status, job_id, quotation_id, customer_snapshot, billing_installments(seq, amount, paid_amount, status)")
    .eq("code", code).maybeSingle();

  const wrap = (msg: string, extra = "") =>
    new NextResponse(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:20px;font-size:16px;line-height:1.7}b{color:#0a7}i{color:#777}</style><h2>ดัน ${code} เข้าผลิต</h2><p>${msg}</p>${extra}`,
      { headers: { "content-type": "text/html; charset=utf-8" } });

  if (!bn) return wrap(`❌ ไม่พบใบวางบิล <b>${code}</b> — เช็ครหัสอีกที`);
  if (bn.status === "cancelled") return wrap(`❌ ใบ <b>${code}</b> ถูกยกเลิกแล้ว ดันเข้าผลิตไม่ได้`);

  const before = bn.job_id;
  const res = await ensureBillingJobAndPromote(sb as any, String(bn.id), "system");
  if (res.error) return wrap(`❌ ทำไม่สำเร็จ: ${res.error}`);

  // อ่านสถานะงานหลังทำ
  const { data: job } = await sb.from("jobs").select("job_code, status, current_stage").eq("id", res.jobId).maybeSingle();
  const { data: prod } = await sb.from("productions").select("status").eq("job_id", res.jobId).maybeSingle();

  const paid1 = (bn.billing_installments ?? []).find((i: any) => i.seq === 1);
  const paidTxt = paid1 && Number(paid1.paid_amount) > 0 ? `งวด 1 จ่ายแล้ว ฿${Number(paid1.paid_amount).toLocaleString("th-TH")}` : "งวด 1 ยังไม่จ่าย";

  const lines = [
    res.created ? `✅ สร้างงานให้ใบนี้แล้ว` : `• ใช้งานเดิมที่มีอยู่ (${before ? "ผูกงานอยู่แล้ว" : ""})`,
    res.backfilled ? `✅ ลงบัญชีย้อนหลัง ${res.backfilled} งวด` : "",
    res.promoted ? `✅ ดันเข้าผลิตแล้ว` : `⚠️ ยังไม่ดันเข้าผลิต (${paidTxt})`,
    job ? `<br><b>งาน ${job.job_code ?? ""}</b> · สถานะ ${job.status} · stage ${job.current_stage}` : "",
    prod ? `<b>ในผลิต:</b> ${prod.status}` : `<i>ยังไม่มีแถวในผลิต</i>`,
  ].filter(Boolean);

  return wrap(lines.join("<br>"), `<p style="margin-top:16px"><i>เสร็จแล้ว — เปิดหน้าผลิตดูได้เลย · กดลิงก์นี้ซ้ำได้ ไม่ซ้ำซ้อน</i></p>`);
}
