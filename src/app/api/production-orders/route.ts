import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { Quotation, QuotationItem } from "@/lib/types";

// GET /api/production-orders  → รายการใบสั่งผลิต
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("production_orders")
    .select("id, code, customer_snapshot, status, due_date, created_at")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/production-orders  → สร้างใบสั่งผลิตจากใบเสนอ (ออกรหัสอัตโนมัติ + snapshot รายการ)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.quotation_id) return fail("ต้องเลือกใบเสนอราคา");

  const supabase = createClient();

  // 1) ดึงใบเสนอ + รายการ (snapshot ลูกค้า/รายการ ณ วันสร้าง)
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", body.quotation_id)
    .single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);

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
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "PO" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 3) insert ใบสั่งผลิต
  const { data: po, error: poErr } = await supabase
    .from("production_orders")
    .insert({
      code,
      quotation_id: quotation.id,
      customer_snapshot: quotation.customer_snapshot,
      items,
      status: "queued",
      due_date: body.due_date || null,
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (poErr || !po) return fail("บันทึกใบสั่งผลิตไม่สำเร็จ: " + (poErr?.message ?? ""), 500);

  return ok({ id: po.id, code: po.code }, 201);
}
