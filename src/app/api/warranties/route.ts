import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { z } from "zod";
import type { ProductionItem } from "@/lib/types";

const WarrantyInsertSchema = z.object({
  quotation_id:    z.number({ required_error: "ต้องเลือกใบเสนอราคา" }),
  warranty_months: z.number().int().positive().optional().default(12),
  coverage:        z.string().optional().default("รับประกันงานติดตั้งและวัสดุตามเงื่อนไขบริษัท"),
  issue_date:      z.string().optional(),
  note:            z.string().optional().default(""),
});

// GET /api/warranties  → รายการใบรับประกัน
export const GET = withRoute(async () => {
  const ctx = await requirePermission("warranties", "read");

  const { data, error } = await ctx.supabase
    .from("warranties")
    .select("id, code, customer_snapshot, issue_date, warranty_months, expires_date, created_at")
    .order("created_at", { ascending: false });
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/warranties  → สร้างใบรับประกันจากใบเสนอราคา (ออกรหัสอัตโนมัติ)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("warranties", "write");

  const body = await req.json().catch(() => null);
  const parsed = WarrantyInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { quotation_id, warranty_months, coverage, issue_date: rawDate, note } = parsed.data;

  // 1) ดึงใบเสนอราคา + รายการ
  const { data: q, error: qErr } = await ctx.supabase
    .from("quotations")
    .select("customer_snapshot, quotation_items(*)")
    .eq("id", quotation_id)
    .single();
  if (qErr || !q) return notFound("ไม่พบใบเสนอราคา");

  // 2) คัดลอกรายการเป็น items jsonb
  const rawItems = ((q as { quotation_items?: { name: string; detail: string; qty: number; sort_order: number }[] }).quotation_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const items: ProductionItem[] = rawItems.map((it) => ({
    name: String(it.name ?? "").trim() || "(ไม่มีชื่อรายการ)",
    detail: String(it.detail ?? ""),
    qty: Number(it.qty) || 0,
  }));

  // 3) คำนวณวันหมดอายุ = วันออก + warranty_months เดือน
  const issue_date = rawDate || new Date().toISOString().slice(0, 10);
  const exp = new Date(issue_date);
  exp.setMonth(exp.getMonth() + warranty_months);
  const expires_date = exp.toISOString().slice(0, 10);

  // 4) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await ctx.supabase.rpc("next_document_code", { p_doc_type: "WR" });
  if (codeErr || !code) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 5) insert ใบรับประกัน
  const { data: w, error: wErr } = await ctx.supabase
    .from("warranties")
    .insert({
      code,
      quotation_id,
      customer_snapshot: (q as { customer_snapshot: unknown }).customer_snapshot,
      items,
      issue_date,
      warranty_months,
      expires_date,
      coverage,
      note,
      created_by: ctx.user.id,
    })
    .select("id, code")
    .single();
  if (wErr || !w) return err("บันทึกใบรับประกันไม่สำเร็จ: " + (wErr?.message ?? ""), 500);

  return ok({ id: w.id, code: w.code }, undefined, 201);
});
