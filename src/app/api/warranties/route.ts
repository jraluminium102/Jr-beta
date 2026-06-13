import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import type { ProductionItem } from "@/lib/types";

export const dynamic = "force-dynamic";

// Supabase generics too complex for deep selects — typed manually per pattern in /api/jobs
type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

const postSchema = z.object({
  quotation_id: z.number().int().positive("ต้องเลือกใบเสนอราคา"),
  warranty_months: z.number().int().positive().optional().default(12),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ YYYY-MM-DD").optional(),
  coverage: z.string().optional(),
  note: z.string().optional(),
});

// GET /api/warranties  → รายการใบรับประกัน
export const GET = withRoute(async () => {
  const ctx = await requirePermission("warranties", "read");
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb
    .from("warranties")
    .select("id, code, customer_snapshot, issue_date, warranty_months, expires_date, created_at")
    .order("created_at", { ascending: false });
  if (error) throw dbError(error);
  return ok(data);
});

// POST /api/warranties  → สร้างใบรับประกันจากใบเสนอราคา (ออกรหัสอัตโนมัติ)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("warranties", "write");
  const body = postSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const warranty_months = body.warranty_months ?? 12;
  const coverage = body.coverage?.trim() || "รับประกันงานติดตั้งและวัสดุตามเงื่อนไขบริษัท";

  // 1) ดึงใบเสนอราคา + รายการ
  const { data: q, error: qErr } = await sb
    .from("quotations")
    .select("customer_snapshot, quotation_items(*)")
    .eq("id", body.quotation_id)
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
  const issue_date = body.issue_date || new Date().toISOString().slice(0, 10);
  const exp = new Date(issue_date);
  exp.setMonth(exp.getMonth() + warranty_months);
  const expires_date = exp.toISOString().slice(0, 10);

  // 4) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await sb.rpc("next_document_code", { p_doc_type: "WR" });
  if (codeErr || !code) return err("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 5) insert ใบรับประกัน
  const { data: w, error: wErr } = await sb
    .from("warranties")
    .insert({
      code,
      quotation_id: body.quotation_id,
      customer_snapshot: (q as { customer_snapshot: unknown }).customer_snapshot,
      items,
      issue_date,
      warranty_months,
      expires_date,
      coverage,
      note: body.note ?? "",
      created_by: ctx.user.id,
    })
    .select("id, code")
    .single();
  if (wErr || !w) throw new HttpError(500, "บันทึกใบรับประกันไม่สำเร็จ: " + (wErr?.message ?? ""));

  return created({ id: (w as { id: unknown }).id, code: (w as { code: unknown }).code });
});
