import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import type { SupabaseClient } from "@supabase/supabase-js";

const VoidSchema = z.object({
  reason: z.string().min(1, "ต้องระบุเหตุผล"),
  // (เจ้าของสั่ง 3 ก.ย.69 · free-space) default = true — ยกเลิกบิลจัดการใบเสร็จที่ผูกให้ในตัว (atomic RPC 0123)
  //   เลิกบล็อก "ต้อง void ใบเสร็จก่อน" · บิลไม่มีใบเสร็จ = cascade ไม่ทำอะไรเพิ่ม (เหมือนเดิม) · ส่ง cascade:false เองถ้าอยากได้ทางเดิม
  cascade: z.boolean().optional().default(true),
});

// error code จาก RPC void_billing_note_cascade → ข้อความไทย
const CASCADE_BLOCK_MSG: Record<string, { msg: string; status: number }> = {
  forbidden: { msg: "ไม่มีสิทธิ์ยกเลิกใบวางบิล (เฉพาะแอดมิน/บัญชี)", status: 403 },
  NOT_FOUND: { msg: "ไม่พบใบวางบิล", status: 404 },
  ALREADY_CANCELLED: { msg: "ใบวางบิลถูกยกเลิกแล้ว", status: 409 },
};

// POST /api/billing-notes/[id]/void — ยกเลิกใบวางบิล
//   cascade=false (ค่าเริ่มต้น) — พฤติกรรมเดิม: บล็อกถ้ามีใบเสร็จ active ผูกอยู่
//   cascade=true — ยกเลิกใบเสร็จที่ผูกอยู่ให้ในตัว ผ่าน RPC atomic (void_billing_note_cascade, 0123)
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "void");

  const body = await req.json().catch(() => ({}));
  const parsed = VoidSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { reason, cascade } = parsed.data;
  // cascade = ยกเลิกใบเสร็จ/ใบกำกับภาษีตามไปด้วย (กระทบรายงานภาษีขาย) — บังคับเหตุผลยาวกว่าปกติ กัน "." ลอย
  if (cascade && reason.trim().length < 5) {
    return err("ต้องระบุเหตุผล (อย่างน้อย 5 ตัวอักษร) — กระทบใบเสร็จ/ใบกำกับภาษีด้วย", 400);
  }

  const bnId = params.id;

  // 1) ดึงใบวางบิล + งวด
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, billing_installments(id)")
    .eq("id", bnId)
    .single<{ id: number; status: string; billing_installments: { id: number }[] }>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  const instIds = (bn.billing_installments ?? []).map((i) => i.id);

  // ─── cascade=true: void ใบเสร็จที่ผูกอยู่ให้ในตัว ผ่าน RPC atomic ───
  if (cascade) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = ctx.supabase as any;
    const { data, error } = await sb.rpc("void_billing_note_cascade", {
      p_bn_id: Number(bnId),
      p_reason: reason,
      p_user_id: ctx.user.id,
    });
    if (error) {
      const code = (error.message ?? "").match(/forbidden|NOT_FOUND|ALREADY_CANCELLED/)?.[0];
      if (code && CASCADE_BLOCK_MSG[code]) {
        const { msg, status } = CASCADE_BLOCK_MSG[code];
        return err(msg, status);
      }
      if (/void_billing_note_cascade|does not exist|42883|schema cache/i.test(error.message ?? ""))
        return err("ยังไม่ได้รัน migration 0123 (ยกเลิกใบวางบิลแบบ cascade) — ติดต่อผู้ดูแลระบบ", 400);
      return err(error.message ?? "ยกเลิกใบวางบิลไม่สำเร็จ", 400);
    }

    const voidedReceipts = (data?.voided_receipts ?? []) as { id: number; code: string }[];

    await audit({
      userId: ctx.user.id,
      action: "VOID_BILLING_NOTE",
      table: "billing_notes",
      recordId: bnId,
      newValue: { status: "cancelled", void_reason: reason, cascade: true, voided_receipts: voidedReceipts },
    });
    for (const rc of voidedReceipts) {
      await audit({
        userId: ctx.user.id,
        action: "VOID_RECEIPT",
        table: "receipts",
        recordId: String(rc.id),
        newValue: { is_voided: true, void_reason: reason, cascade_from_billing_note: bnId },
      });
    }

    return ok({ ok: true, voided_receipts: voidedReceipts });
  }

  // ─── cascade=false (เดิม): บล็อกถ้ามี receipt active ผูกอยู่กับงวดใดงวดหนึ่ง ───
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
