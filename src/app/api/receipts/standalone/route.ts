import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeTotals, splitCashReceived, baht } from "@/lib/money";
import { nextDocumentCode } from "@/lib/doc-code";
import { businessDateIssue } from "@/lib/date-guard";
import { getTaxLockBefore } from "@/lib/doc-cutoff";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// POST /api/receipts/standalone
// ใบเสร็จรับเงิน/ใบกำกับภาษี "ไม่ผูกงาน/ใบเสนอ" — กรอกหัวบิล+รายการเอง (เอกสารภาษีหลัก)
//   doc_kind: 'assess' = ค่าประเมินหน้างาน (default · เดิม) · 'standalone' = ออกใบเสร็จ/ใบกำกับสร้างใหม่ทั่วไป
//   ใช้เลขเอกสารชุดเดียวกับปกติ (next_document_code('INV')) — ใบกำกับทั้งกิจการรันเลขต่อเนื่องชุดเดียว
//   amount_mode: 'before_vat' (default · ยอดที่กรอกคือฐานก่อน VAT) · 'gross' (ยอดรวม VAT แล้ว → ถอด VAT ให้)
//   ⚠ ห้ามแตะ finance_entries (ไม่มี job — jobs.id NOT NULL บน finance_entries) · ห้าม insert job ปลอม
//   ⚠ ห้ามเรียก applyInstallmentPayment — ปิดงวด(ถ้ามี billing_note_id ผูก)ทำ best-effort แยกจากบัญชี ไม่ผูกกับใบนี้

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
  payment_method: z.string().optional(),
  issue_date: z.string().optional(),
  note: z.string().optional(),
  billing_note_id: z.number().int().positive().nullish(), // optional — ผูกใบวางบิลค่าประเมินถ้ามี
  doc_kind: z.enum(["assess", "standalone"]).optional(),  // default 'assess' (เดิม) · 'standalone' = ใบสร้างใหม่ทั่วไป
  amount_mode: z.enum(["before_vat", "gross"]).optional(), // ยอดที่กรอก = ก่อน VAT (default) หรือ รวม VAT
});

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN(); // ออกใบเสร็จ = สิทธิ์ finance (ADMIN/ACCOUNTING)

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.errors[0]?.message ?? "payload ไม่ถูกต้อง");
  const b = parsed.data;

  const itemName = b.item_name?.trim() || (b.doc_kind === "standalone" ? "รายการ" : "ค่าประเมินหน้างาน");
  const qty = b.qty ?? 1;
  const vatRate = b.vat_rate ?? 7;
  const whtRate = b.wht_rate ?? 0;
  const paymentMethod = b.payment_method || "transfer";

  // money core เดียวกับทั้งระบบ — ห้ามคิด VAT/WHT เอง
  // base=subtotal(ก่อน VAT) · vat=vat_amt · wht=wht_amt · เงินสดรับจริง(=amount=net)
  let subtotal: number, vatAmt: number, whtAmt: number, net: number;
  if (b.amount_mode === "gross") {
    // ยอดที่กรอก = รวม VAT แล้ว (base+VAT) → ถอด VAT ด้วย helper เดียวกับที่บัญชีเคาะ (ปัดภาษีก่อน ฐานอุ้มเศษ)
    //   WHT คิดจากฐานก่อน VAT (ท.ป.4/2528) · เงินสดรับจริง = ยอดรวม − WHT
    const grossTotal = round2(qty * b.unit_price);
    const s = splitCashReceived(grossTotal, vatRate, 0); // base+vat = grossTotal เป๊ะ
    subtotal = s.base; vatAmt = s.vat;
    whtAmt = round2((subtotal * whtRate) / 100);
    net = round2(grossTotal - whtAmt);
  } else {
    const m = computeTotals({ items: [{ qty, unit_price: b.unit_price }], vat_rate: vatRate, discount_pct: 0, wht_rate: whtRate });
    subtotal = m.subtotal; vatAmt = m.vat_amt; whtAmt = m.wht_amt; net = m.net;
  }
  if (net <= 0) return fail("ยอดสุทธิต้องมากกว่า 0", 400);

  const supabase = createClient();

  // ถ้าระบุ billing_note_id → ต้องมีอยู่จริงและยังไม่ยกเลิก (เอาไว้อ้างอิงบนใบเสร็จ)
  if (b.billing_note_id) {
    const { data: bn, error: bnErr } = await supabase
      .from("billing_notes").select("id, status").eq("id", b.billing_note_id)
      .single<{ id: number; status: string }>();
    if (bnErr || !bn) return fail("ไม่พบใบวางบิลที่อ้างอิง", 404);
    if (bn.status === "cancelled") return fail("ใบวางบิลที่อ้างอิงถูกยกเลิกแล้ว", 409);
  }

  // issue_date = tax point — คุมทั้งเลขเอกสารและ header (คำนวณครั้งเดียวใช้ร่วมกัน)
  const issueDate = b.issue_date || new Date().toISOString().slice(0, 10);
  const dateIssue = businessDateIssue(issueDate, { label: "วันที่ออก" }); // เอกสารภาษี — ห้ามอนาคต
  if (dateIssue) return fail(dateIssue, 400);
  // tax-lock — กันออกใบกำกับย้อนเข้าเดือนที่ยื่น ภ.พ.30 ปิดแล้ว (VAT ขายเดือนนั้นขาด) · ตรงกับ route แก้วันที่
  const lockBefore = await getTaxLockBefore();
  if (lockBefore && issueDate < lockBefore) {
    return fail(`วันที่ก่อน ${lockBefore} ถูกล็อกแล้ว (ยื่นภาษีปิดเดือนนั้นแล้ว) — ออกใบไม่ได้`, 409);
  }

  const { code, error: codeErrMsg } = await nextDocumentCode(supabase, "INV", issueDate);
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

  const itemDesc = qty > 1 ? `${itemName} (${qty} × ฿${baht(b.unit_price)})` : itemName;

  const rcBase: Record<string, unknown> = {
    code,
    billing_note_id: b.billing_note_id ?? null,
    installment_id: null,
    customer_snapshot: customerSnapshot,
    issue_date: issueDate,
    amount: net,     // เงินสดที่รับจริง (= net)
    vat_rate: vatRate,
    vat_amt: vatAmt,
    net: net,
    payment_method: paymentMethod,
    note: b.note ?? "",
    item_desc: itemDesc,
    created_by: profile.id,
  };
  const rcTax: Record<string, unknown> = {
    base_amt: subtotal, wht_rate: whtRate, wht_amt: whtAmt,
  };

  const docKind = b.doc_kind ?? "assess";
  let insertPayload: Record<string, unknown> = { ...rcBase, ...rcTax, doc_kind: docKind };
  let { data: rc, error: rcErr } = await supabase
    .from("receipts").insert(insertPayload).select("id, code").single();
  // migration 0115 (doc_kind) ยังไม่รัน → ตัด doc_kind ออก (ฐาน/VAT/WHT ยังถูกต้อง)
  if (rcErr && /doc_kind/i.test(rcErr.message ?? "")) {
    insertPayload = { ...rcBase, ...rcTax };
    ({ data: rc, error: rcErr } = await supabase
      .from("receipts").insert(insertPayload).select("id, code").single());
  }
  // migration 0095 (ยอดแยกใบเสร็จ base_amt/wht_rate/wht_amt) ยังไม่รัน
  if (rcErr && /base_amt|wht_rate|wht_amt/i.test(rcErr.message ?? "")) {
    if (whtRate > 0) {
      return fail("ใบนี้มีหัก ณ ที่จ่าย — ต้องรัน migration 0095 ก่อนออกใบเสร็จ (ไม่งั้นฐานภาษีบนใบจะผิด)", 400);
    }
    // 0095 ไม่รัน (แต่ 0115 อาจรันแล้ว) → ยังคง doc_kind ไว้ กัน standalone/assess กลาย 'work' เงียบ ๆ (qa BUG-2)
    ({ data: rc, error: rcErr } = await supabase.from("receipts").insert({ ...rcBase, doc_kind: docKind }).select("id, code").single());
    if (rcErr && /doc_kind/i.test(rcErr.message ?? "")) {
      ({ data: rc, error: rcErr } = await supabase.from("receipts").insert(rcBase).select("id, code").single());
    }
  }
  if (rcErr || !rc) return fail("บันทึกใบเสร็จไม่สำเร็จ: " + (rcErr?.message ?? ""), 500);

  const receiptId = Number((rc as { id: number; code: string }).id);

  // best-effort: ถ้าผูกใบวางบิลค่าประเมิน (ไม่มีงวดปกติ 1 งวด) → ปิดงวด+ทำเครื่องหมายว่าจ่ายแล้ว
  // ⚠ ห้ามเรียก applyInstallmentPayment (มันเขียน finance_entries) — ใบค่าประเมินไม่มี job ผูก ห้ามสร้าง finance_entries
  //   ทำแค่ปิดงวด/สถานะบิลตรง ๆ ผ่าน supabase update (ไม่ผ่าน finance_entries) — ห่อ try/catch กันพลาดแล้วดึงใบเสร็จที่สร้างไปแล้วล้ม
  //   (ใบเสร็จออกได้เป็นหลัก แม้ปิดงวดไม่สำเร็จ ผู้ใช้ปิดงวดเองที่หน้าใบวางบิลได้ทีหลัง)
  if (b.billing_note_id) {
    try {
      const { data: inst } = await supabase
        .from("billing_installments").select("id, amount")
        .eq("billing_note_id", b.billing_note_id).eq("seq", 1)
        .maybeSingle<{ id: number; amount: number }>();
      if (inst) {
        await supabase.from("billing_installments").update({
          status: "paid", paid_amount: inst.amount, paid_date: issueDate,
        }).eq("id", inst.id);
        await supabase.from("billing_notes").update({ status: "paid" }).eq("id", b.billing_note_id);
      }
    } catch {
      // best-effort เท่านั้น — ไม่ทำให้การออกใบเสร็จ (ซึ่งสำเร็จแล้ว) ล้มเหลว
    }
  }

  return ok({ id: rc.id, code: rc.code }, 201);
}
