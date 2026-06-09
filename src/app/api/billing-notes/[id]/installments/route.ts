import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const InstallmentItemSchema = z.object({
  seq: z.number().int().min(1),
  label: z.string().min(1),
  amount: z.number().positive("ยอดงวดต้องมากกว่า 0"),
  due_date: z.string().nullable().optional(),
});

const PutSchema = z.object({
  installments: z.array(InstallmentItemSchema).min(1, "ต้องมีอย่างน้อย 1 งวด"),
});

// PUT /api/billing-notes/[id]/installments — แก้ไขงวดชำระ (ห้ามแก้งวดที่จ่ายแล้ว)
export const PUT = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { installments: newInst } = parsed.data;

  const bnId = params.id;

  // 1) ดึงใบวางบิล + งวดปัจจุบัน
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, total, status, billing_installments(*)")
    .eq("id", bnId)
    .single<{
      id: number;
      total: number;
      status: string;
      billing_installments: {
        id: number; seq: number; status: string; paid_amount: number;
        billing_installment_id?: number;
      }[];
    }>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  const total = Number(bn.total) || 0;

  // 2) validate sum = total
  const newSum = round2(newInst.reduce((s, i) => s + i.amount, 0));
  if (Math.abs(newSum - total) > 0.01) {
    return err(`ผลรวมงวด (${newSum}) ไม่ตรงกับยอดใบวางบิล (${total})`, 400);
  }

  const existingInst = bn.billing_installments ?? [];

  // 3) ตรวจงวดที่ห้ามแก้ (paid หรือมี receipt active หรือมี finance_entry ผูก)
  for (const ex of existingInst) {
    if (ex.status === "paid") {
      // งวดที่ paid ต้องยังอยู่ใน newInst (ห้ามลบ) และ amount ต้องเดิม
      const match = newInst.find((n) => n.seq === ex.seq);
      if (!match) return err(`งวดที่ ${ex.seq} ชำระแล้ว ไม่สามารถลบได้`, 400);
      const exAmount = Number(existingInst.find((e) => e.seq === ex.seq)?.paid_amount) || 0;
      // paid_amount ล็อก amount ไม่ให้ต่ำกว่ายอดที่จ่ายแล้ว
      if (match.amount < exAmount) return err(`งวดที่ ${ex.seq} ชำระไปแล้ว ${exAmount} บาท ไม่สามารถลดยอดต่ำกว่านี้ได้`, 400);
    }
  }

  // ตรวจ finance_entry ผูก
  const existingIds = existingInst.map((e) => e.id);
  if (existingIds.length > 0) {
    const { data: boundFe } = await ctx.supabase
      .from("finance_entries")
      .select("billing_installment_id")
      .in("billing_installment_id", existingIds)
      .eq("is_voided", false);

    const boundSeqs = new Set(
      (boundFe ?? []).map((f) => {
        const inst = existingInst.find((e) => e.id === f.billing_installment_id);
        return inst?.seq;
      }).filter(Boolean),
    );

    for (const seq of boundSeqs) {
      const match = newInst.find((n) => n.seq === seq);
      if (!match) return err(`งวดที่ ${seq} มีรายการชำระผูกอยู่ ไม่สามารถลบได้`, 400);
    }
  }

  // ตรวจ receipt active
  if (existingIds.length > 0) {
    const { data: rcActive } = await ctx.supabase
      .from("receipts")
      .select("installment_id")
      .in("installment_id", existingIds)
      .eq("is_voided", false);

    const rcSeqs = new Set(
      (rcActive ?? []).map((r) => {
        const inst = existingInst.find((e) => e.id === r.installment_id);
        return inst?.seq;
      }).filter(Boolean),
    );

    for (const seq of rcSeqs) {
      const match = newInst.find((n) => n.seq === seq);
      if (!match) return err(`งวดที่ ${seq} มีใบเสร็จผูกอยู่ ไม่สามารถลบได้`, 400);
    }
  }

  // 4) replace งวด — ลบของเก่า (เฉพาะที่ไม่มี receipt/fe active) แล้ว insert ใหม่
  // ใช้ deferred constraint ได้เพราะ trigger เป็น deferrable initially deferred

  // ลบงวดที่ไม่ได้ถูก lock
  const lockedSeqs = new Set(existingInst.filter((e) => e.status === "paid").map((e) => e.seq));
  const idsToDelete = existingInst
    .filter((e) => !lockedSeqs.has(e.seq))
    .map((e) => e.id);

  if (idsToDelete.length > 0) {
    const { error: delErr } = await ctx.supabase
      .from("billing_installments")
      .delete()
      .in("id", idsToDelete);
    if (delErr) throw new Error("ลบงวดเดิมไม่สำเร็จ: " + delErr.message);
  }

  // update งวดที่ locked (paid) เฉพาะ label/due_date
  for (const ex of existingInst.filter((e) => lockedSeqs.has(e.seq))) {
    const match = newInst.find((n) => n.seq === ex.seq);
    if (match) {
      await ctx.supabase
        .from("billing_installments")
        .update({ label: match.label, due_date: match.due_date ?? null })
        .eq("id", ex.id);
    }
  }

  // insert งวดใหม่ (เฉพาะ seq ที่ไม่ locked)
  const toInsert = newInst.filter((n) => !lockedSeqs.has(n.seq)).map((n, i) => ({
    billing_note_id: Number(bnId),
    seq: n.seq,
    label: n.label,
    amount: n.amount,
    due_date: n.due_date ?? null,
    sort_order: n.seq - 1,
    status: "pending" as const,
  }));

  if (toInsert.length > 0) {
    const { error: insErr } = await ctx.supabase
      .from("billing_installments")
      .insert(toInsert);
    if (insErr) throw new Error("บันทึกงวดใหม่ไม่สำเร็จ: " + insErr.message);
  }

  // audit
  await audit({
    userId: ctx.user.id,
    action: "UPDATE_INSTALLMENTS",
    table: "billing_installments",
    recordId: bnId,
    newValue: { installments: newInst },
  });

  return ok({ ok: true });
});
