import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeTotals, lineTotal } from "@/lib/money";
import type { Customer } from "@/lib/types";

// GET /api/quotations  → รายการใบเสนอราคา
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("id, code, customer_snapshot, issue_date, status, net, created_at")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/quotations  → สร้างใบเสนอราคา (ออกรหัสอัตโนมัติ + คำนวณยอดฝั่ง server)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return fail("ต้องมีรายการอย่างน้อย 1 บรรทัด");
  if (!body.customer_id) return fail("ต้องเลือกลูกค้า");

  const vat_rate = Number(body.vat_rate) || 0;
  const discount_pct = Number(body.discount_pct) || 0;
  const wht_rate = Number(body.wht_rate) || 0;
  if (discount_pct > 2) return fail("ส่วนลดสูงสุด 2%");

  const supabase = createClient();

  // 1) snapshot ข้อมูลลูกค้า ณ วันออก
  const { data: cust, error: cErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", body.customer_id)
    .single<Customer>();
  if (cErr || !cust) return fail("ไม่พบลูกค้า", 404);
  const snapshot = {
    name: cust.name, job: cust.job, address: cust.address, tax_id: cust.tax_id,
    line_id: cust.line_id, phone: cust.phone, contact_person: cust.contact_person,
  };

  // 2) คำนวณยอด (แหล่งความจริงเดียว)
  const t = computeTotals({ items, vat_rate, discount_pct, wht_rate });

  // 3) ออกรหัสอัตโนมัติ (พ.ศ. · reset รายเดือน) ผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "QT" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert หัวเอกสาร
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .insert({
      code,
      customer_id: cust.id,
      customer_snapshot: snapshot,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      status: "draft",
      vat_rate, discount_pct, wht_rate,
      subtotal: t.subtotal, discount_amt: t.discount_amt, vat_amt: t.vat_amt,
      total: t.total, wht_amt: t.wht_amt, net: t.net,
      note: body.note ?? "",
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (qErr || !q) return fail("บันทึกใบเสนอไม่สำเร็จ: " + (qErr?.message ?? ""), 500);

  // 5) insert รายการ — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const rows = items.map((it: any, i: number) => ({
    quotation_id: q.id,
    name: String(it.name ?? "").trim() || "(ไม่มีชื่อรายการ)",
    detail: String(it.detail ?? ""),
    qty: Number(it.qty) || 0,
    unit_price: Number(it.unit_price) || 0,
    line_total: lineTotal(Number(it.qty) || 0, Number(it.unit_price) || 0),
    sort_order: i,
  }));
  const { error: iErr } = await supabase.from("quotation_items").insert(rows);
  if (iErr) {
    await supabase.from("quotations").delete().eq("id", q.id);
    return fail("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: q.id, code: q.code }, 201);
}
