import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";
import type { Quotation, QuotationItem } from "@/lib/types";

// GET /api/boq  → รายการ BOQ (รหัส, ลูกค้า, งาน, สถานะ)
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("boqs")
    .select("id, code, customer_snapshot, status, created_at, job:job_id(job_code)")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/boq  → สร้าง BOQ จากใบเสนอราคา (ออกรหัส + prefill รายการวัสดุ)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "boq", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.quotation_id) return fail("ต้องเลือกใบเสนอราคา");

  const supabase = createClient();

  // 1) ดึงใบเสนอ + รายการ (snapshot ลูกค้า/รายการ ณ วันสร้าง)
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, status, net, customer_snapshot, job_id, quotation_items(*)")
    .eq("id", body.quotation_id)
    .single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);

  const quotation = q as Quotation & { job_id: string | null };
  const srcItems = (quotation.quotation_items ?? [])
    .slice()
    .sort((a: QuotationItem, b: QuotationItem) => a.sort_order - b.sort_order);

  // 2) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "BQ" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 3) insert หัว BOQ (ผูกงานถ้าใบเสนอมี job_id)
  const { data: boq, error: boqErr } = await supabase
    .from("boqs")
    .insert({
      code,
      quotation_id: quotation.id,
      job_id: quotation.job_id ?? null,
      customer_snapshot: quotation.customer_snapshot,
      status: "draft",
      note: body.note ?? "",
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (boqErr || !boq) return fail("บันทึก BOQ ไม่สำเร็จ: " + (boqErr?.message ?? ""), 500);

  // 4) prefill รายการวัสดุจากใบเสนอ — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const rows = srcItems.map((it: QuotationItem, i: number) => ({
    boq_id: boq.id,
    category: "",
    name: String(it.name ?? ""),
    spec: String(it.detail ?? ""),
    qty: Number(it.qty) || 0,
    unit: "ชุด",
    sort_order: i,
  }));
  if (rows.length > 0) {
    const { error: iErr } = await supabase.from("boq_items").insert(rows);
    if (iErr) {
      await supabase.from("boqs").delete().eq("id", boq.id);
      return fail("บันทึกรายการวัสดุไม่สำเร็จ: " + iErr.message, 500);
    }
  }

  return ok({ id: boq.id, code: boq.code }, 201);
}
