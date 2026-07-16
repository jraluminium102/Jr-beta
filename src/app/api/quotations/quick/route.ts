import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types"; // ใช้สำหรับ cast ผล .single() ที่เป็น any
import { CHECKLIST_MARKER } from "@/lib/checklist-marker";
import { businessDateIssue } from "@/lib/date-guard";

export const dynamic = "force-dynamic";

const schema = z.object({
  job_id:     z.string().uuid("job_id ต้องเป็น UUID"),
  total:      z.number().min(0, "ยอดรวมต้องไม่ติดลบ"),  // รองรับทศนิยม (สตางค์) · 0 = mark ส่งแล้วโดยยังไม่ระบุยอด
  ext_ref:    z.string().optional(),
  ext_link:   z.string().optional(),
  // วันส่งใบเสนอ — ต้องเป็นวันจริง ไม่ใช่อนาคต ไม่ใช่ พ.ศ. (เดิมรับ string เปล่า → 2026-12-06 หลุดเข้า DB)
  issue_date: z.string()
    .refine((s) => !businessDateIssue(s, { label: "วันที่ส่งใบเสนอ" }), (s) => ({
      message: businessDateIssue(s, { label: "วันที่ส่งใบเสนอ" }) ?? "วันที่ส่งใบเสนอไม่ถูกต้อง",
    }))
    .optional(),
  step:       z.union([z.literal(1), z.literal(2)]),
  vat_rate:   z.union([z.literal(0), z.literal(7)]).optional().default(7),
});

/**
 * POST /api/quotations/quick
 *
 * สร้าง "ใบเสนอราคาแบบเบา" (checklist flow) ที่ไม่ผ่าน calculator
 *
 * กฎเงิน (accountant ตรวจแล้ว):
 *   ผู้ใช้กรอก total = ราคาที่ลูกค้าเห็น รองรับทศนิยม 2 ตำแหน่ง (สตางค์)
 *
 *   กรณี VAT 7% (vat_rate=7, default):
 *     total = ยอดรวม VAT แล้ว (inclusive)
 *     vat_amt  = round2(total * 7 / 107)  ← ถอด VAT ออกจากยอด inclusive
 *     subtotal = round2(total - vat_amt)   ← ฐานก่อน VAT (subtotal + vat_amt = total เป๊ะ)
 *
 *   กรณีไม่คิด VAT (vat_rate=0):
 *     total = ยอดที่ลูกค้าจ่าย (ไม่มี VAT)
 *     vat_amt  = 0
 *     subtotal = total                      ← ฐาน = ยอดทั้งหมด
 *
 *   การ map ลง jobs: ส่ง net_amount = subtotal (ฐานก่อน VAT) + ส่ง vat_rate แยกเป็น field
 *     trigger tg_calc_financials จะคิด vat_amount/total_amount เอง
 *     ต้องส่ง vat_rate ด้วยเสมอ ไม่งั้น no-VAT โดน trigger บวก 7% ซ้ำ
 *     (ห้ามส่ง total ลง net_amount เพราะ total รวม VAT แล้ว → trigger จะบวกซ้ำ)
 *   - wht=0, discount=0
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
  const { job_id, ext_ref, ext_link, step, vat_rate } = body;
  const total = Math.round(body.total * 100) / 100; // ปัดทศนิยม 2 ตำแหน่ง (สตางค์) กัน float artifact
  const issue_date = body.issue_date || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  // 1) โหลด job — ต้อง active
  const { data: job, error: jErr } = await sb
    .from("jobs")
    .select("id, status, customer_id, customer_name, customer_area, design_revise_count, quote_sent_date")
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

  // ใช้ "นามหลัก" ของลูกค้าถ้ามี (สอดคล้องกับใบเสนอปกติ + ได้ branch) · ไม่มี → ข้อมูลลูกค้า
  const { data: dp } = await sb.from("billing_profiles")
    .select("bill_name,address,tax_id,branch,kind,contact_person,phone")
    .eq("customer_id", custTyped.id).eq("is_default", true).eq("is_active", true).maybeSingle();
  const p = dp as { bill_name: string; address: string; tax_id: string; branch: string; kind: string; contact_person: string; phone: string } | null;
  const snapshot = p ? {
    name: p.bill_name, job: custTyped.job, address: p.address, tax_id: p.tax_id,
    branch: p.branch, kind: p.kind, line_id: custTyped.line_id,
    phone: p.phone || custTyped.phone, contact_person: p.contact_person || custTyped.contact_person,
  } : {
    name: custTyped.name, job: custTyped.job, address: custTyped.address, tax_id: custTyped.tax_id,
    kind: "INDIVIDUAL", line_id: custTyped.line_id, phone: custTyped.phone, contact_person: custTyped.contact_person,
  };

  // 3) สร้าง note มี marker เพื่อระบุว่าใบนี้มาจากเช็คลิสต์
  const noteRef   = ext_ref  ? `เลขนอกระบบ: ${ext_ref}` : "";
  const noteLink  = ext_link ? `ไฟล์: ${ext_link}` : "";
  const noteParts = [noteRef, noteLink].filter(Boolean).join(" | ");
  const note = noteParts
    ? `${CHECKLIST_MARKER} ${noteParts}`
    : CHECKLIST_MARKER;

  // 4) คำนวณยอด (ดูคอมเมนต์กฎเงินด้านบน — ห้ามเปลี่ยนโดยไม่แจ้ง accountant)
  // VAT 7%: ถอด VAT จากยอด inclusive → subtotal+vat_amt = total เป๊ะ
  // no-VAT (vat_rate=0): vat_amt=0, subtotal=total
  const vat_amt  = vat_rate > 0 ? Math.round((total * vat_rate) / (100 + vat_rate) * 100) / 100 : 0;
  const subtotal = Math.round((total - vat_amt) * 100) / 100; // 2 ตำแหน่ง · subtotal+vat=total เป๊ะ

  // 5) idempotent — หาใบล่าสุดของงานนี้ (ใบเบา checklist หรือ ใบจริงจากเครื่องคิดราคา/ฟอร์ม)
  // เดิมกรองเฉพาะใบมาร์คเกอร์ → ไม่เจอใบเครื่องคิดราคา เลยสร้างใบเบาซ้ำ · ตอนนี้จับใบล่าสุดทุกชนิด
  const { data: existing } = await sb
    .from("quotations")
    .select("id, code, status, note, subtotal, vat_rate")
    .eq("job_id", job_id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ใบจริง (จากเครื่องคิดราคา/ฟอร์ม) = ไม่มีมาร์คเกอร์ → ห้ามทับรายการ/ยอด/note แค่ promote สถานะ (กันลบรายละเอียดจริง)
  const existingIsReal = !!existing?.id && !String(existing.note ?? "").startsWith(CHECKLIST_MARKER);

  let quotation_id: number;
  let code: string;
  let currentStatus: string;

  if (existingIsReal) {
    // ใบจริงมีอยู่แล้ว → ใช้ใบนี้ ไม่แตะรายการ/ยอด/note (คงใบเครื่องคิดราคาไว้ครบ)
    quotation_id  = existing.id;
    code          = existing.code;
    currentStatus = existing.status;
  } else if (existing?.id) {
    // อัปเดตใบเดิม
    const { data: upd, error: uErr } = await sb
      .from("quotations")
      .update({
        note,
        subtotal, vat_amt, vat_rate,
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
        vat_rate, discount_pct: 0, wht_rate: 0,
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

    // อัปเดต job: quote_sent_date, status, net_amount(=ก่อน VAT), vat_rate
    // net_amount = subtotal เท่านั้น — trigger tg_calc_financials จะคิด vat_amount/total_amount ให้เอง
    // ต้องส่ง vat_rate ด้วยเสมอ เพราะ trigger ใหม่ยิงเมื่อ vat_rate เปลี่ยนด้วย
    // (ห้ามส่ง total/total_amount เพราะ total รวม VAT แล้ว → trigger จะบวก VAT ซ้ำ ทำให้ stats เพี้ยน)
    // total=0 (mark ส่งแล้วโดยยังไม่ระบุยอด) → ไม่เซ็ต net_amount/vat_rate (กันเขียนทับ/ใส่ 0) ใส่ทีหลังตอนแก้ยอด
    // ⚠️ วันส่งใบเสนอ: ถ้างานนี้ "เคยส่งแล้ว" ห้ามทับด้วยวันที่กดปุ่ม เว้นแต่ผู้ใช้ตั้งใจส่งวันใหม่มา
    //
    // บั๊กจริง (พบ 16 ก.ค. 2569 — ตรวจ 185 งาน เจอ 29 งานวันส่งเพี้ยน 25 งานเป็นวันเดียวกันหมด):
    //   modal ตั้งค่าเริ่มต้นเป็น "วันนี้" เสมอ → เจ้าของไล่กด "ส่งแล้ว" งานเก่า 25 งานรวดเดียว
    //   เมื่อ 16 มิ.ย. → วันส่งจริงของทั้ง 25 งานถูกทับเป็น 2026-06-16 หมด (ไม่มีใครเตือน)
    //   ยืนยัน: ทุกงานที่เพี้ยน วันใน DB "ใหม่กว่า" วันที่จดไว้ใน remark เสมอ ไม่มีเก่ากว่าเลยสักงาน
    //
    // กติกาใหม่: ส่ง issue_date มา = ตั้งใจ → ใช้ค่านั้น · ไม่ส่งมา = คงของเดิม (มีแล้วไม่แตะ)
    // คู่กับหน้าเว็บที่ตั้งค่าเริ่มต้นเป็น "วันส่งเดิม" แทน "วันนี้" (QuotationChecklistClient)
    const prevSent = (job as { quote_sent_date: string | null }).quote_sent_date;
    const jobUpdate: Record<string, unknown> = {
      quote_sent_date: body.issue_date ?? prevSent ?? today,
      status: "QUOTE_SENT",
      // snapshot รอบแก้แบบ ณ ตอนส่งใบเสนอ — ใช้ตรวจ "แก้แบบหลังเสนอ" แบบแม่นยำ (0047)
      // ส่งใบใหม่หลังแก้ → ค่านี้ตามทัน design_revise_count → งานหลุดออกจากเช็คลิสต์เอง
      quoted_revise_count: (job as { design_revise_count: number | null }).design_revise_count ?? 0,
    };
    // ใบจริง → ใช้ยอดก่อน VAT + vat_rate ของใบเอง (ไม่ใช่ยอดที่กรอกใน modal ซึ่งไม่ได้แก้ใบจริง)
    // ใบเบา → ใช้ยอดที่กรอก (total>0)
    if (existingIsReal) {
      // ⚠ ยอดกับอัตราต้องมาจาก "แหล่งเดียวกัน" ห้ามไขว้ (audit 16 ก.ค.69 — ฝาแฝดบั๊ก vat_rate ตัวล่าง):
      //   ใบ import เก่า subtotal=0 (default) แต่ vat_rate=7 (default 0005) → เดิมยอดตกไปใช้ของ modal
      //   แต่อัตราใช้ของใบ (7 ที่ไม่ใช่การตัดสินใจจริง) → trigger tg_calc_financials บวก VAT 7% ทับยอดที่รวมแล้ว
      const hasRealSubtotal = Number(existing.subtotal) > 0;
      if (hasRealSubtotal) {
        jobUpdate.net_amount = Number(existing.subtotal);
        // ?? ไม่ใช่ || — vat_rate = 0 (ใบไม่มี VAT) เป็น falsy → || จะตกไปใช้ default 7 (บัญชี P0)
        jobUpdate.vat_rate = Number(existing.vat_rate ?? vat_rate);
      } else {
        // ใบไม่มียอดแยกจริง → ใช้ยอด+อัตราจาก modal คู่กันทั้งชุด
        jobUpdate.net_amount = subtotal;
        jobUpdate.vat_rate = vat_rate;
      }
    } else if (total > 0) {
      jobUpdate.net_amount = subtotal;
      jobUpdate.vat_rate = vat_rate;
    }
    const { error: jUpErr } = await sb
      .from("jobs")
      .update(jobUpdate)
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
