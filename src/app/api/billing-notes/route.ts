import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { suggestInstallments } from "@/lib/money";
import type { Quotation } from "@/lib/types";

// GET /api/billing-notes  → รายการใบวางบิล
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_notes")
    .select("id, code, customer_snapshot, issue_date, total, status, created_at")
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/billing-notes  → สร้างใบวางบิลจากใบเสนอราคา
// การสร้างบิล = รู้โดยนัยว่าลูกค้าอนุมัติแล้ว → auto-approve quotation ถ้ายังไม่ approved
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.quotation_id) return fail("ต้องเลือกใบเสนอราคา");

  const supabase = createClient();

  // 1) ดึงใบเสนอราคา
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, status, net, customer_snapshot, job_id")
    .eq("id", body.quotation_id)
    .single<Pick<Quotation, "id" | "status" | "net" | "customer_snapshot"> & { job_id: string | null }>();
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

  const net = Number(q.net) || 0;
  if (net <= 0) return fail("ยอดสุทธิของใบเสนอต้องมากกว่า 0 จึงวางบิลได้", 400);

  // [🔴#2] total ต้อง = ผลรวมงวด (suggestInstallments ปัด Math.round(net) เป็นบาทเต็ม)
  // ถ้าใช้ total = net (มีเศษสตางค์) constraint tg_check_installment_sum (tol 0.01) จะเด้ง
  // → insert งวดล้ม → ลบหัวบิลทิ้ง → ลูกค้าวางบิลใบนั้นไม่ได้เลย
  const plan = suggestInstallments(net);
  const billTotal = plan.reduce((s, p) => s + p.amount, 0);

  // 3) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "BL" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 4) insert หัวเอกสาร
  const { data: bn, error: bnErr } = await supabase
    .from("billing_notes")
    .insert({
      code,
      quotation_id: q.id,
      job_id: q.job_id ?? null,          // เชื่อม job เพื่อ sync finance_entries
      customer_snapshot: q.customer_snapshot,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      total: billTotal,
      status: "unpaid",
      note: body.note ?? "",
      created_by: profile.id,
    })
    .select("id, code")
    .single();
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
