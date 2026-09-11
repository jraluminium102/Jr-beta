import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, notFound, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";
import { toArray } from "@/lib/bff/normalize";
import { businessDateIssue } from "@/lib/date-guard";
import { createServiceClient } from "@/lib/supabase/admin";

const FINANCE_COLS = ["net_amount", "vat_amount", "total_amount", "deposit_amount", "discount_amount"];
type Params = { params: { id: string } };

// GET /api/jobs/:id — full detail
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("jobs", "read");
  const { data, error } = await ctx.supabase
    .from("jobs")
    .select("*, estimator:estimator_id(full_name), designer:designer_id(full_name), productions(*), installations(*), finance_entries(*), issues(*)")
    .eq("id", params.id)
    .single();
  if (error || !data) return notFound("ไม่พบงานนี้");

  const showFinance = can(ctx.role, "jobs:finance_fields", "read");
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  // 1:1 embeds → object เดี่ยว, normalize เป็น array ให้ตรงกับที่ frontend คาดหวัง
  out.productions = toArray(out.productions);
  out.installations = toArray(out.installations);
  if (!showFinance) {
    FINANCE_COLS.forEach((c) => delete out[c]);
    delete out.finance_entries;
  } else {
    out.finance_entries = ((out.finance_entries as unknown[]) ?? []).filter(
      (f) => !(f as Record<string, unknown>).is_voided
    );
  }
  return ok(out);
});

// status change (มัดจำ → DB trigger สร้าง Production + Finance)
const statusSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("DEPOSITED"),
    deposit_amount: z.number().positive("ระบุยอดมัดจำ"),
    deposit_date: z.string().min(1, "ระบุวันมัดจำ"),
  }),
  z.object({
    status: z.literal("CANCELLED"),
    cancel_reason: z.string().min(1, "ระบุเหตุผลยกเลิก"),
  }),
  z.object({ status: z.enum(["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION", "IN_PRODUCTION", "INSTALLING"]) }),
]);

const fieldsSchema = z.object({
  customer_tel:   z.string().optional(),
  customer_area:  z.string().optional(),
  // วันส่งใบเสนอ — ต้องเป็นวันจริง ไม่ใช่อนาคต ไม่ใช่ พ.ศ. (เดิมรับ string เปล่า)
  // ดู src/lib/date-guard.ts — ประวัติ: เคยมี 2026-12-06 หลุดเข้า DB เพราะไม่มีใครตรวจ
  quote_sent_date: z.string()
    .refine((s) => !businessDateIssue(s, { label: "วันที่ส่งใบเสนอ" }), (s) => ({
      message: businessDateIssue(s, { label: "วันที่ส่งใบเสนอ" }) ?? "วันที่ส่งใบเสนอไม่ถูกต้อง",
    }))
    .optional(),
  net_amount:     z.number().positive().optional(),
  discount_amount: z.number().min(0).optional(),
  designer_id:    z.string().uuid().nullish(),
  designer_ref:   z.number().int().nullable().optional(),
  design_due_date: z.string().nullable().optional(),
  design_received_date: z.string().nullable().optional(),
  design_state:   z.enum(["NOT_STARTED", "DRAWING", "PENDING_CUSTOMER", "REVISING", "DONE"]).optional(),
  design_start:   z.string().nullable().optional(),
  design_end:     z.string().nullable().optional(),
  remark:         z.string().optional(),
  on_hold:        z.boolean().optional(),
  on_hold_reason: z.string().nullish(),
});

// PATCH /api/jobs/:id
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("jobs", "write");
  const body = await req.json() as Record<string, unknown>;

  if ("status" in body) {
    const payload = statusSchema.parse(body);

    // กันย้อนสถานะหลังมัดจำ → กัน ghost Production/Finance record
    const { data: current } = await ctx.supabase
      .from("jobs").select("status, estimator_id").eq("id", params.id).single();
    const PRE_DEPOSIT = ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"];
    if (current && ["DEPOSITED", "IN_PRODUCTION", "INSTALLING", "COMPLETED"].includes(current.status) && PRE_DEPOSIT.includes(payload.status)) {
      return err("ย้อนสถานะกลับก่อนมัดจำไม่ได้ (งานมี Production/บัญชีผูกอยู่แล้ว)", 409);
    }

    // [0035] SALES ยกเลิกได้เฉพาะงานของตัวเอง (estimator_id = user.id) — กัน cross-cancel
    // ตรวจก่อน update เพื่อไม่ให้ข้อมูลถูกแก้แล้วค่อยตรวจ
    if (payload.status === "CANCELLED" && ctx.role === "SALES") {
      if (!current || current.estimator_id !== ctx.user.id) {
        return err("ไม่มีสิทธิ์ยกเลิกงานของเซลล์คนอื่น", 403);
      }
    }

    const { data, error } = await ctx.supabase
      .from("jobs").update(payload as Record<string, unknown>).eq("id", params.id).select().single();
    if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Update failed" });

    // ยกเลิกงาน → cascade ยกเลิกใบเสนอราคาที่ผูกอยู่ (เฉพาะ draft/sent; ข้าม approved ที่อาจมีบิล)
    if (payload.status === "CANCELLED") {
      await ctx.supabase
        .from("quotations")
        .update({ status: "cancelled" })
        .eq("job_id", params.id)
        .in("status", ["draft", "sent"]);

      // [0067] ยกเลิกคิวต้นทางด้วย → กัน cron auto-complete / promote "ปลุกงานกลับมา"
      // (ยกเลิก = อยู่ยกเลิกถาวร ไม่เด้งกลับ)
      const qid = (data as { queue_entry_id?: string | null }).queue_entry_id ?? null;
      if (qid) {
        await ctx.supabase.from("queue_entries").update({ status: "CANCELLED" }).eq("id", qid);
      }
    }

    await audit({
      jobId: params.id, userId: ctx.user.id, action: "STATUS_CHANGED",
      table: "jobs", recordId: params.id, newValue: { status: payload.status },
    });
    return ok(data);
  }

  const fields = fieldsSchema.parse(body);

  // Auto-deadline: when assigning designer_ref for the first time and no due date is provided,
  // set design_due_date = assess_date + 2 days (only if currently null in DB)
  const update: Record<string, unknown> = { ...fields };
  if (fields.designer_ref != null && fields.design_due_date === undefined) {
    const { data: cur } = await ctx.supabase
      .from("jobs")
      .select("designer_ref, design_due_date, assess_date")
      .eq("id", params.id)
      .single();
    if (cur && cur.designer_ref == null && !cur.design_due_date && cur.assess_date) {
      const due = new Date(cur.assess_date);
      due.setDate(due.getDate() + 2);
      update.design_due_date = due.toISOString().slice(0, 10);
    }
  }

  const { data, error } = await ctx.supabase
    .from("jobs").update(update).eq("id", params.id).select().single();
  if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Update failed" });
  return ok(data);
});

// DELETE /api/jobs/:id — ลบงานทิ้งถาวร (ADMIN เท่านั้น) เฉพาะงานว่าง (ไม่มีเอกสาร/เงินผูก)
//   ใช้ลบงานซ้ำ/junk เช่น placeholder จากปุ่ม "เพิ่มลูกค้านอกระบบ" ที่กดผิด
//   safety: งานที่มี ใบเสนอ/บิล/เงิน = ห้ามลบ (FK NO ACTION ในตาราง money/doc กันไว้อีกชั้น) → ให้ใช้ "ยกเลิกงาน" แทน
//   ตารางฝั่งผลิต (productions/ชุดงาน/ติดตั้ง/ใบปะหน้า/เอกสาร/แบบ/โน้ต) เป็น on delete cascade → ลบตามให้เอง
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("jobs", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะแอดมินลบงานได้", 403);

  const jobId = params.id;
  const { data: job } = await ctx.supabase.from("jobs").select("id, job_code, customer_name").eq("id", jobId).maybeSingle<{ id: string; job_code: string | null; customer_name: string | null }>();
  if (!job) return notFound("ไม่พบงานนี้");

  // guard: มีเอกสาร/เงินผูกอยู่ไหม (ใบเสนอ/บิล/เงิน) → ห้ามลบทิ้ง (กันข้อมูลการเงินหาย) ให้ยกเลิกแทน
  const [q, bn, fe] = await Promise.all([
    ctx.supabase.from("quotations").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    ctx.supabase.from("billing_notes").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    ctx.supabase.from("finance_entries").select("id", { count: "exact", head: true }).eq("job_id", jobId),
  ]);
  const docs = (q.count ?? 0) + (bn.count ?? 0) + (fe.count ?? 0);
  if (docs > 0) {
    return err('งานนี้มีเอกสาร/เงินผูกอยู่ (ใบเสนอ/บิล/ใบเสร็จ) — ลบทิ้งถาวรไม่ได้ ให้ใช้ "ยกเลิกงาน" แทน (ซ่อนจากผลิต แต่เก็บประวัติไว้)', 409);
  }

  // ลบผ่าน service client (jobs ไม่มี RLS DELETE policy) — one statement, cascade ฝั่งผลิตอัตโนมัติ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;
  const { error: delErr } = await svc.from("jobs").delete().eq("id", jobId);
  if (delErr) {
    // FK NO ACTION (23503) = ยังมีข้อมูลผูก (เงิน/ใบตัด/สต๊อก/BOQ/คิวประเมิน ฯลฯ) → เมสเสจอ่านง่าย
    if (String(delErr.code) === "23503") {
      return err('ลบไม่ได้ — งานนี้ยังมีข้อมูลผูกอยู่ (เงิน/ใบตัด/สต๊อก/คิวประเมิน) ให้ใช้ "ยกเลิกงาน" แทน', 409);
    }
    throw dbError(delErr);
  }

  await audit({
    jobId: null, userId: ctx.user.id, action: "JOB_DELETED",
    table: "jobs", recordId: jobId,
    oldValue: { job_code: job.job_code, customer_name: job.customer_name, by: ctx.user.email },
  });
  return ok({ deleted: true, job_id: jobId });
});
