import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types"; // ใช้สำหรับ cast ผล .single() ที่เป็น any
import { CHECKLIST_MARKER } from "@/lib/checklist-marker";

export const dynamic = "force-dynamic";

const schema = z.object({
  job_id:     z.string().uuid("job_id ต้องเป็น UUID"),
  total:      z.number().int("ยอดรวมต้องเป็นจำนวนเต็มบาท").positive("ยอดรวมต้องมากกว่า 0"),
  ext_ref:    z.string().optional(),
  ext_link:   z.string().optional(),
  issue_date: z.string().optional(),
  step:       z.union([z.literal(1), z.literal(2)]),
});

/**
 * POST /api/quotations/quick
 *
 * สร้าง "ใบเสนอราคาแบบเบา" (checklist flow) ที่ไม่ผ่าน calculator
 *
 * กฎเงิน (accountant ตรวจแล้ว):
 *   ผู้ใช้กรอก total = ราคาที่ลูกค้าเห็น รวม VAT 7% แล้ว (จำนวนเต็มบาท บังคับ .int())
 *   - vat_amt  = Math.round(total * 7 / 107)  ← VAT บาทเต็ม (สูตรเดียวกับ receipts)
 *   - subtotal = total - vat_amt              ← ฐานก่อน VAT (subtotal+vat=total เป๊ะ)
 *   - total/net = ยอดที่กรอก เป๊ะ → suggestInstallments แตกงวดลงตัว
 *   - wht=0, discount=0
 *   การ map ลง jobs: net_amount = subtotal (ก่อน VAT) ให้ trigger tg_calc_financials
 *   คิด vat/total_amount เอง — ห้ามส่ง net_amount=total (รวม VAT) จะโดนบวก VAT ซ้ำ
 *   computeTotals ไม่ใช้ใน flow นี้ (net ต้อง = ยอดกรอกเป๊ะเพื่อลูกโซ่วางบิล)
 */
export const POST = withRoute(async (req: Request) => {
  // ตรวจสิทธิ์: ADMIN/SALES เท่านั้นที่มี jobs:write
  const ctx = await requirePermission("jobs", "write");

  // ใช้ createClient() ตรงๆ (untyped) เพราะ ctx.supabase typed ด้วย Database ที่ไม่มี quotations/customers
  // (pattern เดียวกับ src/app/api/quotations/route.ts + src/app/api/billing-notes/route.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;
  const userId = ctx.user.id;

  const body = schema.parse(await req.json());
  const { job_id, total, ext_ref, ext_link, step } = body;
  const issue_date = body.issue_date || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  // 1) โหลด job — ต้อง active
  const { data: job, error: jErr } = await sb
    .from("jobs")
    .select("id, status, customer_id, customer_name, customer_area")
    .eq("id", job_id)
    .maybeSingle();
  if (jErr || !job) return err("ไม่พบงาน", 404);
  if (["COMPLETED", "CANCELLED"].includes(job.status as string))
    return err("งานนี้ปิดหรือยกเลิกแล้ว สร้างใบเสนอไม่ได้", 409);
  if (!job.customer_id)
    return err("งานนี้ยังไม่ผูกลูกค้า — กรุณาผูกลูกค้าก่อน", 422);

  // 2) snapshot ลูกค้า
  const { data: cust, error: cErr } = await sb
    .from("customers")
    .select("*")
    .eq("id", job.customer_id)
    .single();
  if (cErr || !cust) return err("ไม่พบลูกค้า", 404);
  const custTyped = cust as Customer;
  const snapshot = {
    name: custTyped.name, job: custTyped.job, address: custTyped.address, tax_id: custTyped.tax_id,
    line_id: custTyped.line_id, phone: custTyped.phone, contact_person: custTyped.contact_person,
  };

  // 3) สร้าง note มี marker เพื่อระบุว่าใบนี้มาจากเช็คลิสต์
  const noteRef   = ext_ref  ? `เลขนอกระบบ: ${ext_ref}` : "";
  const noteLink  = ext_link ? `ไฟล์: ${ext_link}` : "";
  const noteParts = [noteRef, noteLink].filter(Boolean).join(" | ");
  const note = noteParts
    ? `${CHECKLIST_MARKER} ${noteParts}`
    : CHECKLIST_MARKER;

  // 4) คำนวณยอด (ดูคอมเมนต์กฎเงินด้านบน — ห้ามเปลี่ยนโดยไม่แจ้ง accountant)
  // VAT inclusive: ถอด VAT บาทเต็มก่อน แล้วฐาน = total - vat → subtotal+vat_amt = total เป๊ะ
  const vat_amt  = Math.round((total * 7) / 107);
  const subtotal = total - vat_amt;

  // 5) idempotent — หาใบเช็คลิสต์ active ของงานนี้
  const { data: existing } = await sb
    .from("quotations")
    .select("id, code, status, note")
    .eq("job_id", job_id)
    .ilike("note", `${CHECKLIST_MARKER}%`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let quotation_id: number;
  let code: string;
  let currentStatus: string;

  if (existing?.id) {
    // อัปเดตใบเดิม
    const { data: upd, error: uErr } = await sb
      .from("quotations")
      .update({
        note,
        subtotal, vat_amt, vat_rate: 7,
        total, wht_amt: 0, net: total,
        discount_pct: 0, discount_amt: 0, wht_rate: 0,
        issue_date,
        customer_snapshot: snapshot,
      })
      .eq("id", existing.id)
      .select("id, code, status")
      .single();
    if (uErr || !upd) return err("อัปเดตใบเสนอไม่สำเร็จ: " + (uErr?.message ?? ""), 500);

    // อัปเดต item เดิม (ถ้ามี) หรือ insert ใหม่
    const { data: existItem } = await sb
      .from("quotation_items")
      .select("id")
      .eq("quotation_id", existing.id)
      .limit(1)
      .maybeSingle();
    if (existItem?.id) {
      await sb
        .from("quotation_items")
        .update({ name: "ใบเสนอราคา (ทำนอกระบบ)", detail: ext_ref ?? "", unit_price: subtotal, line_total: subtotal })
        .eq("id", existItem.id);
    } else {
      await sb.from("quotation_items").insert({
        quotation_id: existing.id,
        name: "ใบเสนอราคา (ทำนอกระบบ)",
        detail: ext_ref ?? "",
        qty: 1, unit_price: subtotal, line_total: subtotal, sort_order: 0,
      });
    }

    quotation_id  = upd.id;
    code          = upd.code;
    currentStatus = upd.status;
  } else {
    // ออกรหัสอัตโนมัติ
    const { data: newCode, error: codeErr } = await sb
      .rpc("next_document_code", { p_doc_type: "QT" });
    if (codeErr || !newCode) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

    // insert ใบเสนอเบา
    const { data: q, error: qErr } = await sb
      .from("quotations")
      .insert({
        code: newCode,
        customer_id: cust.id,
        job_id,
        customer_snapshot: snapshot,
        issue_date,
        status: "draft",
        vat_rate: 7, discount_pct: 0, wht_rate: 0,
        subtotal, discount_amt: 0, vat_amt,
        total, wht_amt: 0, net: total,
        note,
        created_by: userId,
      })
      .select("id, code")
      .single();
    if (qErr || !q) return err("บันทึกใบเสนอไม่สำเร็จ: " + (qErr?.message ?? ""), 500);

    // insert item 1 บรรทัด — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
    const { error: iErr } = await sb
      .from("quotation_items")
      .insert({
        quotation_id: q.id,
        name: "ใบเสนอราคา (ทำนอกระบบ)",
        detail: ext_ref ?? "",
        qty: 1, unit_price: subtotal, line_total: subtotal, sort_order: 0,
      });
    if (iErr) {
      await sb.from("quotations").delete().eq("id", q.id);
      return err("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
    }

    quotation_id  = q.id;
    code          = q.code;
    currentStatus = "draft";

    // เลื่อน stage งานไป 6 (best-effort)
    try {
      await sb.rpc("advance_stage", { p_job: job_id, p_to: 6, p_note: "สร้างใบเสนอ (เช็คลิสต์)" });
    } catch (e) {
      console.warn("[quotations/quick] advance_stage→6 failed (best-effort):", e);
    }
  }

  // step 2: ตั้ง status = 'sent' + อัปเดต job
  if (step === 2) {
    const { error: sErr } = await sb
      .from("quotations")
      .update({ status: "sent" })
      .eq("id", quotation_id);
    if (sErr) return err("อัปเดตสถานะส่งไม่สำเร็จ: " + sErr.message, 500);
    currentStatus = "sent";

    // อัปเดต job: quote_sent_date, status, net_amount(=ก่อน VAT)
    // net_amount = subtotal เท่านั้น — trigger tg_calc_financials จะคิด vat_amount/total_amount ให้เอง
    // (ห้ามส่ง total/total_amount เพราะ total รวม VAT แล้ว → trigger จะบวก VAT ซ้ำ ทำให้ stats เพี้ยน)
    const { error: jUpErr } = await sb
      .from("jobs")
      .update({
        quote_sent_date: issue_date || today,
        status: "QUOTE_SENT",
        net_amount: subtotal,
      })
      .eq("id", job_id);
    if (jUpErr) {
      console.warn("[quotations/quick] job update failed (non-fatal):", jUpErr.message);
    }

    // เลื่อน stage งานไป 7 (best-effort)
    try {
      await sb.rpc("advance_stage", { p_job: job_id, p_to: 7, p_note: "ส่งใบเสนอให้ลูกค้าแล้ว (เช็คลิสต์)" });
    } catch (e) {
      console.warn("[quotations/quick] advance_stage→7 failed (best-effort):", e);
    }
  }

  const statusCode = step === 1 && !existing ? 201 : 200;
  return ok({ quotation_id, code, status: currentStatus }, undefined, statusCode);
});
