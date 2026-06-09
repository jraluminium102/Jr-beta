import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import type { SupabaseClient } from "@supabase/supabase-js";

const VoidSchema = z.object({
  reason: z.string().min(1, "ต้องระบุเหตุผล"),
});

// POST /api/billing-notes/[id]/void — ยกเลิกใบวางบิล
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "void");

  const body = await req.json().catch(() => ({}));
  const parsed = VoidSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { reason } = parsed.data;

  const bnId = params.id;

  // 1) ดึงใบวางบิล + งวด
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, billing_installments(id)")
    .eq("id", bnId)
    .single<{ id: number; status: string; billing_installments: { id: number }[] }>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  // 2) บล็อกถ้ามี receipt active ผูกอยู่กับงวดใดงวดหนึ่ง
  const instIds = (bn.billing_installments ?? []).map((i) => i.id);
  if (instIds.length > 0) {
    const { data: activeRc } = await ctx.supabase
      .from("receipts")
      .select("id, code")
      .in("installment_id", instIds)
      .eq("is_voided", false)
      .limit(1);

    if ((activeRc ?? []).length > 0) {
      const code = (activeRc as { id: number; code: string }[])[0].code;
      return err(`มีใบเสร็จ ${code} ที่ยังใช้งานอยู่ — ต้อง void ใบเสร็จก่อน`, 409);
    }
  }

  // ตรวจ receipt ที่ผูกกับ billing_note_id โดยตรง (ไม่มี installment_id) ด้วย
  const { data: directRc } = await ctx.supabase
    .from("receipts")
    .select("id, code")
    .eq("billing_note_id", bnId)
    .eq("is_voided", false)
    .limit(1);
  if ((directRc ?? []).length > 0) {
    const code = (directRc as { id: number; code: string }[])[0].code;
    return err(`มีใบเสร็จ ${code} ที่ยังใช้งานอยู่ — ต้อง void ใบเสร็จก่อน`, 409);
  }

  // 3) set billing_notes.status = 'cancelled'
  const { error: vErr } = await ctx.supabase
    .from("billing_notes")
    .update({ status: "cancelled" })
    .eq("id", bnId);
  if (vErr) throw new Error(vErr.message);

  // 4) คืนงวดทั้งหมดเป็น pending
  if (instIds.length > 0) {
    const { error: iErr } = await ctx.supabase
      .from("billing_installments")
      .update({ paid_amount: 0, paid_date: null, status: "pending" })
      .in("id", instIds);
    if (iErr) throw new Error("คืนงวดไม่สำเร็จ: " + iErr.message);
  }

  // 5) void/unlink finance_entries ที่ผูกกับงวดเหล่านี้
  // [HIGH-2] is_auto_created=true (มัดจำที่รับจริง) → unlink แทน void
  //           is_auto_created=false → void ตามปกติ
  if (instIds.length > 0) {
    await voidOrUnlinkByInstallmentIds(ctx.supabase, instIds, reason, ctx.user.id);
  }

  // 6) audit
  await audit({
    userId: ctx.user.id,
    action: "VOID_BILLING_NOTE",
    table: "billing_notes",
    recordId: bnId,
    newValue: { status: "cancelled", void_reason: reason },
  });

  return ok({ ok: true });
});

// ─── helper: void หรือ unlink finance_entries [HIGH-2] ────────────────────────

/**
 * สำหรับรายการ installment ids ทั้งหมดของใบวางบิลที่จะ void:
 * is_auto_created=true → unlink (คงเงินมัดจำจริง, ไม่ set is_voided)
 * is_auto_created=false → void ตามปกติ
 */
async function voidOrUnlinkByInstallmentIds(
  supabase: SupabaseClient,
  installmentIds: number[],
  reason: string,
  userId: string,
) {
  const { data: entries } = await supabase
    .from("finance_entries")
    .select("id, is_auto_created")
    .in("billing_installment_id", installmentIds)
    .eq("is_voided", false);

  if (!entries || entries.length === 0) return;

  const now = new Date().toISOString();
  for (const entry of entries as { id: string; is_auto_created: boolean }[]) {
    if (entry.is_auto_created) {
      // unlink: คง amount + is_voided=false, ล้าง billing link
      await supabase
        .from("finance_entries")
        .update({ billing_installment_id: null, receipt_id: null, source: null })
        .eq("id", entry.id);
    } else {
      await supabase
        .from("finance_entries")
        .update({ is_voided: true, void_reason: reason, voided_at: now, voided_by: userId })
        .eq("id", entry.id);
    }
  }
}
