import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeTotals, baht } from "@/lib/money";
import { nextDocumentCode } from "@/lib/doc-code";
import { businessDateIssue } from "@/lib/date-guard";

// POST /api/billing-notes/standalone
// ใบวางบิล "ค่าประเมินหน้างาน" — เอกสารอิสระ (แนว A เจ้าของ+accountant เคาะ 4 ส.ค.69)
//   ไม่ผูกใบเสนอราคา/งาน (quotation_id = job_id = null) · doc_kind='assess' กันปนสถิติงานปกติ
//   ใช้เลขเอกสารชุดเดียวกับปกติ (next_document_code('BL')) — ไม่แยกชุด AF
// optional สำหรับลูกค้าที่ "ขอวางบิล" ก่อนจ่าย — ถ้าจ่ายหน้างานทันที ใช้ /api/receipts/standalone อย่างเดียวพอ

const CustomerSnapshotSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อลูกค้า"),
  address: z.string().optional().default(""),
  tax_id: z.string().optional().default(""),
  branch: z.string().optional().default(""),
  kind: z.string().optional().default(""),
  postal_code: z.string().optional().default(""),
  contact_person: z.string().optional().default(""),
  phone: z.string().optional().default(""),
});

const BodySchema = z.object({
  customer_snapshot: CustomerSnapshotSchema,
  item_name: z.string().trim().optional(),
  qty: z.number().positive("จำนวนต้องมากกว่า 0").optional(),
  unit_price: z.number({ invalid_type_error: "ราคาต่อหน่วยต้องเป็นตัวเลข" }).positive("ราคาต่อหน่วยต้องมากกว่า 0"),
  vat_rate: z.union([z.literal(0), z.literal(7)]).optional(),
  wht_rate: z.union([z.literal(0), z.literal(3)]).optional(),
  issue_date: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN(); // ออกใบวางบิล = สิทธิ์ finance (ADMIN/ACCOUNTING)

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.errors[0]?.message ?? "payload ไม่ถูกต้อง");
  const b = parsed.data;

  const itemName = b.item_name?.trim() || "ค่าประเมินหน้างาน";
  const qty = b.qty ?? 1;
  const vatRate = b.vat_rate ?? 7;
  const whtRate = b.wht_rate ?? 0;

  // money core เดียวกับทั้งระบบ — ห้ามคิด VAT/WHT เอง
  const money = computeTotals({
    items: [{ qty, unit_price: b.unit_price }],
    vat_rate: vatRate, discount_pct: 0, wht_rate: whtRate,
  });
  if (money.net <= 0) return fail("ยอดสุทธิต้องมากกว่า 0", 400);

  const supabase = createClient();

  // issue_date คุมทั้งเลขเอกสารและ header — BL ไม่ใช่เอกสารภาษี ให้อนาคตได้ (นัดออกล่วงหน้า)
  const issueDate = b.issue_date || new Date().toISOString().slice(0, 10);
  const dateIssue = businessDateIssue(issueDate, { allowFuture: true, label: "วันที่ออก" });
  if (dateIssue) return fail(dateIssue, 400);

  // ออกรหัสอัตโนมัติผ่าน RPC เดิม (ชุดเดียวกับใบวางบิลปกติ) — เลขต้องตรงเดือนของ issue_date
  const { code, error: codeErrMsg } = await nextDocumentCode(supabase, "BL", issueDate);
  if (!code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErrMsg ?? ""), 500);

  const customerSnapshot = {
    name: b.customer_snapshot.name,
    job: "",
    address: b.customer_snapshot.address,
    tax_id: b.customer_snapshot.tax_id,
    branch: b.customer_snapshot.branch,
    kind: b.customer_snapshot.kind,
    postal_code: b.customer_snapshot.postal_code,
    contact_person: b.customer_snapshot.contact_person,
    phone: b.customer_snapshot.phone,
    line_id: "",
  };

  const bnBase: Record<string, unknown> = {
    code,
    quotation_id: null,
    job_id: null,
    customer_snapshot: customerSnapshot,
    issue_date: issueDate,
    total: money.net,
    status: "unpaid",
    note: b.note ?? "",
    created_by: profile.id,
  };
  const bnBreakdown: Record<string, unknown> = {
    subtotal: money.subtotal, discount_pct: 0, discount_amt: 0,
    vat_rate: vatRate, vat_amt: money.vat_amt, wht_rate: whtRate, wht_amt: money.wht_amt,
    has_tax_breakdown: true, vat_rate_set: true,
  };

  let insertPayload: Record<string, unknown> = { ...bnBase, ...bnBreakdown, doc_kind: "assess" };
  let { data: bn, error: bnErr } = await supabase
    .from("billing_notes").insert(insertPayload).select("id, code").single();
  // migration 0115 (doc_kind) ยังไม่รัน → ตัด doc_kind ออก (ยอด/breakdown ยังถูกต้อง)
  if (bnErr && /doc_kind/i.test(bnErr.message ?? "")) {
    insertPayload = { ...bnBase, ...bnBreakdown };
    ({ data: bn, error: bnErr } = await supabase
      .from("billing_notes").insert(insertPayload).select("id, code").single());
  }
  // กันพัง: ถ้า migration ยอดแยก (0078/0079/0081/0102) ยังไม่รัน → insert แบบไม่มี breakdown (total ยังถูก)
  if (bnErr && /subtotal|discount_amt|discount_label|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|vat_rate_set|labor_ratio|labor_amt/i.test(bnErr.message ?? "")) {
    ({ data: bn, error: bnErr } = await supabase.from("billing_notes").insert(bnBase).select("id, code").single());
  }
  if (bnErr || !bn) return fail("บันทึกใบวางบิลไม่สำเร็จ: " + (bnErr?.message ?? ""), 500);

  // งวดเดียว (ค่าประเมิน = 1 รายการ) — label ตามสไตล์งวดเดิม
  const label = qty > 1 ? `${itemName} (${qty} × ฿${baht(b.unit_price)})` : itemName;
  const { error: iErr } = await supabase.from("billing_installments").insert({
    billing_note_id: bn.id, seq: 1, label, amount: money.net, sort_order: 0, status: "pending",
  });
  if (iErr) {
    // rollback หัวเอกสารถ้าสร้างงวดไม่สำเร็จ (กันเอกสารลอยไม่มีงวด)
    await supabase.from("billing_notes").delete().eq("id", bn.id);
    return fail("บันทึกงวดชำระไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: bn.id, code: bn.code }, 201);
}
