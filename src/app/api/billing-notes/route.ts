import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { suggestInstallments } from "@/lib/money";
import { z } from "zod";
import type { Quotation } from "@/lib/types";

const BillingInsertSchema = z.object({
  quotation_id: z.number({ required_error: "ต้องเลือกใบเสนอราคา" }),
  issue_date:   z.string().optional(),
  note:         z.string().optional().default(""),
});

// GET /api/billing-notes  → รายการใบวางบิล
export const GET = withRoute(async () => {
  const ctx = await requirePermission("billing", "read");

  const { data, error } = await ctx.supabase
    .from("billing_notes")
    .select("id, code, customer_snapshot, issue_date, total, status, created_at")
    .order("created_at", { ascending: false });
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/billing-notes  → สร้างใบวางบิลจากใบเสนอราคาที่อนุมัติ (ออกรหัส + แบ่งงวด)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("billing", "write");

  const body = await req.json().catch(() => null);
  const parsed = BillingInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { quotation_id, issue_date, note } = parsed.data;

  // 1) ดึงใบเสนอราคา — ต้องอนุมัติแล้วเท่านั้น
  const { data: q, error: qErr } = await ctx.supabase
    .from("quotations")
    .select("id, status, net, customer_snapshot")
    .eq("id", quotation_id)
    .single<Pick<Quotation, "id" | "status" | "net" | "customer_snapshot">>();
  if (qErr || !q) return notFound("ไม่พบใบเสนอราคา");
  if (q.status !== "approved") return err("ใบเสนอต้องอนุมัติก่อน");

  const net = Number(q.net) || 0;

  // 2) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await ctx.supabase.rpc("next_document_code", { p_doc_type: "BL" });
  if (codeErr || !code) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 3) insert หัวเอกสาร
  const { data: bn, error: bnErr } = await ctx.supabase
    .from("billing_notes")
    .insert({
      code,
      quotation_id: q.id,
      customer_snapshot: q.customer_snapshot,
      issue_date: issue_date || new Date().toISOString().slice(0, 10),
      total: net,
      status: "unpaid",
      note,
      created_by: ctx.user.id,
    })
    .select("id, code")
    .single();
  if (bnErr || !bn) return err("บันทึกใบวางบิลไม่สำเร็จ: " + (bnErr?.message ?? ""), 500);

  // 4) สร้างงวดชำระอัตโนมัติ — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const plan = suggestInstallments(net);
  const rows = plan.map((p) => ({
    billing_note_id: bn.id,
    seq: p.seq,
    label: p.label,
    amount: p.amount,
    sort_order: p.seq - 1,
    status: "pending" as const,
  }));
  const { error: iErr } = await ctx.supabase.from("billing_installments").insert(rows);
  if (iErr) {
    await ctx.supabase.from("billing_notes").delete().eq("id", bn.id);
    return err("บันทึกงวดชำระไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: bn.id, code: bn.code }, undefined, 201);
});
