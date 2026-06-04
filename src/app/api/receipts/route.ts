import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";
import type { BillingNote } from "@/lib/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const ReceiptInsertSchema = z.object({
  billing_note_id: z.number({ required_error: "ต้องเลือกใบวางบิล" }),
  installment_id:  z.number().optional(),
  amount:          z.number().positive("จำนวนเงินต้องมากกว่า 0"),
  vat_rate:        z.coerce.number().nonnegative().optional().default(0),
  payment_method:  z.string().optional().default("transfer"),
  issue_date:      z.string().optional(),
  note:            z.string().optional().default(""),
});

// GET /api/receipts  → รายการใบเสร็จ/ใบกำกับภาษี
export const GET = withRoute(async () => {
  const ctx = await requirePermission("receipts", "read");

  const { data, error } = await ctx.supabase
    .from("receipts")
    .select("id, code, customer_snapshot, issue_date, net, payment_method, created_at")
    .order("created_at", { ascending: false });
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/receipts  → สร้างใบเสร็จจากใบวางบิล/งวด (ออกรหัส + คำนวณ VAT ฝั่ง server)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("receipts", "write");

  const body = await req.json().catch(() => null);
  const parsed = ReceiptInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { billing_note_id, installment_id, amount, vat_rate, payment_method, issue_date, note } = parsed.data;

  // 1) ดึงใบวางบิล → copy customer_snapshot
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .select("id, customer_snapshot")
    .eq("id", billing_note_id)
    .single<Pick<BillingNote, "id" | "customer_snapshot">>();
  if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");

  // 2) คำนวณ VAT (vat แยกจากยอด) + ยอดสุทธิ
  const vat_amt = round2((amount * (vat_rate ?? 0)) / 100);
  const net = round2(amount + vat_amt);

  // 3) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await ctx.supabase.rpc("next_document_code", { p_doc_type: "INV" });
  if (codeErr || !code) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert ใบเสร็จ
  const { data: rc, error: rcErr } = await ctx.supabase
    .from("receipts")
    .insert({
      code,
      billing_note_id: bn.id,
      installment_id: installment_id ?? null,
      customer_snapshot: bn.customer_snapshot,
      issue_date: issue_date || new Date().toISOString().slice(0, 10),
      amount,
      vat_rate,
      vat_amt,
      net,
      payment_method,
      note,
      created_by: ctx.user.id,
    })
    .select("id, code")
    .single();
  if (rcErr || !rc) return err("บันทึกใบเสร็จไม่สำเร็จ: " + (rcErr?.message ?? ""), 500);

  return ok({ id: rc.id, code: rc.code }, undefined, 201);
});
