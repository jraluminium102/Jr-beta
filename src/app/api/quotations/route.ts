import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { computeTotals, lineTotal } from "@/lib/money";
import { z } from "zod";
import type { Customer } from "@/lib/types";

const QuotationItemSchema = z.object({
  name:       z.string().default(""),
  detail:     z.string().default(""),
  qty:        z.coerce.number().default(0),
  unit_price: z.coerce.number().default(0),
});

const QuotationInsertSchema = z.object({
  customer_id:  z.number({ required_error: "ต้องเลือกลูกค้า" }),
  items:        z.array(QuotationItemSchema).min(1, "ต้องมีรายการอย่างน้อย 1 บรรทัด"),
  issue_date:   z.string().optional(),
  vat_rate:     z.coerce.number().nonnegative().optional().default(0),
  discount_pct: z.coerce.number().min(0).max(2, "ส่วนลดสูงสุด 2%").optional().default(0),
  wht_rate:     z.coerce.number().nonnegative().optional().default(0),
  note:         z.string().optional().default(""),
});

// GET /api/quotations  → รายการใบเสนอราคา
export const GET = withRoute(async () => {
  const ctx = await requirePermission("quotations", "read");

  const { data, error } = await ctx.supabase
    .from("quotations")
    .select("id, code, customer_snapshot, issue_date, status, net, created_at")
    .order("created_at", { ascending: false });
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

// POST /api/quotations  → สร้างใบเสนอราคา (ออกรหัสอัตโนมัติ + คำนวณยอดฝั่ง server)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("quotations", "write");

  const body = await req.json().catch(() => null);
  const parsed = QuotationInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { customer_id, items, issue_date, vat_rate, discount_pct, wht_rate, note } = parsed.data;

  // 1) snapshot ข้อมูลลูกค้า ณ วันออก
  const { data: cust, error: cErr } = await ctx.supabase
    .from("customers")
    .select("*")
    .eq("id", customer_id)
    .single<Customer>();
  if (cErr || !cust) return notFound("ไม่พบลูกค้า");
  const snapshot = {
    name: cust.name, job: cust.job, address: cust.address, tax_id: cust.tax_id,
    line_id: cust.line_id, phone: cust.phone, contact_person: cust.contact_person,
  };

  // 2) คำนวณยอด (แหล่งความจริงเดียว)
  const t = computeTotals({ items, vat_rate: vat_rate ?? 0, discount_pct: discount_pct ?? 0, wht_rate: wht_rate ?? 0 });

  // 3) ออกรหัสอัตโนมัติ (พ.ศ. · reset รายเดือน) ผ่าน RPC
  const { data: code, error: codeErr } = await ctx.supabase.rpc("next_document_code", { p_doc_type: "QT" });
  if (codeErr || !code) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert หัวเอกสาร
  const { data: q, error: qErr } = await ctx.supabase
    .from("quotations")
    .insert({
      code,
      customer_id: cust.id,
      customer_snapshot: snapshot,
      issue_date: issue_date || new Date().toISOString().slice(0, 10),
      status: "draft",
      vat_rate, discount_pct, wht_rate,
      subtotal: t.subtotal, discount_amt: t.discount_amt, vat_amt: t.vat_amt,
      total: t.total, wht_amt: t.wht_amt, net: t.net,
      note,
      created_by: ctx.user.id,
    })
    .select("id, code")
    .single();
  if (qErr || !q) return err("บันทึกใบเสนอไม่สำเร็จ: " + (qErr?.message ?? ""), 500);

  // 5) insert รายการ — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const rows = items.map((it, i) => ({
    quotation_id: q.id,
    name: String(it.name ?? "").trim() || "(ไม่มีชื่อรายการ)",
    detail: String(it.detail ?? ""),
    qty: Number(it.qty) || 0,
    unit_price: Number(it.unit_price) || 0,
    line_total: lineTotal(Number(it.qty) || 0, Number(it.unit_price) || 0),
    sort_order: i,
  }));
  const { error: iErr } = await ctx.supabase.from("quotation_items").insert(rows);
  if (iErr) {
    await ctx.supabase.from("quotations").delete().eq("id", q.id);
    return err("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: q.id, code: q.code }, undefined, 201);
});
