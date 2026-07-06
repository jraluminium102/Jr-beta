import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

// PATCH /api/billing-notes/[id]/header — แก้หัวเอกสาร (ชื่อ/ที่อยู่ลูกค้า เผื่อออกในนามบริษัท)
// whitelist 6 field เท่านั้น (identity ล้วน) — ไม่แตะยอด/งวด/VAT (accountant)
const SnapSchema = z.object({
  name: z.string().min(1, "ต้องระบุชื่อ"),
  job: z.string().optional().default(""),
  address: z.string().optional().default(""),
  postal_code: z.string().optional(),   // (0077) รหัสไปรษณีย์
  tax_id: z.string().optional().default(""),
  branch: z.string().optional(),   // (0069) สำนักงานใหญ่/สาขา — แก้/คงสาขาได้ (identity ล้วน)
  kind: z.string().optional(),
  contact_person: z.string().optional().default(""),
  phone: z.string().optional().default(""),
}).strict();

const PatchSchema = z.object({ snapshot: SnapSchema, reason: z.string().optional() });

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { snapshot, reason } = parsed.data;

  const { data: bn, error: e } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, customer_snapshot")
    .eq("id", params.id)
    .single<{ id: number; status: string; customer_snapshot: Record<string, unknown> }>();
  if (e || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  // merge: คงคีย์เดิมอื่น (ถ้ามี) + ทับด้วย 6 คีย์ที่แก้
  const oldSnap = bn.customer_snapshot ?? {};
  const newSnap = { ...oldSnap, ...snapshot };

  const { error: uErr } = await ctx.supabase
    .from("billing_notes")
    .update({ customer_snapshot: newSnap as never })
    .eq("id", params.id);
  if (uErr) return err(uErr.message, 500);

  // (ผู้ใช้สั่ง 3 ก.ค.) หัวเอกสารต้องตรงกันทั้งสาย — แก้ใบวางบิล → ไหลไปใบเสร็จที่ออกจากใบนี้
  // ทับเฉพาะใบเสร็จที่ยังไม่ยกเลิก (merge คงคีย์เดิม) · ออกใบเสร็จใหม่ก็ก๊อป snapshot นี้อยู่แล้ว
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  let receiptsUpdated = 0;
  const { data: rcs } = await sb.from("receipts")
    .select("id, customer_snapshot")
    .eq("billing_note_id", bn.id)
    .eq("is_voided", false);
  if (Array.isArray(rcs)) {
    for (const rc of rcs) {
      const rcNew = { ...(rc.customer_snapshot ?? {}), ...snapshot };
      const { error: rErr } = await sb.from("receipts").update({ customer_snapshot: rcNew }).eq("id", rc.id);
      if (!rErr) receiptsUpdated++;
    }
  }

  await audit({
    userId: ctx.user.id,
    action: "EDIT_BILLING_HEADER",
    table: "billing_notes",
    recordId: params.id,
    oldValue: { customer_snapshot: oldSnap, reason: reason ?? null },
    newValue: { customer_snapshot: newSnap, receipts_synced: receiptsUpdated },
  });

  return ok({ ok: true, receipts_synced: receiptsUpdated });
});
