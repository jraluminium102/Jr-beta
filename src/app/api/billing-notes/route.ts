import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { suggestInstallments, computeTotals, planInstallments } from "@/lib/money";
import { getDocCutoff } from "@/lib/doc-cutoff";
import { nextDocumentCode } from "@/lib/doc-code";
import { businessDateIssue } from "@/lib/date-guard";
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

  // 1) ดึงใบเสนอราคา (+ revision_no สำหรับป้าย "อ้าง Rev ไหน" — 0133 · เผื่อ 0093 ยังไม่รัน → fallback)
  const QCOLS = "id, status, net, subtotal, discount_pct, discount_amt, discount_label, vat_rate, wht_rate, customer_snapshot, customer_id, job_id";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = null; let qErr: { message?: string } | null = null;
  {
    const r1 = await supabase.from("quotations").select(QCOLS + ", revision_no").eq("id", body.quotation_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single<any>();
    if (r1.error && /revision_no/i.test(r1.error.message ?? "")) {
      const r2 = await supabase.from("quotations").select(QCOLS).eq("id", body.quotation_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .single<any>();
      q = r2.data; qErr = r2.error;
    } else { q = r1.data; qErr = r1.error; }
  }
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
  // ค่าแรง (17 ก.ค.69) — หัก ณ ที่จ่ายเฉพาะค่าแรง · กรอกได้บาท(authoritative)หรือ% · เฉพาะใบที่รู้ยอดก่อน VAT ชัด
  const bLaborAmount = hasSubtotal && body.labor_amount != null && body.labor_amount !== "" ? Number(body.labor_amount) : undefined;
  const bLaborPct = hasSubtotal && body.labor_pct != null && body.labor_pct !== "" ? Number(body.labor_pct) : undefined;
  const bt = computeTotals({
    items: [{ qty: 1, unit_price: bSubtotal }], vat_rate: bVat, discount_pct: bDisc, wht_rate: bWht,
    ...(bDiscAmt != null ? { discount_amt: bDiscAmt } : {}),
    ...(bLaborAmount != null ? { labor_amount: bLaborAmount } : {}),
    ...(bLaborPct != null ? { labor_pct: bLaborPct } : {}),
  });
  // โหมดบาท (กรอกส่วนลดเป็นจำนวน) → เก็บ discount_pct = 0 (ไม่ back-calc %ปลอม) · discount_amt เป็นตัวตั้งจริง
  //   เดิม back-calc เป็น % แล้วเก็บ → พอเปิด/พิมพ์ใบที่บันทึก %ปลอมโผล่ทุกที่ (เจ้าของ 6 ส.ค.: ใส่จำนวนไม่อยากเห็น %)
  //   หน้ารายละเอียด/พิมพ์/footer guard discount_pct>0 อยู่แล้ว → pct=0 = โชว์แค่ "ส่วนลด -฿X" ไม่มี %
  const bStoredPct = bDiscAmt != null ? 0 : bDisc;
  const net = bt.net;
  if (net <= 0) return fail("ยอดสุทธิต้องมากกว่า 0 จึงวางบิลได้", 400);

  // มีค่าแรง → planInstallments (ค่าแรงงวดสุดท้าย + ภาษี booked ต่องวด) · ไม่มี → suggestInstallments เดิม (legacy)
  const useLaborPlan = bt.labor_amt > 0.005;
  const taxPlan = useLaborPlan
    ? planInstallments({ material_amt: bt.material_amt, labor_amt: bt.labor_amt, vat_rate: bVat, wht_rate: bWht, hasRetention: !!body.has_retention }).installments
    : null;
  const plan = taxPlan
    ? taxPlan.map((i) => ({ seq: i.seq, label: i.label, amount: i.amount }))
    : suggestInstallments(net, bVat);   // ส่ง VAT → label ขึ้นบรรทัด "ค่าวัสดุ (รวมVat)" (22 ก.ค.69)
  const billTotal = plan.reduce((s, p) => s + p.amount, 0);

  // issue_date คุมทั้งเลขเอกสาร (next_document_code p_date) และ header — คำนวณครั้งเดียวใช้ร่วมกัน
  const issueDate = body.issue_date || new Date().toISOString().slice(0, 10);
  const dateIssue = businessDateIssue(issueDate, { allowFuture: true, label: "วันที่ออก" }); // BL ไม่ใช่เอกสารภาษี — วันในอนาคตได้ (นัดออกล่วงหน้า)
  if (dateIssue) return fail(dateIssue, 400);

  // 3) ออกรหัสอัตโนมัติผ่าน RPC — เลขต้องตรงเดือนของ issue_date (ไม่ใช่วันนี้)
  const { code, error: codeErrMsg } = await nextDocumentCode(supabase, "BL", issueDate);
  if (!code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErrMsg ?? ""), 500);

  // 3.5) ใบเสนอนอกระบบ/ลูกค้าใหม่ที่ยังไม่มีงาน (job_id null) → สร้างงานให้ก่อนวางบิล
  //   วางบิล = ดีลจริง → ต้องมีงานเพื่อให้ "บันทึกชำระมัดจำ" ดันเข้าผลิตได้ (กันเคส BL2569080073 งานไม่เข้าผลิต)
  let linkedJobId: string | null = q.job_id ?? null;
  if (!linkedJobId) {
    const snap = (q.customer_snapshot ?? {}) as Record<string, unknown>;
    // ⚠ ชื่อในผลิต/ติดตั้ง = ชื่อลูกค้าจริง (customers.name) — ไม่ใช่ snapshot.name ที่อาจเป็น "นามบิล/บริษัท"
    //   (25 ส.ค.69: ลูกค้าออกเอกสารในนามบริษัท → เดิมเอาชื่อบริษัทไปโชว์ในผลิต · บริษัทเป็นแค่เรื่องเอกสารการเงิน)
    let cName = "";
    let cArea = "";   // ที่อยู่ (customer_area) — ดึงจากทะเบียนด้วย ไม่งั้นผลิต/ติดตั้งที่อยู่ว่างหลังมัดจำ (บัคคุณธนัชชา 30 ส.ค.69)
    if (q.customer_id != null) {
      const { data: rc } = await supabase.from("customers").select("name, address").eq("id", q.customer_id).maybeSingle<{ name: string; address: string }>();
      cName = String(rc?.name ?? "").trim();
      cArea = String(rc?.address ?? "").trim();
    }
    if (!cName) cName = String((snap.name as string) ?? "").trim() || "ลูกค้า";
    if (!cArea) cArea = String((snap.address as string) ?? "").trim();
    const chMap: Record<string, string> = { LINE: "LINE", FB: "FACEBOOK", FACEBOOK: "FACEBOOK", IG: "INSTAGRAM", INSTAGRAM: "INSTAGRAM", OTHER: "OTHER" };
    const cCh = chMap[String((snap.contact_channel as string) ?? "").toUpperCase()] ?? "OTHER";
    const { data: newJob, error: jErr } = await supabase
      .from("jobs")
      .insert({ customer_name: cName, ...(q.customer_id != null ? { customer_id: q.customer_id } : {}), ...(cArea ? { customer_area: cArea } : {}), channel: cCh, assess_date: issueDate, status: "PENDING_QUOTE" } as never)
      .select("id")
      .single<{ id: string }>();
    if (jErr || !newJob) return fail("สร้างงานให้ใบวางบิลไม่สำเร็จ: " + (jErr?.message ?? ""), 500);
    linkedJobId = newJob.id;
    await supabase.from("quotations").update({ job_id: linkedJobId }).eq("id", q.id);
  }

  // 4) insert หัวเอกสาร
  const bnBase: Record<string, unknown> = {
    code,
    quotation_id: q.id,
    job_id: linkedJobId,               // เชื่อม job เพื่อ sync finance_entries (สร้างให้แล้วถ้าใบเสนอยังไม่มีงาน)
    customer_snapshot: q.customer_snapshot,
    issue_date: issueDate,
    total: billTotal,
    status: "unpaid",
    note: body.note ?? "",
    created_by: profile.id,
  };
  // labor_amt (บาท · 0102) = ฐาน WHT authoritative · labor_ratio (%) เก็บไว้โชว์ (derive) — ไม่บังคับ null เมื่อมี WHT อีกต่อไป
  //   (โมเดลใหม่: WHT booked ต่องวด อยู่กับค่าแรงได้ — เลิก guard เดิมที่ห้ามค่าแรงคู่ WHT)
  const bLaborAmt = useLaborPlan ? bt.labor_amt : null;
  const bLaborRatio = useLaborPlan && bt.after_discount > 0 ? Math.round((bt.labor_amt / bt.after_discount) * 10000) / 100 : null;

  // has_tax_breakdown = true เฉพาะใบที่ subtotal เป็นยอดก่อน VAT จริง (hasSubtotal) → อนุญาตแก้ footer/ติ๊ก VAT ภายหลัง
  // vat_rate_set = hasSubtotal เช่นกัน — ใบที่สืบยอดก่อน VAT จากใบเสนอได้ = รู้อัตรา VAT ชัด → ใบเสร็จใช้ค่านี้ (0095)
  // 0133 — จำว่าตอนออกบิล ใบเสนออยู่ Rev ไหน · ใบเสนอ Rev ใหม่กว่านี้เมื่อไร บิลใบนี้ขึ้นป้าย "เช็คยอดใหม่"
  //   ใส่ในก้อน breakdown เพราะมี fallback insert แบบไม่มีคอลัมน์อยู่แล้ว (เผื่อยังไม่ได้รัน 0133)
  const bnBreakdown = { subtotal: bt.subtotal, discount_pct: bStoredPct, discount_amt: bt.discount_amt, discount_label: bDiscLabel, vat_rate: bVat, vat_amt: bt.vat_amt, wht_rate: bWht, wht_amt: bt.wht_amt, has_tax_breakdown: hasSubtotal, vat_rate_set: hasSubtotal, labor_ratio: bLaborRatio, labor_amt: bLaborAmt, source_revision_no: Number((q as { revision_no?: number }).revision_no) || 0 };
  let { data: bn, error: bnErr } = await supabase
    .from("billing_notes").insert({ ...bnBase, ...bnBreakdown }).select("id, code").single();
  // กันพัง: ถ้า migration 0078/0079/0081/0102/0133 (ยอดแยก/ค่าแรง/Rev) ยังไม่รัน → insert ใหม่แบบไม่มี breakdown
  //   (total ยังถูก · ใบวางบิลใช้ทุกวัน ห้ามออกบิลไม่ได้เพราะรอ migration)
  //   ⚠ เพิ่มชื่อคอลัมน์ใหม่ทุกครั้งที่ใส่ของเข้า bnBreakdown ไม่งั้น fallback ไม่ทำงาน = ออกบิลไม่ได้ทั้งบริษัท
  //     (QA จับได้ 1 ก.ย.69: ใส่ source_revision_no แล้วลืมเพิ่มในนี้)
  if (bnErr && /subtotal|discount_amt|discount_label|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|vat_rate_set|labor_ratio|labor_amt|source_revision_no|ack_revision_no/i.test(bnErr.message ?? "")) {
    ({ data: bn, error: bnErr } = await supabase.from("billing_notes").insert(bnBase).select("id, code").single());
  }
  if (bnErr || !bn) return fail("บันทึกใบวางบิลไม่สำเร็จ: " + (bnErr?.message ?? ""), 500);

  // 5) สร้างงวดชำระอัตโนมัติ (plan/taxPlan คำนวณไว้แล้วด้านบน) — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  //    มี taxPlan → เก็บภาษี booked ต่องวด (base/vat/wht/kind) ให้ใบเสร็จอ่านต่องวด · fallback ถ้า 0102 ยังไม่รัน
  const bnId = bn.id;
  const baseRows = plan.map((p) => ({ billing_note_id: bnId, seq: p.seq, label: p.label, amount: p.amount, sort_order: p.seq - 1, status: "pending" as const }));
  const taxRows = taxPlan
    ? baseRows.map((r, i) => ({ ...r, base_amt: taxPlan[i].base_amt, vat_amt: taxPlan[i].vat_amt, wht_amt: taxPlan[i].wht_amt, vat_rate: taxPlan[i].vat_rate, wht_rate: taxPlan[i].wht_rate, kind: taxPlan[i].kind }))
    : baseRows;
  let { error: iErr } = await supabase.from("billing_installments").insert(taxRows);
  if (iErr && taxPlan && /base_amt|vat_amt|wht_amt|vat_rate|wht_rate|kind/i.test(iErr.message ?? "")) {
    ({ error: iErr } = await supabase.from("billing_installments").insert(baseRows));  // 0102 ยังไม่รัน → งวดแบบเดิม
  }
  if (iErr) {
    await supabase.from("billing_notes").delete().eq("id", bnId);
    return fail("บันทึกงวดชำระไม่สำเร็จ: " + iErr.message, 500);
  }

  return ok({ id: bn.id, code: bn.code }, 201);
}
