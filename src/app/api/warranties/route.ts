import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { ProductionItem } from "@/lib/types";

// GET /api/warranties  → รายการใบรับประกัน
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("warranties")
    .select("id, code, customer_snapshot, issue_date, warranty_months, expires_date, created_at")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/warranties  → สร้างใบรับประกันจากใบเสนอราคา (ออกรหัสอัตโนมัติ)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.quotation_id) return fail("ต้องเลือกใบเสนอราคา");

  const warranty_months = Number(body.warranty_months) || 12;
  const coverage = String(body.coverage ?? "").trim() || "รับประกันงานติดตั้งและวัสดุตามเงื่อนไขบริษัท";

  const supabase = createClient();

  // 1) ดึงใบเสนอราคา + รายการ
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("customer_snapshot, quotation_items(*)")
    .eq("id", body.quotation_id)
    .single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);

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
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "WR" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 5) insert ใบรับประกัน
  const { data: w, error: wErr } = await supabase
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
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (wErr || !w) return fail("บันทึกใบรับประกันไม่สำเร็จ: " + (wErr?.message ?? ""), 500);

  return ok({ id: w.id, code: w.code }, 201);
}
