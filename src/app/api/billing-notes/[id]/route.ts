import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { err, notFound } from "@/lib/bff/response";
import { suggestInstallments } from "@/lib/money";

// GET /api/billing-notes/[id]  → ใบวางบิล + งวดชำระ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "billing_installments", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

// ──────────────────────────────────────────────────────────────────
// PATCH /api/billing-notes/[id]  → แก้ยอดบิล + re-split งวดใหม่
// Guard: ห้ามแก้ถ้ามีงวด paid หรือมี receipt/finance_entry ผูกอยู่
// ──────────────────────────────────────────────────────────────────
const PatchSchema = z.object({
  total: z
    .number({ required_error: "ต้องระบุยอดใหม่", invalid_type_error: "ยอดต้องเป็นตัวเลข" })
    .positive("ยอดต้องมากกว่า 0"),
});

export const PATCH = withRoute(
  async (req: Request, { params }: { params: { id: string } }) => {
    const ctx = await requirePermission("finance", "write");

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.errors[0].message, 400);

    const newTotal = Math.round((parsed.data.total + Number.EPSILON) * 100) / 100; // round2
    const bnId = params.id;

    // 1) ดึงใบวางบิล + งวดปัจจุบัน
    const { data: bn, error: bnErr } = await ctx.supabase
      .from("billing_notes")
      .select("id, total, status, billing_installments(id, status, paid_amount)")
      .eq("id", bnId)
      .single<{
        id: number;
        total: number;
        status: string;
        billing_installments: { id: number; status: string; paid_amount: number }[];
      }>();
    if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
    if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว แก้ยอดไม่ได้", 409);

    const installments = bn.billing_installments ?? [];
    const instIds = installments.map((i) => i.id);

    // 2) guard: มีงวด paid หรือ receipt/finance_entry ผูกอยู่
    const hasPaidInstallment = installments.some(
      (i) => i.status === "paid" || (Number(i.paid_amount) || 0) > 0
    );
    if (hasPaidInstallment) {
      return err("มีการชำระแล้ว แก้ยอดไม่ได้ ต้องยกเลิกบิลออกใหม่", 409);
    }
    if (instIds.length > 0) {
      const [{ count: rcCount }, { count: feCount }] = await Promise.all([
        ctx.supabase
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .in("installment_id", instIds),
        ctx.supabase
          .from("finance_entries")
          .select("id", { count: "exact", head: true })
          .in("billing_installment_id", instIds),
      ]);
      if ((rcCount ?? 0) > 0 || (feCount ?? 0) > 0) {
        return err("มีการชำระแล้ว แก้ยอดไม่ได้ ต้องยกเลิกบิลออกใหม่", 409);
      }
    }

    const oldTotal = Number(bn.total) || 0;

    // 3) อัปเดต total ก่อน (RPC อ่าน total ใหม่ → งวดตรง)
    const { error: upErr } = await ctx.supabase
      .from("billing_notes")
      .update({ total: newTotal })
      .eq("id", bnId);
    if (upErr) return err("อัปเดตยอดไม่สำเร็จ: " + upErr.message, 500);

    // 4) re-split งวดผ่าน RPC replace_billing_installments (1 txn → constraint ผ่าน)
    const plan = suggestInstallments(newTotal);
    const items = plan.map((p) => ({
      seq: p.seq,
      label: p.label,
      amount: p.amount,
      due_date: null,
    }));

    const sb = ctx.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ error: { message: string } | null }>;
    };
    const { error: rpcErr } = await sb.rpc("replace_billing_installments", {
      p_bn_id: Number(bnId),
      p_items: items,
    });
    if (rpcErr) {
      // rollback total ถ้า RPC ล้มเหลว (best-effort)
      await ctx.supabase
        .from("billing_notes")
        .update({ total: oldTotal })
        .eq("id", bnId);
      return err("re-split งวดไม่สำเร็จ: " + rpcErr.message, 500);
    }

    // 5) audit
    await audit({
      userId: ctx.user.id,
      action: "UPDATE_BILLING_TOTAL",
      table: "billing_notes",
      recordId: bnId,
      oldValue: { total: oldTotal },
      newValue: { total: newTotal, installments: items },
    });

    return ok({ ok: true, total: newTotal, installments: items });
  }
);
