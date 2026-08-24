import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — แยกใบวางบิลออกเป็นงานผลิตของตัวเอง แล้วดันเข้าผลิต
//   (เคสหลายออเดอร์อัดใน job เดียว → บิลใหม่ไม่โผล่เป็นรายการผลิตแยก)
// GET /api/dxsplit?t=split-2026&bn=BL2569080082
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "split-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const code = url.searchParams.get("bn") || "BL2569080082";
  const today = url.searchParams.get("d") || "2026-08-24";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const wrap = (msg: string) =>
    new NextResponse(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:20px;font-size:16px;line-height:1.8}b{color:#0a7}i{color:#777}</style><h2>แยก ${code} เข้าผลิต</h2>${msg}`,
      { headers: { "content-type": "text/html; charset=utf-8" } });

  // 1) โหลดบิล + งวด
  const { data: bn } = await sb.from("billing_notes")
    .select("id, code, status, job_id, quotation_id, customer_snapshot, billing_installments(id, seq, paid_amount)")
    .eq("code", code).maybeSingle();
  if (!bn) return wrap(`<p>❌ ไม่พบใบ <b>${code}</b></p>`);
  if (bn.status === "cancelled") return wrap(`<p>❌ ใบ <b>${code}</b> ถูกยกเลิกแล้ว</p>`);
  if (!bn.quotation_id) return wrap(`<p>❌ ใบ <b>${code}</b> ไม่ได้ผูกใบเสนอ แยกไม่ได้ (ต้องผูกใบเสนอก่อน)</p>`);

  // ชื่อออเดอร์ (รายการแรกของใบเสนอ)
  const { data: firstIt } = await sb.from("quotation_items")
    .select("name").eq("quotation_id", bn.quotation_id).order("sort_order").limit(1).maybeSingle();
  const workName = firstIt?.name ?? "(ไม่ทราบรายการ)";

  // 2) กันย้ายใบเสนอที่แชร์กับบิล active ใบอื่น
  const { data: siblingBills } = await sb.from("billing_notes")
    .select("id, code").eq("quotation_id", bn.quotation_id).neq("status", "cancelled");
  if ((siblingBills ?? []).length > 1) {
    return wrap(`<p>⚠️ ใบเสนอของ ${code} มีใบวางบิล active หลายใบ (${(siblingBills ?? []).map((b: any) => b.code).join(", ")}) — แยกอัตโนมัติไม่ปลอดภัย บอกผมก่อน</p>`);
  }

  // 3) idempotent: ถ้า job ปัจจุบันมีใบเสนอเดียว = แยกแล้ว → แค่ ensure ผลิต
  const curJob = bn.job_id;
  let jobId = curJob;
  let movedNote = "";
  if (curJob) {
    const { data: quosOnJob } = await sb.from("quotations").select("id").eq("job_id", curJob);
    if ((quosOnJob ?? []).length <= 1) {
      movedNote = `<p>• งานนี้แยกอยู่แล้ว (มีออเดอร์เดียว) — ข้ามการสร้างงานใหม่</p>`;
    } else {
      jobId = null; // ต้องสร้างงานใหม่
    }
  }

  // 4) สร้างงานใหม่ + ย้าย ใบเสนอ/บิล/เงิน มาที่งานใหม่
  if (!jobId) {
    const snap = (bn.customer_snapshot ?? {}) as Record<string, any>;
    const name = String(snap.name ?? "").trim() || "ลูกค้า";
    const chMap: Record<string, string> = { LINE: "LINE", FB: "FACEBOOK", FACEBOOK: "FACEBOOK", IG: "INSTAGRAM", INSTAGRAM: "INSTAGRAM", OTHER: "OTHER" };
    const ch = chMap[String(snap.contact_channel ?? "").toUpperCase()] ?? "OTHER";
    // customer_id จากใบเสนอ
    const { data: q } = await sb.from("quotations").select("customer_id").eq("id", bn.quotation_id).maybeSingle();
    const custId = q?.customer_id ?? null;

    const { data: newJob, error: jErr } = await sb.from("jobs")
      .insert({ customer_name: name, ...(custId != null ? { customer_id: custId } : {}), channel: ch, assess_date: today, status: "PENDING_QUOTE" })
      .select("id, job_code").single();
    if (jErr || !newJob) return wrap(`<p>❌ สร้างงานใหม่ไม่สำเร็จ: ${jErr?.message ?? ""}</p>`);
    jobId = newJob.id;

    // ย้าย ใบเสนอ + บิล
    await sb.from("quotations").update({ job_id: jobId }).eq("id", bn.quotation_id);
    await sb.from("billing_notes").update({ job_id: jobId }).eq("id", bn.id);
    // ย้ายเส้นเงินของงวดในบิลนี้ (เงินตามงานไป)
    const instIds = (bn.billing_installments ?? []).map((i: any) => i.id);
    if (instIds.length) await sb.from("finance_entries").update({ job_id: jobId }).in("billing_installment_id", instIds);
    movedNote = `<p>✅ สร้างงานใหม่ <b>${newJob.job_code ?? ""}</b> · ย้ายใบเสนอ+ใบวางบิล+เงิน มาที่งานนี้</p>`;
  }

  // 5) ดันเข้าผลิต: set DEPOSITED (ถ้ายังไม่) → trigger สร้าง production
  const { data: jobRow } = await sb.from("jobs").select("status").eq("id", jobId).maybeSingle();
  if (jobRow && ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"].includes(jobRow.status)) {
    await sb.from("jobs").update({ status: "DEPOSITED", deposit_date: today }).eq("id", jobId);
  }
  // ดันสถานะผลิต → QUEUED (รอลงผลิต) ให้ชัด (ข้าม PENDING_MEASURE เพราะออเดอร์พร้อมแล้ว)
  await sb.from("productions").update({ status: "QUEUED" }).eq("job_id", jobId).eq("status", "PENDING_MEASURE");

  const { data: job2 } = await sb.from("jobs").select("job_code, status, current_stage").eq("id", jobId).maybeSingle();
  const { data: prod } = await sb.from("productions").select("status").eq("job_id", jobId).maybeSingle();

  return wrap(`
    <p>ออเดอร์: <b>${workName}</b></p>
    ${movedNote}
    <p>✅ ดันเข้าผลิตแล้ว</p>
    <p><b>งาน ${job2?.job_code ?? ""}</b> · สถานะ ${job2?.status ?? ""} · stage ${job2?.current_stage ?? ""}</p>
    <p><b>ในผลิต:</b> ${prod?.status ?? "—"}</p>
    <p style="margin-top:14px"><i>เปิดหน้าผลิตดูได้เลย — จะเห็น "${workName}" เป็นงานแยกของตัวเอง · กดซ้ำได้ ไม่ซ้ำซ้อน</i></p>`);
}
