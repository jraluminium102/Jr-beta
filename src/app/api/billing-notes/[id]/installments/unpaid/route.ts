import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { classifyLockedInstallments, type InstallmentForLock } from "@/lib/billing";

// PUT /api/billing-notes/[id]/installments/unpaid
// แก้เฉพาะงวดที่ "ยังไม่จ่าย" — เก็บงวด locked (จ่ายแล้ว/จ่ายบางส่วน/มีใบเสร็จ-รายการเงินผูก) ไว้เป๊ะ
// ผ่าน RPC replace_unpaid_installments (0126 — Rev ใบวางบิลได้แม้ชำระแล้ว) · ยอดบิลรวมเปลี่ยนได้ตามงวดที่ส่งมา
// validation เงิน/FK/locked อยู่ใน RPC (ชั้น txn เดียว) — ที่นี่แค่ shape + locked-sum (race guard) + audit
const ItemSchema = z.object({
  label: z.string().min(1, "ต้องระบุรายละเอียดงวด"),
  amount: z.number().positive("ยอดงวดต้องมากกว่า 0"),
  due_date: z.string().nullable().optional(),
});
// อนุญาต array ว่าง (กรณีมัดจำจ่ายครบยอด → ไม่มีงวดเหลือ)
const PutSchema = z.object({
  installments: z.array(ItemSchema),
  reason: z.string().min(5, "ต้องระบุเหตุผล อย่างน้อย 5 ตัวอักษร"),
});

export const PUT = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const reason = parsed.data.reason.trim();

  // โหลดงวดเดิมไว้ audit (oldValue) + หา locked set (base_amt/kind ใช้เช็คบิลค่าแรง)
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, labor_amt, billing_installments(id, seq, label, amount, status, paid_amount, base_amt, kind)")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("id", params.id)
    .single<any>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);
  // 🔴 บิลค่าแรง — endpoint นี้ไม่มีข้อมูล subtotal/VAT/หัก ณ ที่จ่ายให้คำนวณภาษีต่องวด (ต่างจาก PATCH .../route.ts
  //    โหมด B ที่มี) → บล็อกเสมอ ชี้ไปใช้ "แก้ VAT / ส่วนลด" (Rev) แทน
  if (bn.labor_amt != null) {
    return err("ใบวางบิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง) แก้งวดตรงแบบนี้ไม่ได้ (ไม่มีข้อมูลภาษีต่องวดให้คำนวณ) — ใช้ปุ่ม 'แก้ VAT / ส่วนลด' (Rev) แทน", 409);
  }

  const existingInst = (bn.billing_installments ?? []) as InstallmentForLock[];
  const li = await classifyLockedInstallments(ctx.supabase, existingInst);

  const sb = ctx.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: rpcData, error: rpcErr } = await sb.rpc("replace_unpaid_installments", {
    p_bn_id: Number(params.id),
    p_items: parsed.data.installments.map((r) => ({
      label: r.label,
      amount: r.amount,
      due_date: r.due_date ?? null,
    })),
    p_expected_locked_sum: li.lockedSum,
  });
  if (rpcErr) {
    const status = /LOCKED_CHANGED/.test(rpcErr.message) ? 409 : 400;
    return err("แก้งวดไม่สำเร็จ: " + rpcErr.message, status);
  }
  const r = (rpcData ?? {}) as { new_total?: number; overpaid?: number; status?: string };

  await audit({
    userId: ctx.user.id,
    action: "REVISE_BILLING_AFTER_PAYMENT",
    table: "billing_installments",
    recordId: params.id,
    oldValue: { installments: existingInst, locked_sum: li.lockedSum, paid_locked: li.paidLocked },
    newValue: { installments: parsed.data.installments, reason, total: r.new_total, overpaid: r.overpaid ?? 0 },
  });

  return ok({ ok: true, total: r.new_total, overpaid: r.overpaid ?? 0, status: r.status });
});
