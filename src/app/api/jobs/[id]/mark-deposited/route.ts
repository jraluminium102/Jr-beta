import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

type Params = { params: { id: string } };

// POST /api/jobs/[id]/mark-deposited
// "มัดจำเบา" — มาร์คว่าลูกค้ามัดจำแล้ว โดย "ยังไม่ใส่ยอด" → ผลักงานเข้า production ทันที
// ใช้กรณีอยากดันงานเข้าระบบผลิตเร็ว ๆ ก่อนรู้ยอด (ใส่ยอดทีหลังที่ปุ่ม "ใส่ยอดมัดจำ")
//
// set status=DEPOSITED + deposit_date (deposit_amount คงเป็น null)
// → trigger tg_on_deposit สร้าง production PENDING_MEASURE + stage 9
//   และ "ข้าม" การสร้าง finance entry เพราะ deposit_amount เป็น null (ดู 0015)
const schema = z.object({
  date: z.string().optional(), // วันมัดจำ (default วันนี้)
});

const PRE_DEPOSIT = ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"];

export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("jobs", "write");
  const body = schema.parse(await req.json().catch(() => ({})));
  const date = body.date || new Date().toISOString().slice(0, 10);

  // โหลดสถานะปัจจุบัน — มัดจำเบาได้เฉพาะงานก่อนมัดจำ (กันทับงานที่เข้าผลิต/มัดจำแล้ว)
  const { data: current } = await ctx.supabase
    .from("jobs").select("status").eq("id", params.id).single();
  if (!current) return err("ไม่พบงาน", 404);
  if (!PRE_DEPOSIT.includes(current.status as string)) {
    return err(`งานนี้สถานะ "${current.status}" — มัดจำเบาได้เฉพาะงานก่อนมัดจำ`, 409);
  }

  // set DEPOSITED + วันมัดจำ · ไม่ใส่ deposit_amount (null) → trigger สร้าง production แต่ข้าม finance
  const { data, error } = await ctx.supabase
    .from("jobs")
    .update({ status: "DEPOSITED", deposit_date: date })
    .eq("id", params.id)
    .select()
    .single();
  if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Update failed" });

  await audit({
    jobId: params.id, userId: ctx.user.id, action: "MARK_DEPOSITED_LIGHT",
    table: "jobs", recordId: params.id, newValue: { status: "DEPOSITED", deposit_date: date, deposit_amount: null },
  });
  return ok(data);
});
