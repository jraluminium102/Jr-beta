import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };

const schema = z.object({ reason: z.string().trim().min(1, "กรุณาระบุเหตุผลการถอยมัดจำ") });

// โค้ด exception จาก RPC → ข้อความไทย (บล็อกตามหลักบัญชี)
const BLOCK_MSG: Record<string, string> = {
  forbidden: "ไม่มีสิทธิ์ถอยมัดจำ (เฉพาะแอดมิน/บัญชี)",
  NOT_FOUND: "ไม่พบงานนี้",
  NOT_DEPOSITED: "งานนี้ยังไม่ได้มัดจำ (หรือถอยไปแล้ว)",
  HAS_RECEIPT: "งานนี้ออกใบเสร็จ/ใบกำกับภาษีแล้ว — ต้อง void ใบเสร็จที่หน้าเอกสารก่อน",
  HAS_BILLING: "งานนี้มีใบวางบิลแล้ว — ยกเลิกใบวางบิลก่อนจึงถอยมัดจำได้",
  HAS_OTHER_PAYMENT: "งานนี้มีการรับเงินงวดอื่นแล้ว — จัดการรายการเงินก่อนจึงถอยได้",
  HAS_STOCK_CUT: "งานนี้ตัดสต๊อก/ออกใบตัดไปแล้ว — คืนสต๊อก/ยกเลิกใบตัดก่อนจึงถอยได้",
  HAS_INSTALL_STARTED: "งานนี้เข้าขั้นติดตั้งแล้ว (มีนัด/ช่าง) — ถอยไม่ได้",
};

// POST /api/jobs/[id]/undeposit — ถอยมัดจำ + ลบออกจากผลิต (แอดมิน/บัญชี · void ไม่ลบ)
//   สิทธิ์ = finance:void (ADMIN/ACCOUNTING) เพราะ action นี้ void เงิน — ไม่ใช่แค่ jobs:write
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("finance", "void");
  const { reason } = schema.parse(await req.json());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const { data, error } = await sb.rpc("undeposit_job", { p_job: params.id, p_reason: reason });
  if (error) {
    const code = (error.message ?? "").match(/HAS_\w+|NOT_\w+|forbidden/)?.[0];
    if (code && BLOCK_MSG[code]) return err(BLOCK_MSG[code], code === "forbidden" ? 403 : code.startsWith("NOT_") ? 404 : 409);
    if (/undeposit_job|does not exist|42883|schema cache/i.test(error.message ?? ""))
      return err("ยังไม่ได้รัน migration 0112 (ถอยมัดจำ) — รัน supabase/migrations/0112_undeposit_job.sql ก่อน", 400);
    return err(error.message ?? "ถอยมัดจำไม่สำเร็จ", 400);
  }

  await audit({
    jobId: params.id, userId: ctx.user.id, action: "JOB_UNDEPOSIT",
    table: "jobs", recordId: params.id,
    oldValue: { status: "DEPOSITED", ...(data ?? {}) },
    newValue: { status: "QUOTE_SENT", current_stage: 7, reason },
  });
  return ok(data ?? {});
});
