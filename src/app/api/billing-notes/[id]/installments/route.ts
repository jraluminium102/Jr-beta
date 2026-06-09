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
  const existingIds = existingInst.map((e) => e.id);

  // 3) Business rule: แต่งงวดได้เฉพาะตอน "ยังไม่มีการชำระ/ออกใบเสร็จ" ใดๆ
  // (ถ้าเริ่มเก็บเงิน/ออกใบเสร็จแล้ว → โครงสร้างงวดล็อก ต้อง void ใบวางบิลแล้วออกใหม่)
  // กัน FK error จาก receipts/finance_entries ที่อ้างงวด + กันตัวเลขเพี้ยน
  if (existingInst.some((e) => e.status === "paid" || (Number(e.paid_amount) || 0) > 0)) {
    return err("ใบวางบิลนี้มีงวดที่ชำระแล้ว — ปรับงวดไม่ได้ ต้องยกเลิกใบวางบิลแล้วออกใหม่", 409);
  }
  if (existingIds.length > 0) {
    const [{ count: rcCount }, { count: feCount }] = await Promise.all([
      ctx.supabase.from("receipts").select("id", { count: "exact", head: true }).in("installment_id", existingIds),
      ctx.supabase.from("finance_entries").select("id", { count: "exact", head: true }).in("billing_installment_id", existingIds),
    ]);
    if ((rcCount ?? 0) > 0 || (feCount ?? 0) > 0) {
      return err("ใบวางบิลนี้มีใบเสร็จ/รายการชำระผูกอยู่ — ปรับงวดไม่ได้ ต้องยกเลิกใบวางบิลแล้วออกใหม่", 409);
    }
  }

  // 4) replace งวดทั้งชุด (ปลอดภัย เพราะยืนยันแล้วว่าไม่มี FK อ้างอิง)
  // constraint trigger เป็น deferrable → ผลรวมจะถูกเช็คตอน commit
  if (existingIds.length > 0) {
    const { error: delErr } = await ctx.supabase
      .from("billing_installments").delete().in("id", existingIds);
    if (delErr) throw new Error("ลบงวดเดิมไม่สำเร็จ: " + delErr.message);
  }

  const toInsert = newInst.map((n) => ({
    billing_note_id: Number(bnId),
    seq: n.seq,
    label: n.label,
    amount: n.amount,
    due_date: n.due_date ?? null,
    sort_order: n.seq - 1,
    status: "pending" as const,
  }));
  const { error: insErr } = await ctx.supabase
    .from("billing_installments").insert(toInsert);
  if (insErr) throw new Error("บันทึกงวดใหม่ไม่สำเร็จ: " + insErr.message);

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
