import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { businessDateIssue } from "@/lib/date-guard";
import { getTaxLockBefore } from "@/lib/doc-cutoff";
import { parseCodeMonth, beMonthOf } from "@/lib/doc-code";

// PATCH /api/receipts/[id]/date — แก้วันที่ออกใบเสร็จ/ใบกำกับภาษี
//   INV = เอกสารภาษี (accountant, ก.ค.69) — วันที่ = tax point · เลขห้ามเปลี่ยนหลังออก
//   แก้ได้เฉพาะ "เดือนเดิม" (เดือนที่เลขนี้ถูกนับจริง — parse จาก code) เท่านั้น
//   ข้ามเดือน → reject เสมอ (ต้องยกเลิกใบนี้แล้วออกใหม่ — ปุ่มยกเลิก + ออกใหม่)
//   บังคับ reason ทุกครั้ง (เอกสารภาษีแก้ย้อนหลัง ต้องมีเหตุผลไว้ตรวจสอบ)
const PatchSchema = z.object({
  issue_date: z.string(),
  reason: z.string().min(1, "ต้องระบุเหตุผลการแก้ไข"),
});

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { issue_date: newDate, reason } = parsed.data;

  // ใบกำกับภาษี — ห้ามวันในอนาคต (default allowFuture=false)
  const dateIssue = businessDateIssue(newDate, { label: "วันที่ออก" });
  if (dateIssue) return err(dateIssue, 400);

  const { data: rc, error: e } = await ctx.supabase
    .from("receipts")
    .select("id, code, issue_date, is_voided")
    .eq("id", params.id)
    .single<{ id: number; code: string; issue_date: string; is_voided: boolean | null }>();
  if (e || !rc) return notFound("ไม่พบใบเสร็จ");
  if (rc.is_voided) return err("ใบเสร็จนี้ถูกยกเลิกแล้ว — แก้ไขไม่ได้ (เป็นหลักฐาน)", 409);

  // tax-lock — กัน backdate เข้าเดือนที่ยื่นภาษีปิดแล้ว
  const lockBefore = await getTaxLockBefore();
  if (lockBefore && newDate < lockBefore) {
    return err(`วันที่ก่อน ${lockBefore} ถูกล็อกแล้ว (ยื่นภาษีปิดเดือนนั้นแล้ว) — แก้ไม่ได้`, 409);
  }

  if (newDate === rc.issue_date) return ok({ issue_date: rc.issue_date });

  // เดือน/ปีของเลขที่ออกจริง — parse จาก code (แหล่งจริง) · parse ไม่ได้ (code รูปแบบเก่า) → fallback issue_date เดิม
  const codeMonth = parseCodeMonth(rc.code) ?? beMonthOf(rc.issue_date);
  const newMonth = beMonthOf(newDate);
  const sameMonth = codeMonth.yearBe === newMonth.yearBe && codeMonth.month === newMonth.month;

  if (!sameMonth) {
    return err(
      "ใบกำกับภาษีเปลี่ยนเดือน/เลขไม่ได้ — ต้องยกเลิกใบนี้แล้วออกใหม่ (ปุ่มยกเลิก + ออกใหม่)",
      409
    );
  }

  const { error: uErr } = await ctx.supabase.from("receipts").update({ issue_date: newDate }).eq("id", rc.id);
  if (uErr) return err(uErr.message, 500);

  // sync วันที่ finance ledger ให้ตรงวันรับเงินจริง (same-month → VAT period ไม่ขยับ · แค่กัน ledger เหลื่อมวัน)
  //   best-effort: ไม่ให้ล้มการแก้วันที่ (ซึ่งสำเร็จแล้ว) ถ้า sync พลาด
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  await sb.from("finance_entries").update({ payment_date: newDate }).eq("receipt_id", rc.id).eq("is_voided", false);

  await audit({
    userId: ctx.user.id, action: "EDIT_RECEIPT_DATE", table: "receipts", recordId: params.id,
    oldValue: { issue_date: rc.issue_date, reason },
    newValue: { issue_date: newDate },
  });

  return ok({ issue_date: newDate });
});
