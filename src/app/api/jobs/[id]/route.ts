import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, notFound, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";
import { toArray } from "@/lib/bff/normalize";

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
  quote_sent_date: z.string().optional(),
  net_amount:     z.number().positive().optional(),
  discount_amount: z.number().min(0).optional(),
  designer_id:    z.string().uuid().nullish(),
  designer_ref:   z.number().int().nullable().optional(),
  design_due_date: z.string().nullable().optional(),
  design_start:   z.string().optional(),
  design_end:     z.string().optional(),
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
      .from("jobs").select("status").eq("id", params.id).single();
    const PRE_DEPOSIT = ["PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"];
    if (current && ["DEPOSITED", "COMPLETED"].includes(current.status) && PRE_DEPOSIT.includes(payload.status)) {
      return err("ย้อนสถานะกลับก่อนมัดจำไม่ได้ (งานมี Production/บัญชีผูกอยู่แล้ว)", 409);
    }

    const { data, error } = await ctx.supabase
      .from("jobs").update(payload as Record<string, unknown>).eq("id", params.id).select().single();
    if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Update failed" });
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
