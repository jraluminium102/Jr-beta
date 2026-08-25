import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { classifyLockedInstallments, type InstallmentForLock } from "@/lib/billing";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const InstallmentItemSchema = z.object({
  // seq: บังคับเฉพาะโหมดปกติ (แทนที่ทั้งชุด) — โหมด Rev ไม่ต้องส่ง (RPC 0126 คุม seq ต่อจากงวด locked เอง)
  seq: z.number().int().min(1).optional(),
  label: z.string().min(1),
  amount: z.number().positive("ยอดงวดต้องมากกว่า 0"),
  due_date: z.string().nullable().optional(),
});

const PutSchema = z.object({
  // ไม่บังคับ min(1) ที่ schema — โหมด Rev ยอมรับ [] ได้ (เคสจ่ายครบพอดี ไม่เหลืองวดใหม่) เช็คแยกในแฮนด์เลอร์
  installments: z.array(InstallmentItemSchema),
  // ── Rev ใบวางบิลได้แม้ชำระแล้ว (24 ส.ค.69) ──
  //   rev:true = ข้าม guard "ห้ามแก้ถ้าจ่ายแล้ว" ด้านล่าง แล้วส่ง `installments` เป็น "เฉพาะงวดที่เหลือ (ยังไม่จ่าย)"
  //   เท่านั้น (งวด locked ตรึงไว้ฝั่ง server ไม่ต้องส่งมา) ผ่าน replace_unpaid_installments (0126) — ยอดบิลรวม
  //   เปลี่ยนได้ (ต่างจาก non-rev ที่ต้องรวมเท่าเดิม) · ต้องระบุ reason เสมอ (บังคับ audit trail)
  rev: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

// PUT /api/billing-notes/[id]/installments — แก้ไขงวดชำระ
//   ปกติ (rev ไม่ส่ง/false): แทนที่ทั้งชุด ห้ามแก้ถ้ามีงวดจ่ายแล้ว/มีใบเสร็จ-รายการเงินผูกอยู่ (เหมือนเดิม)
//   Rev (rev:true + reason): แก้ได้แม้จ่ายแล้ว — ตรึงงวด locked ไว้ + re-split เฉพาะงวดที่เหลือ
export const PUT = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { installments: newInst } = parsed.data;
  const rev = parsed.data.rev === true;
  const reason = (parsed.data.reason ?? "").trim();
  if (rev && reason.length < 5) return err("Rev (แก้แม้ชำระแล้ว) ต้องระบุเหตุผล อย่างน้อย 5 ตัวอักษร", 400);

  const bnId = params.id;

  // 1) ดึงใบวางบิล + งวดปัจจุบัน (base_amt/kind ใช้หา locked set ในโหมด Rev)
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, total, status, labor_amt, billing_installments(id, seq, label, amount, status, paid_amount, base_amt, kind)")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("id", bnId)
    .single<any>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);
  // 🔴 บิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง · ภาษี booked ต่องวด) — endpoint นี้ไม่มีข้อมูล subtotal/VAT/หัก ณ ที่จ่าย
  //    ให้คำนวณภาษีต่องวด (ต่างจาก PATCH .../route.ts โหมด B) → บล็อกเสมอ ไม่ว่า rev หรือไม่ ชี้ไปใช้ "แก้ VAT/ส่วนลด" แทน
  if (bn.labor_amt != null) {
    return err("ใบวางบิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง) แก้งวดตรงแบบนี้ไม่ได้ (ไม่มีข้อมูลภาษีต่องวดให้คำนวณ) — ใช้ปุ่ม 'แก้ VAT / ส่วนลด' (Rev) แทน", 409);
  }

  const existingInst = (bn.billing_installments ?? []) as InstallmentForLock[];
  const existingIds = existingInst.map((e) => e.id);

  if (!rev) {
    // ── โหมดปกติ (ก่อนจ่าย) — พฤติกรรมเดิมทุกจุด ไม่กระทบ ──
    if (newInst.length === 0) return err("ต้องมีอย่างน้อย 1 งวด", 400);
    const total = Number(bn.total) || 0;
    const newSum = round2(newInst.reduce((s, i) => s + i.amount, 0));
    if (Math.abs(newSum - total) > 0.01) {
      return err(`ผลรวมงวด (${newSum}) ไม่ตรงกับยอดใบวางบิล (${total})`, 400);
    }

    // Business rule: แต่งงวดได้เฉพาะตอน "ยังไม่มีการชำระ/ออกใบเสร็จ" ใดๆ
    if (existingInst.some((e) => e.status === "paid" || (Number(e.paid_amount) || 0) > 0)) {
      return err("ใบวางบิลนี้มีงวดที่ชำระแล้ว — ปรับงวดไม่ได้ ต้องยกเลิกใบวางบิลแล้วออกใหม่ (หรือใช้โหมด Rev)", 409);
    }
    if (existingIds.length > 0) {
      const [{ count: rcCount }, { count: feCount }] = await Promise.all([
        ctx.supabase.from("receipts").select("id", { count: "exact", head: true }).in("installment_id", existingIds),
        ctx.supabase.from("finance_entries").select("id", { count: "exact", head: true }).in("billing_installment_id", existingIds),
      ]);
      if ((rcCount ?? 0) > 0 || (feCount ?? 0) > 0) {
        return err("ใบวางบิลนี้มีใบเสร็จ/รายการชำระผูกอยู่ — ปรับงวดไม่ได้ ต้องยกเลิกใบวางบิลแล้วออกใหม่ (หรือใช้โหมด Rev)", 409);
      }
    }

    // replace งวดทั้งชุดผ่าน RPC (1 transaction) — ให้ deferred constraint (sum=total) เช็คตอน commit ได้
    const sb = ctx.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    const { error: rpcErr } = await sb.rpc("replace_billing_installments", {
      p_bn_id: Number(bnId),
      p_items: newInst.map((n, idx) => ({ seq: n.seq ?? idx + 1, label: n.label, amount: n.amount, due_date: n.due_date ?? null })),
    });
    if (rpcErr) return err("แก้งวดไม่สำเร็จ: " + rpcErr.message, 400);

    await audit({
      userId: ctx.user.id,
      action: "UPDATE_INSTALLMENTS",
      table: "billing_installments",
      recordId: bnId,
      oldValue: { installments: existingInst },
      newValue: { installments: newInst },
    });
    return ok({ ok: true });
  }

  // ── โหมด Rev (24 ส.ค.69) — ตรึงงวด locked ไว้ + re-split เฉพาะงวดที่เหลือ (newInst = งวดที่เหลือเท่านั้น) ──
  const li = await classifyLockedInstallments(ctx.supabase, existingInst);
  const items = newInst.map((n) => ({ label: n.label, amount: n.amount, due_date: n.due_date ?? null }));

  const sb = ctx.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: rpcData, error: rpcErr } = await sb.rpc("replace_unpaid_installments", {
    p_bn_id: Number(bnId),
    p_items: items,
    p_expected_locked_sum: li.lockedSum,
  });
  if (rpcErr) {
    const status = /LOCKED_CHANGED/.test(rpcErr.message) ? 409 : 400;
    return err("Rev งวดไม่สำเร็จ: " + rpcErr.message, status);
  }
  const r = (rpcData ?? {}) as { new_total?: number; overpaid?: number; status?: string };

  await audit({
    userId: ctx.user.id,
    action: "REVISE_BILLING_AFTER_PAYMENT",
    table: "billing_installments",
    recordId: bnId,
    oldValue: { installments: existingInst, locked_sum: li.lockedSum, paid_locked: li.paidLocked },
    newValue: { installments: newInst, reason, total: r.new_total, overpaid: r.overpaid ?? 0 },
  });
  return ok({ ok: true, total: r.new_total, overpaid: r.overpaid ?? 0, status: r.status });
});
