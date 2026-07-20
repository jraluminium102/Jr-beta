import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { suggestInstallments, computeTotals } from "@/lib/money";
import { getDocCutoff } from "@/lib/doc-cutoff";
import type { Quotation } from "@/lib/types";

// GET /api/billing-notes  → รายการใบวางบิล (ซ่อนเอกสารทดสอบก่อนวันตัด · ?includeTest=1 โชว์ทั้งหมด)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const includeTest = new URL(req.url).searchParams.get("includeTest") === "1";
  const cutoff = includeTest ? "" : await getDocCutoff();
  const supabase = createClient();
  let query = supabase
    .from("billing_notes")
    .select("id, code, customer_snapshot, issue_date, total, status, created_at")
    .order("created_at", { ascending: false });
  if (cutoff) query = query.gte("issue_date", cutoff);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/billing-notes  → สร้างใบวางบิลจากใบเสนอราคา
// การสร้างบิล = รู้โดยนัยว่าลูกค้าอนุมัติแล้ว → auto-approve quotation ถ้ายังไม่ approved
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN(); // [🟡#6] วางบิล = สิทธิ์ finance (ADMIN/ACCOUNTING)

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.quotation_id) return fail("ต้องเลือกใบเสนอราคา");

  const supabase = createClient();

  // 1) ดึงใบเสนอราคา
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, status, net, subtotal, discount_pct, discount_amt, discount_label, vat_rate, wht_rate, customer_snapshot, job_id")
    .eq("id", body.quotation_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single<any>();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);
  // ห้ามสร้างจากใบที่ถูกยกเลิก
  if (q.status === "cancelled") return fail("ใบเสนอราคาถูกยกเลิกแล้ว สร้างบิลไม่ได้", 409);

  // กันวางบิลซ้ำจากใบเสนอเดิม (เปิดสองแท็บ/กด back) — มีบิล active อยู่แล้วห้ามสร้างซ้ำ
  const { data: existingBn } = await supabase
    .from("billing_notes")
    .select("id, code")
    .eq("quotation_id", q.id)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle<{ id: number; code: string }>();
  if (existingBn?.id) {
    return fail(`ใบเสนอนี้มีใบวางบิลแล้ว (${existingBn.code}) — เปิดใบเดิมแทนการสร้างซ้ำ`, 409);
  }

  // 2) auto-approve quotation ถ้ายังไม่ approved (การสร้างบิล = อนุมัติโดยนัย)
  if (q.status !== "approved") {
    const { error: approveErr } = await supabase
      .from("quotations")
      .update({ status: "approved" })
      .eq("id", q.id);
    if (approveErr) return fail("อนุมัติใบเสนอราคาอัตโนมัติไม่สำเร็จ: " + approveErr.message, 500);
  }

  // ยอดแยกของใบวางบิล — เริ่มจากยอดก่อนภาษี(subtotal)ของใบเสนอ · ส่วนลด/VAT/หัก ณ ที่จ่าย ปรับได้ตอนสร้าง (default=ค่าใบเสนอ)
  // ไม่คิดซ้ำ: base = subtotal (ยอดก่อนภาษี) ไม่ใช่ net · computeTotals แหล่งเดียวกับใบเสนอ (บัญชีคุม)
  // กันคิด VAT ซ้ำ (บัญชีเตือน): ใบเสนอ import เก่าไม่มี subtotal → net เป็นยอด "หลัง VAT/WHT" แล้ว
  //   ถ้าเอา net เป็น base แล้วคิด vat 7% อีก = คิดภาษีซ้ำ ยอดเกินจริง → ถือ net เป็นยอดล้วน บังคับ vat/wht/disc = 0
  const hasSubtotal = Number(q.subtotal) > 0;
  const bSubtotal = hasSubtotal ? Number(q.subtotal) : (Number(q.net) || 0);
  const bDisc = hasSubtotal ? (body.discount_pct != null ? Number(body.discount_pct) : (Number(q.discount_pct) || 0)) : 0;
  // สืบ "จำนวนเงินส่วนลด" จากใบเสนอตรง ๆ (ตัวตั้งจริง) กัน drift · body override ได้ · ไม่มี = คิดจาก %
  const bDiscAmt = hasSubtotal
    ? (body.discount_amt != null ? Number(body.discount_amt) : (q.discount_amt != null ? Number(q.discount_amt) : undefined))
    : 0;
  const bDiscLabel = String(body.discount_label ?? (q as { discount_label?: string }).discount_label ?? "").slice(0, 120);
  const bVat = hasSubtotal ? (body.vat_rate != null ? Number(body.vat_rate) : (Number(q.vat_rate) || 0)) : 0;
  const bWht = hasSubtotal ? (body.wht_rate != null ? Number(body.wht_rate) : (Number(q.wht_rate) || 0)) : 0;
  if (bDisc < 0 || bDisc > 100) return fail("ส่วนลดต้องอยู่ 0–100%");
  const bt = computeTotals({ items: [{ qty: 1, unit_price: bSubtotal }], vat_rate: bVat, discount_pct: bDisc, wht_rate: bWht, ...(bDiscAmt != null ? { discount_amt: bDiscAmt } : {}) });
  const bStoredPct = bDiscAmt != null ? (bt.subtotal > 0 ? Math.round((bt.discount_amt / bt.subtotal) * 10000) / 100 : 0) : bDisc;
  const net = bt.net;
  if (net <= 0) return fail("ยอดสุทธิต้องมากกว่า 0 จึงวางบิลได้", 400);

  // suggestInstallments รับ net (มีสตางค์) คืนงวดที่ผลรวม = net เป๊ะ
  const plan = suggestInstallments(net);
  const billTotal = plan.reduce((s, p) => s + p.amount, 0);

  // 3) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "BL" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert หัวเอกสาร
  const bnBase: Record<string, unknown> = {
    code,
    quotation_id: q.id,
    job_id: q.job_id ?? null,          // เชื่อม job เพื่อ sync finance_entries
    customer_snapshot: q.customer_snapshot,
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    total: billTotal,
    status: "unpaid",
    note: body.note ?? "",
    created_by: profile.id,
  };
  // labor_ratio = % ค่าแรง (0-100 หรือ null) — สำหรับแยกค่าของ/ค่าแรงในใบพิมพ์แยกงวด (ไม่กระทบยอด)
  // ⚠ ใช้ร่วมกับหัก ณ ที่จ่ายระดับใบ (bWht>0) ไม่ได้ — ยอดงวดเป็นยอดหลัง WHT การถอด VAT ต่องวดจะเพี้ยน (บัญชีเตือน)
  //    การแยกค่าแรงมีไว้ให้ "ลูกค้าหัก ณ ที่จ่ายเอง" ใบจึงต้องไม่หัก WHT มาก่อน → บังคับ null ถ้ามี WHT ระดับใบ
  const rawLabor = body.labor_ratio;
  const bLabor = bWht > 0 || rawLabor == null || rawLabor === "" ? null : Math.min(100, Math.max(0, Number(rawLabor) || 0));

  // has_tax_breakdown = true เฉพาะใบที่ subtotal เป็นยอดก่อน VAT จริง (hasSubtotal) → อนุญาตแก้ footer/ติ๊ก VAT ภายหลัง
  // vat_rate_set = hasSubtotal เช่นกัน — ใบที่สืบยอดก่อน VAT จากใบเสนอได้ = รู้อัตรา VAT ชัด → ใบเสร็จใช้ค่านี้ (0095)
  const bnBreakdown = { subtotal: bt.subtotal, discount_pct: bStoredPct, discount_amt: bt.discount_amt, discount_label: bDiscLabel, vat_rate: bVat, vat_amt: bt.vat_amt, wht_rate: bWht, wht_amt: bt.wht_amt, has_tax_breakdown: hasSubtotal, vat_rate_set: hasSubtotal, labor_ratio: bLabor };
  let { data: bn, error: bnErr } = await supabase
    .from("billing_notes").insert({ ...bnBase, ...bnBreakdown }).select("id, code").single();
  // กันพัง: ถ้า migration 0078/0079/0081 (ยอดแยก) ยังไม่รัน → insert ใหม่แบบไม่มี breakdown (total ยังถูก · ใบวางบิลใช้ทุกวัน)
  if (bnErr && /subtotal|discount_amt|discount_label|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|vat_rate_set|labor_ratio/i.test(bnErr.message ?? "")) {
    ({ data: bn, error: bnErr } = await supabase.from("billing_notes").insert(bnBase).select("id, code").single());
  }
  if (bnErr || !bn) return fail("บันทึกใบวางบิลไม่สำเร็จ: " + (bnErr?.message ?? ""), 500);

  // 5) สร้างงวดชำระอัตโนมัติ (plan คำนวณไว้แล้วด้านบน) — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const rows = plan.map((p) => ({
    billing_note_id: bn.id,
    seq: p.seq,
    label: p.label,
    amount: p.amount,
    sort_order: p.seq - 1,
    status: "pending" as const,
  }));
  const { error: iErr } = await supabase.from("billing_installments").insert(rows);
  if (iErr) {
    await supabase.from("billing_notes").delete().eq("id", bn.id);
    return fail("บันทึกงวดชำระไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: bn.id, code: bn.code }, 201);
}
