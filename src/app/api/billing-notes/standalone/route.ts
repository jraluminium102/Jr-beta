import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeTotals, splitCashReceived, baht } from "@/lib/money";
import { nextDocumentCode } from "@/lib/doc-code";
import { businessDateIssue } from "@/lib/date-guard";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
  amount_mode: z.enum(["before_vat", "gross"]).optional(), // ยอดที่กรอก = ก่อน VAT (default) หรือ รวม VAT
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
  let subtotal: number, vatAmt: number, whtAmt: number, net: number;
  if (b.amount_mode === "gross") {
    // ยอดที่กรอก = รวม VAT แล้ว → ถอด VAT (base+vat = gross เป๊ะ) · WHT คิดจากฐานก่อน VAT · net = รวม − WHT
    const grossTotal = round2(qty * b.unit_price);
    const s = splitCashReceived(grossTotal, vatRate, 0);
    subtotal = s.base; vatAmt = s.vat;
    whtAmt = round2((subtotal * whtRate) / 100);
    net = round2(grossTotal - whtAmt);
  } else {
    const m = computeTotals({ items: [{ qty, unit_price: b.unit_price }], vat_rate: vatRate, discount_pct: 0, wht_rate: whtRate });
    subtotal = m.subtotal; vatAmt = m.vat_amt; whtAmt = m.wht_amt; net = m.net;
  }
  if (net <= 0) return fail("ยอดสุทธิต้องมากกว่า 0", 400);

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
    total: net,
    status: "unpaid",
    note: b.note ?? "",
    created_by: profile.id,
  };
  const bnBreakdown: Record<string, unknown> = {
    subtotal: subtotal, discount_pct: 0, discount_amt: 0,
    vat_rate: vatRate, vat_amt: vatAmt, wht_rate: whtRate, wht_amt: whtAmt,
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
    billing_note_id: bn.id, seq: 1, label, amount: net, sort_order: 0, status: "pending",
  });
  if (iErr) {
    // rollback หัวเอกสารถ้าสร้างงวดไม่สำเร็จ (กันเอกสารลอยไม่มีงวด)
    await supabase.from("billing_notes").delete().eq("id", bn.id);
    return fail("บันทึกงวดชำระไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: bn.id, code: bn.code }, 201);
}
