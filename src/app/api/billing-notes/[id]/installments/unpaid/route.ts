import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

// PUT /api/billing-notes/[id]/installments/unpaid
// แก้เฉพาะงวดที่ "ยังไม่จ่าย" — เก็บงวดที่จ่ายเต็มแล้วไว้ (ผ่าน RPC replace_unpaid_installments)
// validation เงิน/FK/partial อยู่ใน RPC (ชั้น txn เดียว) — ที่นี่แค่ shape + audit
const ItemSchema = z.object({
  label: z.string().min(1, "ต้องระบุรายละเอียดงวด"),
  amount: z.number().positive("ยอดงวดต้องมากกว่า 0"),
  due_date: z.string().nullable().optional(),
});
// อนุญาต array ว่าง (กรณีมัดจำจ่ายครบยอด → ไม่มีงวดเหลือ); RPC จะ raise ถ้า paid_sum≠total
const PutSchema = z.object({ installments: z.array(ItemSchema) });

export const PUT = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);

  // โหลดงวดเดิมไว้ audit (oldValue)
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, billing_installments(*)")
    .eq("id", params.id)
    .single<{ id: number; status: string; billing_installments: unknown[] }>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  const sb = ctx.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
  const { error: rpcErr } = await sb.rpc("replace_unpaid_installments", {
    p_bn_id: Number(params.id),
    p_items: parsed.data.installments.map((r) => ({
      label: r.label,
      amount: r.amount,
      due_date: r.due_date ?? null,
    })),
  });
  if (rpcErr) return err("แก้งวดไม่สำเร็จ: " + rpcErr.message, 400);

  await audit({
    userId: ctx.user.id,
    action: "UPDATE_UNPAID_INSTALLMENTS",
    table: "billing_installments",
    recordId: params.id,
    oldValue: { installments: bn.billing_installments },
    newValue: { installments: parsed.data.installments },
  });

  return ok({ ok: true });
});
