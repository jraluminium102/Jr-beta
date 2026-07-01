import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

// PATCH /api/receipts/[id]/header — แก้หัวใบเสร็จ/ใบกำกับภาษี
// guard เข้ม (accountant): block ใบ void · บังคับเหตุผล · whitelist 6 field · audit เต็ม
// หมายเหตุภาษี: ถ้าส่งใบให้ลูกค้าแล้ว การแก้เลขภาษี/ตัวตนผู้ซื้อ ควร void แล้วออกใหม่
const SnapSchema = z.object({
  name: z.string().min(1, "ต้องระบุชื่อ"),
  job: z.string().optional().default(""),
  address: z.string().optional().default(""),
  tax_id: z.string().optional().default(""),
  branch: z.string().optional(),   // (0069) สำนักงานใหญ่/สาขา — แก้/คงสาขาได้ (identity ล้วน)
  kind: z.string().optional(),
  contact_person: z.string().optional().default(""),
  phone: z.string().optional().default(""),
}).strict();

const PatchSchema = z.object({
  snapshot: SnapSchema,
  reason: z.string().min(1, "ต้องระบุเหตุผลการแก้ไข"),
});

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { snapshot, reason } = parsed.data;

  const { data: rc, error: e } = await ctx.supabase
    .from("receipts")
    .select("id, is_voided, customer_snapshot")
    .eq("id", params.id)
    .single<{ id: number; is_voided: boolean | null; customer_snapshot: Record<string, unknown> }>();
  if (e || !rc) return notFound("ไม่พบใบเสร็จ");
  if (rc.is_voided) return err("ใบเสร็จนี้ถูกยกเลิกแล้ว — แก้ไขไม่ได้ (เป็นหลักฐาน)", 409);

  const oldSnap = rc.customer_snapshot ?? {};
  const newSnap = { ...oldSnap, ...snapshot };

  const { error: uErr } = await ctx.supabase
    .from("receipts")
    .update({ customer_snapshot: newSnap as never })
    .eq("id", params.id);
  if (uErr) return err(uErr.message, 500);

  await audit({
    userId: ctx.user.id,
    action: "EDIT_RECEIPT_HEADER",
    table: "receipts",
    recordId: params.id,
    oldValue: { customer_snapshot: oldSnap, reason },
    newValue: { customer_snapshot: newSnap },
  });

  return ok({ ok: true });
});
