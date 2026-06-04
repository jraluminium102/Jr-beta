import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";
import type { Quotation, QuotationItem } from "@/lib/types";

const ProdOrderInsertSchema = z.object({
  quotation_id: z.number({ required_error: "ต้องเลือกใบเสนอราคา" }),
  due_date:     z.string().nullable().optional(),
  note:         z.string().optional().default(""),
});

// GET /api/production-orders  → รายการใบสั่งผลิต
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production_orders", "read");

  const { data, error } = await ctx.supabase
    .from("production_orders")
    .select("id, code, customer_snapshot, status, due_date, created_at")
    .order("created_at", { ascending: false });
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/production-orders  → สร้างใบสั่งผลิตจากใบเสนอ (ออกรหัสอัตโนมัติ + snapshot รายการ)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production_orders", "write");

  const body = await req.json().catch(() => null);
  const parsed = ProdOrderInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { quotation_id, due_date, note } = parsed.data;

  // 1) ดึงใบเสนอ + รายการ (snapshot ลูกค้า/รายการ ณ วันสร้าง)
  const { data: q, error: qErr } = await ctx.supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", quotation_id)
    .single();
  if (qErr || !q) return notFound("ไม่พบใบเสนอราคา");

  const quotation = q as Quotation;
  const items = (quotation.quotation_items ?? [])
    .slice()
    .sort((a: QuotationItem, b: QuotationItem) => a.sort_order - b.sort_order)
    .map((it: QuotationItem) => ({
      name: String(it.name ?? ""),
      detail: String(it.detail ?? ""),
      qty: Number(it.qty) || 0,
    }));

  // 2) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await ctx.supabase.rpc("next_document_code", { p_doc_type: "PO" });
  if (codeErr || !code) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 3) insert ใบสั่งผลิต
  const { data: po, error: poErr } = await ctx.supabase
    .from("production_orders")
    .insert({
      code,
      quotation_id: quotation.id,
      customer_snapshot: quotation.customer_snapshot,
      items,
      status: "queued",
      due_date: due_date || null,
      note,
      created_by: ctx.user.id,
    })
    .select("id, code")
    .single();
  if (poErr || !po) return err("บันทึกใบสั่งผลิตไม่สำเร็จ: " + (poErr?.message ?? ""), 500);

  return ok({ id: po.id, code: po.code }, undefined, 201);
});
