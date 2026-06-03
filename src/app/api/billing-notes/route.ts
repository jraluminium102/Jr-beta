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

// POST /api/billing-notes  → สร้างใบวางบิลจากใบเสนอราคาที่อนุมัติ (ออกรหัส + แบ่งงวด)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  if (!body.quotation_id) return fail("ต้องเลือกใบเสนอราคา");

  const supabase = createClient();

  // 1) ดึงใบเสนอราคา — ต้องอนุมัติแล้วเท่านั้น
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, status, net, customer_snapshot")
    .eq("id", body.quotation_id)
    .single<Pick<Quotation, "id" | "status" | "net" | "customer_snapshot">>();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);
  if (q.status !== "approved") return fail("ใบเสนอต้องอนุมัติก่อน");

  const net = Number(q.net) || 0;

  // 2) ออกรหัสอัตโนมัติผ่าน RPC
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_doc_type: "BL" });
  if (codeErr || !code) return fail("ออกรหัสไม่สำเร็จ: " + (codeErr?.message ?? ""), 500);

  // 3) insert หัวเอกสาร
  const { data: bn, error: bnErr } = await supabase
    .from("billing_notes")
    .insert({
      code,
      quotation_id: q.id,
      customer_snapshot: q.customer_snapshot,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      total: net,
      status: "unpaid",
      note: body.note ?? "",
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (bnErr || !bn) return fail("บันทึกใบวางบิลไม่สำเร็จ: " + (bnErr?.message ?? ""), 500);

  // 4) สร้างงวดชำระอัตโนมัติ — ถ้าพลาดให้ลบหัวเอกสารทิ้ง
  const plan = suggestInstallments(net);
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
