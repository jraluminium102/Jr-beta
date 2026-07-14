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
    .select("id, code, customer_snapshot, issue_date, status, net, created_at, job_id, jobs:job_id(job_code)")
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
  const discount_amt_in = body.discount_amt != null ? Number(body.discount_amt) || 0 : undefined; // โหมดบาท (ชนะ %)
  const discount_label = String(body.discount_label ?? "").slice(0, 120);
  const wht_rate = Number(body.wht_rate) || 0;
  if (discount_pct < 0 || discount_pct > 100) return fail("ส่วนลดต้องอยู่ 0–100%");

  const supabase = createClient();

  // 1) snapshot ข้อมูลลูกค้า ณ วันออก
  const { data: cust, error: cErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", body.customer_id)
    .single<Customer>();
  if (cErr || !cust) return fail("ไม่พบลูกค้า", 404);

  // เลือก "นามออกบิล": ที่ระบุ (billing_profile_id) → นามหลัก → ข้อมูลลูกค้า (fallback ไม่ให้ snapshot ว่าง)
  const sbp = supabase as unknown as { from: (t: string) => any };
  const bpId = Number(body.billing_profile_id) || null;
  const bpCols = "bill_name,address,postal_code,tax_id,branch,kind,contact_person,phone";
  type Prof = { bill_name: string; address: string; postal_code: string; tax_id: string; branch: string; kind: string; contact_person: string; phone: string };
  let billProfile: Prof | null = null;
  if (bpId) {
    const { data } = await sbp.from("billing_profiles").select(bpCols).eq("id", bpId).eq("customer_id", cust.id).maybeSingle();
    billProfile = (data as Prof) ?? null;
  }
  if (!billProfile) {
    const { data } = await sbp.from("billing_profiles").select(bpCols).eq("customer_id", cust.id).eq("is_default", true).eq("is_active", true).maybeSingle();
    billProfile = (data as Prof) ?? null;
  }
  const snapshot: Record<string, unknown> = billProfile ? {
    name: billProfile.bill_name, job: cust.job,
    address: billProfile.address, postal_code: billProfile.postal_code, tax_id: billProfile.tax_id,
    branch: billProfile.branch, kind: billProfile.kind, line_id: cust.line_id,
    phone: billProfile.phone || cust.phone, contact_person: billProfile.contact_person || cust.contact_person,
  } : {
    name: cust.name, job: cust.job, address: cust.address, tax_id: cust.tax_id,
    kind: "INDIVIDUAL", line_id: cust.line_id, phone: cust.phone, contact_person: cust.contact_person,
  };

  // หัวบิลแก้ในหน้าสร้างใบเสนอ (ออกในนามนิติบุคคล) — ทับเฉพาะฟิลด์ identity (ไม่แตะยอด/งาน)
  const ho = body.header_override;
  if (ho && typeof ho === "object" && String(ho.name ?? "").trim()) {
    snapshot.name = String(ho.name).trim();
    snapshot.kind = ho.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL";
    snapshot.tax_id = String(ho.tax_id ?? "").trim();
    snapshot.branch = String(ho.branch ?? "สำนักงานใหญ่").trim() || "สำนักงานใหญ่";
    snapshot.postal_code = String(ho.postal_code ?? "").trim();
    snapshot.address = String(ho.address ?? "").trim();
    snapshot.contact_person = String(ho.contact_person ?? "").trim();
    snapshot.phone = String(ho.phone ?? "").trim();
  }

  // 2) ผูกใบเสนอกับงาน (job) ของลูกค้า — ไม่สร้างงานใหม่
  //    ลำดับความสำคัญ:
  //    a) ถ้า body.job_id ส่งมา → validate ว่าเป็น active job ของลูกค้านี้จริง แล้วใช้ค่านั้น
  //    b) ถ้าไม่มี/ไม่ผ่าน validate → fallback: auto-link งาน active ล่าสุดของลูกค้า (พฤติกรรมเดิม)
  //    ถ้าลูกค้ายังไม่มีงาน active → job_id = null (หน้า list/หัวใบจะโชว์ป้าย "ยังไม่ผูกงาน")
  //    สำคัญ: ถ้า null → BOQ/วางบิล/การเงิน/สถิติ จะตามงานนี้ไม่เจอ (ต้นเหตุงานหลุดทั้งสาย)
  let jobId: string | null = null;
  const requestedJobId = typeof body.job_id === "string" && body.job_id.trim() ? body.job_id.trim() : null;
  if (requestedJobId) {
    // validate: งานต้องเป็นของลูกค้านี้ + ยังไม่ COMPLETED/CANCELLED
    const { data: requestedJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", requestedJobId)
      .eq("customer_id", cust.id)
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .maybeSingle<{ id: string }>();
    if (requestedJob?.id) {
      jobId = requestedJob.id;
    } else {
      // ผู้ใช้เลือกงานมาแล้วแต่ใช้ไม่ได้ (ถูกปิด/ยกเลิก/id เพี้ยน) → ห้าม fallback เงียบ ให้เลือกใหม่
      return fail("งานที่เลือกผูกใช้ไม่ได้แล้ว (อาจถูกปิดหรือยกเลิก) — กรุณาเลือกงานใหม่", 409);
    }
  }
  if (!jobId) {
    // fallback: auto-link งาน active ล่าสุด (พฤติกรรมเดิม)
    const { data: activeJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("customer_id", cust.id)
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    jobId = activeJob?.id ?? null;
  }

  // 3) คำนวณยอด (แหล่งความจริงเดียว · ส่งบาทมา = ใช้ตรง ๆ ชนะ %)
  const t = computeTotals({ items, vat_rate, discount_pct, wht_rate, ...(discount_amt_in != null ? { discount_amt: discount_amt_in } : {}) });
  const storedPct = discount_amt_in != null
    ? (t.subtotal > 0 ? Math.round((t.discount_amt / t.subtotal) * 10000) / 100 : 0)
    : discount_pct;

  // 3) ออกรหัสอัตโนมัติ (พ.ศ. · reset รายเดือน) ผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "QT" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert หัวเอกสาร
  const qBase: Record<string, unknown> = {
    code,
    customer_id: cust.id,
    job_id: jobId,
    billing_profile_id: billProfile ? bpId : null,
    customer_snapshot: snapshot,
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    status: "draft",
    vat_rate, discount_pct: storedPct, discount_label, wht_rate,
    subtotal: t.subtotal, discount_amt: t.discount_amt, vat_amt: t.vat_amt,
    total: t.total, wht_amt: t.wht_amt, net: t.net,
    note: body.note ?? "",
    created_by: profile.id,
  };
  // เงื่อนไขท้ายใบแก้ได้ต่อใบ (ส่งมาเฉพาะที่แก้ · null = ใช้ค่ามาตรฐาน)
  const qCond: Record<string, unknown> = {};
  if (Array.isArray(body.conditions_work)) qCond.conditions_work = body.conditions_work;
  if (Array.isArray(body.conditions_quote)) qCond.conditions_quote = body.conditions_quote;
  let { data: q, error: qErr } = await supabase
    .from("quotations").insert({ ...qBase, ...qCond }).select("id, code").single();
  // กันพัง: ถ้า migration 0076 (conditions_*) ยังไม่รัน → insert ซ้ำแบบไม่มีเงื่อนไข
  if (qErr && /conditions_/i.test(qErr.message)) {
    ({ data: q, error: qErr } = await supabase
      .from("quotations").insert(qBase).select("id, code").single());
  }
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
    category: String(it.category ?? ""),     // หมวดสินค้า → สถิติขายดี (0046)
    product_id: String(it.product_id ?? ""),
    group_label: String(it.group_label ?? ""), // หัวข้อชุด (0076) → จัดกลุ่มในใบพิมพ์
    calc_recipe: it.calc_recipe ?? null,       // สูตรคิดราคา 4.0 (0093) — โหลดกลับเข้าเครื่องคิดได้
  }));
  let { error: iErr } = await supabase.from("quotation_items").insert(rows);
  // กันพัง: ถ้า migration 0076 (group_label) / 0093 (calc_recipe) ยังไม่รัน → insert ซ้ำแบบตัดคอลัมน์นั้นออก
  if (iErr && /group_label|calc_recipe/i.test(iErr.message)) {
    const rowsNoGl = rows.map(({ group_label, calc_recipe, ...r }: any) => r);
    ({ error: iErr } = await supabase.from("quotation_items").insert(rowsNoGl));
  }
  if (iErr) {
    await supabase.from("quotations").delete().eq("id", q.id);
    return fail("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: q.id, code: q.code }, 201);
}
