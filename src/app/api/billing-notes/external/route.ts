import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeTotals, suggestInstallments } from "@/lib/money";
import { nextDocumentCode } from "@/lib/doc-code";
import { businessDateIssue } from "@/lib/date-guard";

// POST /api/billing-notes/external
// ใบวางบิล "ลูกค้านอกระบบ" — ออกก่อนมีใบเสนอราคา/งานในระบบ (เจ้าของสั่ง 7 ส.ค.69)
//   quotation_id = job_id = null · is_external = true · doc_kind ยังเป็น 'work' (นับเป็นงานปกติ ไม่ใช่ค่าประเมิน)
//   ผูกเข้าระบบทีหลังผ่าน PATCH /api/billing-notes/[id]/link
//   ต่างจาก /standalone (doc_kind='assess' ค่าประเมินหน้างาน 1 รายการ ไม่ตั้งใจผูกงาน)

const CustomerSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อลูกค้า"),
  job: z.string().optional().default(""),
  address: z.string().optional().default(""),
  tax_id: z.string().optional().default(""),
  branch: z.string().optional().default(""),
  kind: z.string().optional().default(""),
  postal_code: z.string().optional().default(""),
  contact_person: z.string().optional().default(""),
  phone: z.string().optional().default(""),
});

const ItemSchema = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อรายการ"),
  qty: z.number().positive("จำนวนต้องมากกว่า 0"),
  unit_price: z.number({ invalid_type_error: "ราคาต่อหน่วยต้องเป็นตัวเลข" }).nonnegative("ราคาต่อหน่วยติดลบไม่ได้"),
});

const BodySchema = z.object({
  customer: CustomerSchema,
  items: z.array(ItemSchema).min(1, "ต้องมีอย่างน้อย 1 รายการ"),
  discount_pct: z.number().min(0).max(100).optional(),
  discount_amt: z.number().min(0).optional(),
  discount_label: z.string().optional(),
  vat_rate: z.union([z.literal(0), z.literal(7)]).optional(),
  wht_rate: z.union([z.literal(0), z.literal(3)]).optional(),
  issue_date: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN(); // วางบิล = สิทธิ์ finance (ADMIN/ACCOUNTING)

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.errors[0]?.message ?? "payload ไม่ถูกต้อง");
  const b = parsed.data;

  const vatRate = b.vat_rate ?? 7;
  const whtRate = b.wht_rate ?? 0;
  // โหมดบาทชนะ % (เหมือนใบเสนอ/บิลปกติ) · เก็บ discount_pct = 0 เมื่อกรอกเป็นบาท กัน %ปลอมโผล่บนใบ
  const useAmt = b.discount_amt != null && b.discount_amt > 0;
  const money = computeTotals({
    items: b.items.map((i) => ({ qty: i.qty, unit_price: i.unit_price })),
    vat_rate: vatRate,
    wht_rate: whtRate,
    discount_pct: useAmt ? 0 : (b.discount_pct ?? 0),
    ...(useAmt ? { discount_amt: b.discount_amt } : {}),
  });
  if (money.net <= 0) return fail("ยอดสุทธิต้องมากกว่า 0 จึงวางบิลได้", 400);

  const supabase = createClient();

  // BL ไม่ใช่เอกสารภาษี — ออกวันในอนาคตได้ (นัดวางบิลล่วงหน้า)
  const issueDate = b.issue_date || new Date().toISOString().slice(0, 10);
  const dateIssue = businessDateIssue(issueDate, { allowFuture: true, label: "วันที่ออก" });
  if (dateIssue) return fail(dateIssue, 400);

  const { code, error: codeErrMsg } = await nextDocumentCode(supabase, "BL", issueDate);
  if (!code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErrMsg ?? ""), 500);

  const customerSnapshot = { ...b.customer, line_id: "" };

  // งวดชำระ: ใช้ตัวแบ่งกลางตัวเดียวกับบิลปกติ (มัดจำ/ระหว่างผลิต/ก่อนติดตั้ง ฯลฯ)
  const plan = suggestInstallments(money.net, vatRate);
  const billTotal = plan.reduce((s, p) => s + p.amount, 0);

  const bnBase: Record<string, unknown> = {
    code,
    quotation_id: null,
    job_id: null,
    customer_snapshot: customerSnapshot,
    issue_date: issueDate,
    total: billTotal,
    status: "unpaid",
    note: b.note ?? "",
    created_by: profile.id,
  };
  const bnBreakdown: Record<string, unknown> = {
    subtotal: money.subtotal,
    discount_pct: useAmt ? 0 : (b.discount_pct ?? 0),
    discount_amt: money.discount_amt,
    discount_label: String(b.discount_label ?? "").slice(0, 120),
    vat_rate: vatRate, vat_amt: money.vat_amt,
    wht_rate: whtRate, wht_amt: money.wht_amt,
    has_tax_breakdown: true, vat_rate_set: true,
  };

  let insertPayload: Record<string, unknown> = { ...bnBase, ...bnBreakdown, is_external: true };
  let { data: bn, error: bnErr } = await supabase
    .from("billing_notes").insert(insertPayload).select("id, code").single();
  // migration 0124 ยังไม่รัน → ตัด is_external ออก (บิลยังออกได้ แค่ไม่มีป้าย/ปุ่มผูก)
  if (bnErr && /is_external/i.test(bnErr.message ?? "")) {
    insertPayload = { ...bnBase, ...bnBreakdown };
    ({ data: bn, error: bnErr } = await supabase
      .from("billing_notes").insert(insertPayload).select("id, code").single());
  }
  // migration ยอดแยก (0078/0079/0092/0095) ยังไม่รัน → insert แบบไม่มี breakdown (total ยังถูก)
  if (bnErr && /subtotal|discount_amt|discount_label|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|vat_rate_set/i.test(bnErr.message ?? "")) {
    ({ data: bn, error: bnErr } = await supabase.from("billing_notes").insert(bnBase).select("id, code").single());
  }
  if (bnErr || !bn) return fail("บันทึกใบวางบิลไม่สำเร็จ: " + (bnErr?.message ?? ""), 500);

  const { error: iErr } = await supabase.from("billing_installments").insert(
    plan.map((p) => ({
      billing_note_id: bn!.id, seq: p.seq, label: p.label,
      amount: p.amount, sort_order: p.seq - 1, status: "pending" as const,
    })),
  );
  if (iErr) {
    await supabase.from("billing_notes").delete().eq("id", bn.id);  // กันเอกสารลอยไม่มีงวด
    return fail("บันทึกงวดชำระไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: bn.id, code: bn.code }, 201);
}
