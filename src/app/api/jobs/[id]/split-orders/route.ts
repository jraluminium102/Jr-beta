import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any; rpc: (fn: string, args: unknown) => any };

// โค้ด exception จาก RPC split_order_to_new_job (0129) → ข้อความไทยอ่านรู้เรื่อง
const BLOCK_MSG: Record<string, string> = {
  forbidden: "ไม่มีสิทธิ์แตกออเดอร์ (เฉพาะแอดมิน)",
  NOT_FOUND: "ไม่พบใบเสนอนี้",
  NO_JOB: "ใบเสนอนี้ยังไม่ผูกงาน ไม่มีอะไรต้องแตก",
  SINGLE_ORDER: "งานนี้มีออเดอร์เดียวอยู่แล้ว ไม่ต้องแตก",
  NO_CUSTOMER: "ใบเสนอนี้ไม่ได้ผูกลูกค้าในทะเบียน — ผูกลูกค้าให้ใบเสนอนี้ก่อนจึงแตกได้",
  HAS_UNLINKED_EXTERNAL_BILLING: "งานนี้มีใบวางบิลนอกระบบที่ยังไม่ผูกใบเสนอค้างอยู่ — ผูกใบเสนอให้บิลนั้นก่อนจึงแตกได้",
  RECEIPT_CROSS_ORDER: "พบใบเสร็จที่ผูกข้ามออเดอร์ (ผิดปกติ) — ต้องตรวจสอบมือก่อน แจ้งแอดมิน",
  AMBIGUOUS_DEPOSIT: "มีรายการรับเงินที่ยังไม่ผูกงวดบนงานเดิม และงานเดิมยังมีบิลของออเดอร์อื่น Active อยู่ — ระบุไม่ได้ว่าเงินนี้เป็นของออเดอร์ไหน ให้บัญชีผูกงวด/ตัดยอดมือก่อน",
  CONSERVATION_MISMATCH: "ยอดเงินก่อน/หลังแตกไม่ตรงกัน (ระบบยกเลิกอัตโนมัติ ไม่แตะข้อมูล) — แจ้งแอดมิน/บัญชีตรวจ ไม่ควรเกิดในเคสปกติ",
};

function mapRpcError(msg: string): { message: string; status: number } {
  const code = (msg ?? "").match(/^[A-Z_]+(?=:|$)/)?.[0] || (msg ?? "").match(/forbidden/)?.[0];
  if (code && BLOCK_MSG[code]) {
    const status = code === "forbidden" ? 403 : code === "NOT_FOUND" ? 404 : 409;
    return { message: BLOCK_MSG[code], status };
  }
  if (/split_order_to_new_job|does not exist|42883|schema cache/i.test(msg ?? "")) {
    return { message: "ยังไม่ได้รัน migration 0129 (แตกออเดอร์) — รัน supabase/migrations/0129_split_order_to_new_job.sql ก่อน", status: 400 };
  }
  // ไม่ตรงโค้ดที่รู้จัก → ไม่โชว์ error ดิบจาก Postgres ให้ผู้ใช้ (log ไว้ฝั่ง server แทน)
  console.error("[split-orders] unexpected RPC error:", msg);
  return { message: "แตกออเดอร์ไม่สำเร็จ (เกิดข้อผิดพลาดที่ไม่คาดคิด) — แจ้งแอดมิน", status: 400 };
}

// GET /api/jobs/[id]/split-orders — ADMIN: ดูออเดอร์ (quotations) ทั้งหมดใต้งานนี้ + บิล/มัดจำต่อออเดอร์
//   ใช้เลือกว่าจะ "แตก" ใบเสนอใบไหนออกเป็นงานใหม่
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("finance", "void");
  if (ctx.role !== "ADMIN") throw new HttpError(403, "เฉพาะแอดมินเปิดเครื่องมือนี้ได้");
  const sb = ctx.supabase as unknown as AnySb;
  const jobId = params.id;

  const { data: job, error: jErr } = await sb
    .from("jobs")
    .select("id, job_code, customer_name, customer_area, status, net_amount, vat_amount, total_amount")
    .eq("id", jobId)
    .maybeSingle();
  if (jErr) return err(jErr.message, 400);
  if (!job) return err("ไม่พบงานนี้", 404);

  const { data: quotations, error: qErr } = await sb
    .from("quotations")
    .select(`
      id, code, status, issue_date, total, net,
      billing_notes(id, code, status, total,
        billing_installments(id, seq, amount, paid_amount, status)
      )
    `)
    .eq("job_id", jobId)
    .order("id", { ascending: true });
  if (qErr) return err(qErr.message, 400);

  // รายการรับเงินที่ยังไม่ผูกงวด (RISK-B · รวมบันทึกมือทุก type ไม่ใช่แค่ auto-deposit) — เตือนล่วงหน้า
  const { data: unlinkedDeposits } = await sb
    .from("finance_entries")
    .select("id, amount, payment_date, type, is_auto_created")
    .eq("job_id", jobId)
    .eq("is_voided", false).is("billing_installment_id", null);

  // ใบวางบิลนอกระบบที่ยังไม่ผูกใบเสนอ (จะบล็อกการแตกทุกออเดอร์บนงานนี้)
  const { data: unlinkedExternalBilling } = await sb
    .from("billing_notes")
    .select("id, code, total")
    .eq("job_id", jobId).is("quotation_id", null).neq("status", "cancelled");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeCount = ((quotations ?? []) as any[]).filter((q) => q.status !== "cancelled").length;

  return ok({
    job,
    quotations: quotations ?? [],
    active_quotation_count: activeCount,
    can_split: activeCount > 1,
    unlinked_deposits: unlinkedDeposits ?? [],
    unlinked_external_billing: unlinkedExternalBilling ?? [],
  });
});

const Body = z.object({
  quotation_id: z.number().int().positive(),
  dry_run: z.boolean().optional().default(true),
});

// POST /api/jobs/[id]/split-orders — ADMIN: แตกออเดอร์ (quotation_id) ออกเป็นงานใหม่
//   dry_run=true (ค่าเริ่มต้น) = พรีวิวเท่านั้น ไม่แก้ข้อมูลจริง (RPC rollback ให้เอง)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("finance", "void");
  if (ctx.role !== "ADMIN") throw new HttpError(403, "เฉพาะแอดมินแตกออเดอร์ได้");
  const { quotation_id, dry_run } = Body.parse(await req.json().catch(() => ({})));
  const sb = ctx.supabase as unknown as AnySb;

  // กัน quotation_id ที่ไม่ได้อยู่ในงานตาม URL (audit trail ถูกต้อง + กัน stale state)
  const { data: q } = await sb.from("quotations").select("job_id").eq("id", quotation_id).maybeSingle();
  if (!q || q.job_id !== params.id) {
    return err("ใบเสนอนี้ไม่ได้อยู่ในงานที่เลือก (อาจถูกย้าย/รีเฟรชหน้าใหม่)", 409);
  }

  const { data, error } = await sb.rpc("split_order_to_new_job", {
    p_quotation_id: quotation_id,
    p_dry_run: dry_run,
  });
  if (error) {
    const m = mapRpcError(error.message || "");
    return err(m.message, m.status);
  }

  if (!dry_run) {
    await audit({
      jobId: params.id, userId: ctx.user.id, action: "JOB_SPLIT_ORDER",
      table: "jobs", recordId: params.id,
      oldValue: { quotation_id, old_job_id: params.id },
      newValue: data ?? {},
    });
  }

  return ok(data ?? {});
});
