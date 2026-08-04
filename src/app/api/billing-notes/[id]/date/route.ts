import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { businessDateIssue } from "@/lib/date-guard";
import { getTaxLockBefore } from "@/lib/doc-cutoff";
import { nextDocumentCode, parseCodeMonth, beMonthOf } from "@/lib/doc-code";

// PATCH /api/billing-notes/[id]/date — แก้วันที่ออกใบวางบิล
//   BL ไม่ใช่เอกสารภาษี (accountant, ก.ค.69) → แก้วันที่/เลขได้ยืดหยุ่นกว่าใบเสร็จ
//
//   เดือน/ปีเดิม (ตามเลขที่ออกจริง — parse จาก code เป็นหลัก เพราะ issue_date เดิมอาจไม่ตรงเลขจากบั๊กต้นตอที่ปิดในรอบนี้)
//     = เดือนใหม่ → แก้ issue_date เฉยๆ ไม่แตะเลข
//     ≠ เดือนใหม่ → renumber (ออกเลขใหม่ตามเดือนของวันที่ใหม่) เลขเดิมกลายเป็น gap (ยอมรับได้สำหรับ BL — ไม่ใช่เอกสารภาษี)
//
//   guard: cancelled/paid → reject · มีใบเสร็จผูกอยู่ (ยังไม่ void) → reject (ต้องจัดการใบเสร็จก่อน กันวันที่ไม่ตรงกัน)
//          tax-lock → reject ถ้า backdate ก่อนวันล็อก (ยื่นภาษีปิดเดือนแล้ว)
const PatchSchema = z.object({ issue_date: z.string() });

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const newDate = parsed.data.issue_date;

  // BL ไม่ใช่เอกสารภาษี — อนุญาตวันในอนาคตได้ (นัดออกล่วงหน้า) แต่ยังกัน พ.ศ./วันที่ไม่มีจริง/เก่าเกินไป
  const dateIssue = businessDateIssue(newDate, { allowFuture: true, label: "วันที่ออก" });
  if (dateIssue) return err(dateIssue, 400);

  const { data: bn, error: e } = await ctx.supabase
    .from("billing_notes")
    .select("id, code, issue_date, status")
    .eq("id", params.id)
    .single<{ id: number; code: string; issue_date: string; status: string }>();
  if (e || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว — แก้วันที่ไม่ได้", 409);
  if (bn.status === "paid") return err("ใบวางบิลนี้ชำระครบแล้ว — แก้วันที่ไม่ได้", 409);

  // มีใบเสร็จผูกอยู่ (ยังไม่ void) → ต้องจัดการใบเสร็จก่อน (กันวันที่บิล/ใบเสร็จไม่สอดคล้องกัน)
  const { data: activeRc } = await ctx.supabase
    .from("receipts")
    .select("id, code")
    .eq("billing_note_id", bn.id)
    .eq("is_voided", false)
    .limit(1);
  if ((activeRc ?? []).length > 0) {
    const rcCode = (activeRc as { id: number; code: string }[])[0].code;
    return err(`มีใบเสร็จ ${rcCode} ผูกกับบิลนี้อยู่ — ต้องจัดการใบเสร็จก่อนจึงแก้วันที่บิลได้`, 409);
  }

  // tax-lock — กัน backdate เข้าเดือนที่ยื่นภาษีปิดแล้ว
  const lockBefore = await getTaxLockBefore();
  if (lockBefore && newDate < lockBefore) {
    return err(`วันที่ก่อน ${lockBefore} ถูกล็อกแล้ว (ยื่นภาษีปิดเดือนนั้นแล้ว) — แก้ไม่ได้`, 409);
  }

  if (newDate === bn.issue_date) return ok({ code: bn.code, issue_date: bn.issue_date }); // ไม่เปลี่ยน

  // เดือน/ปีของเลขเดิม — parse จาก code (แหล่งจริงที่นับไปแล้ว) · parse ไม่ได้ (code รูปแบบเก่า) → fallback issue_date เดิม
  const oldMonth = parseCodeMonth(bn.code) ?? beMonthOf(bn.issue_date);
  const newMonth = beMonthOf(newDate);
  const sameMonth = oldMonth.yearBe === newMonth.yearBe && oldMonth.month === newMonth.month;

  if (sameMonth) {
    const { error: uErr } = await ctx.supabase.from("billing_notes").update({ issue_date: newDate }).eq("id", bn.id);
    if (uErr) return err(uErr.message, 500);

    await audit({
      userId: ctx.user.id, action: "EDIT_BILLING_DATE", table: "billing_notes", recordId: params.id,
      oldValue: { code: bn.code, issue_date: bn.issue_date },
      newValue: { code: bn.code, issue_date: newDate },
    });
    return ok({ code: bn.code, issue_date: newDate });
  }

  // ข้ามเดือน — ออกเลขใหม่ตามเดือนของวันที่ใหม่ (เลขเดิมกลายเป็น gap — ยอมรับได้สำหรับ BL)
  const { code: newCode, error: codeErr } = await nextDocumentCode(ctx.supabase, "BL", newDate);
  if (!newCode) return err("ออกเลขใหม่ไม่สำเร็จ: " + (codeErr ?? ""), 500);

  const { error: uErr } = await ctx.supabase
    .from("billing_notes")
    .update({ code: newCode, issue_date: newDate })
    .eq("id", bn.id);
  if (uErr) return err(uErr.message, 500);

  await audit({
    userId: ctx.user.id, action: "EDIT_BILLING_DATE_RENUMBER", table: "billing_notes", recordId: params.id,
    oldValue: { code: bn.code, issue_date: bn.issue_date },
    newValue: { code: newCode, issue_date: newDate },
  });

  return ok({ code: newCode, issue_date: newDate });
});
