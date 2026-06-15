import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

// POST /api/jobs/[id]/deposit-amount
// ใส่ยอดมัดจำย้อนหลังสำหรับงาน "มัดจำเบา" (status=DEPOSITED แต่ deposit_amount=null)
// สร้าง finance_entry (DEPOSIT) ถ้ายังไม่มี — ลอก field/ค่าจาก tg_on_deposit (0015)
//   channel='TRANSFER', type='DEPOSIT', is_auto_created=true, note='มัดจำ (auto)'
//
// [ACCOUNTANT]: จุดตรวจ —
//   1. amount ที่บันทึกลง finance_entry = ยอดมัดจำที่ user กรอก ไม่บวก VAT ไม่ปรับค่าใด
//   2. idempotent check: เช็ค exists DEPOSIT is_auto_created=true is_voided=false ก่อน insert
//      (เหมือน trigger เดิม) — ถ้ามีแล้วคืน 409 กัน double-record
//   3. channel default = 'TRANSFER' (ตรงกับ trigger เดิม); user เลือก CASH/CHEQUE ได้

type Params = { params: { id: string } };

const schema = z.object({
  amount: z.number().int().positive("ระบุยอดมัดจำ (บาท)"),
  date: z.string().min(1, "ระบุวันมัดจำ"),
  // channel default TRANSFER — ตรงกับ tg_on_deposit ที่ใช้ 'TRANSFER' เป็น default
  method: z.enum(["TRANSFER", "CASH", "CHEQUE"]).default("TRANSFER"),
});

export const POST = withRoute(async (req: Request, { params }: Params) => {
  // สิทธิ์: jobs write — เหมือน PATCH /api/jobs/[id] ตอนมัดจำ
  const ctx = await requirePermission("jobs", "write");

  const body = schema.parse(await req.json());
  const { amount, date, method } = body;

  // 1) โหลด job — ต้อง status=DEPOSITED เท่านั้น
  const { data: job, error: jobErr } = await ctx.supabase
    .from("jobs")
    .select("id, status, deposit_amount")
    .eq("id", params.id)
    .single();

  if (jobErr || !job) return err("ไม่พบงานนี้", 404);

  if (job.status !== "DEPOSITED") {
    return err(
      `งานนี้ยังไม่ได้มัดจำ (status: ${job.status}) — ใช้ flow มัดจำปกติที่หน้างาน`,
      409
    );
  }

  // 2) idempotent guard — เช็คว่ามี finance_entry DEPOSIT อยู่แล้วหรือไม่
  //    [FIX]: ตัด is_auto_created ออก → กัน double-record ทั้ง manual DEPOSIT (is_auto_created=false)
  //    และ auto DEPOSIT (is_auto_created=true) — ตรงกับ guard ของ /api/finance POST
  //    [ACCOUNTANT]: ถ้ามีแล้ว → err 409 ให้ void รายการเดิมก่อนแล้วสร้างใหม่
  const { count: existingCount, error: countErr } = await ctx.supabase
    .from("finance_entries")
    .select("id", { count: "exact", head: true })
    .eq("job_id", params.id)
    .eq("type", "DEPOSIT")
    .eq("is_voided", false);

  if (countErr) throw dbError(countErr);

  if ((existingCount ?? 0) > 0) {
    return err(
      "งานนี้มีรายการมัดจำอยู่แล้ว — หากต้องการแก้ไข ให้ void รายการเดิมก่อนแล้วสร้างใหม่",
      409
    );
  }

  // 3) update jobs.deposit_amount + deposit_date
  const { data: updatedJob, error: updateErr } = await ctx.supabase
    .from("jobs")
    .update({ deposit_amount: amount, deposit_date: date })
    .eq("id", params.id)
    .select()
    .single();

  if (updateErr || !updatedJob) throw dbError(updateErr ?? { message: "Update failed" });

  // 4) สร้าง finance_entry (DEPOSIT)
  //    [ACCOUNTANT]: field ทุกตัวลอกจาก tg_on_deposit บรรทัด 84 (0015_journey_stage_sync.sql)
  //    channel = method (user เลือก, default TRANSFER ตรงกับ trigger)
  //    is_auto_created = true (เหมือน trigger สร้าง)
  //    note = 'มัดจำ (auto)' — ตรงกับ trigger
  //    payment_date = date ที่ user กรอก (ไม่ใช่ now())
  //    amount = ยอดที่ user กรอก ไม่บวก VAT ไม่ปรับค่าใด
  const { data: financeEntry, error: financeErr } = await ctx.supabase
    .from("finance_entries")
    .insert({
      job_id: params.id,
      payment_date: date,
      amount: amount,
      type: "DEPOSIT",
      channel: method,
      note: "มัดจำ (auto)",
      is_auto_created: true,
    })
    .select()
    .single();

  // [FIX atomic safety]: ถ้า insert finance_entry ล้ม → rollback jobs กลับเป็น null/null
  //   กัน state พัง: job มี deposit_amount แต่ไม่มี finance_entry
  if (financeErr || !financeEntry) {
    await ctx.supabase
      .from("jobs")
      .update({ deposit_amount: null, deposit_date: null })
      .eq("id", params.id);
    throw dbError(financeErr ?? { message: "Insert finance_entry failed" });
  }

  await audit({
    jobId: params.id,
    userId: ctx.user.id,
    action: "DEPOSIT_AMOUNT_SET",
    table: "jobs",
    recordId: params.id,
    newValue: { deposit_amount: amount, deposit_date: date, finance_entry_id: financeEntry.id },
  });

  return ok(updatedJob);
});
