import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { syncFinanceEntry, promoteJobToProductionIfPending } from "@/lib/billing";

// PATCH /api/billing-notes/[id]/link
// "ดึงใบวางบิลนอกระบบเข้าระบบ" — ผูกบิลที่ออกไปก่อนแล้ว เข้ากับใบเสนอราคา/งานที่ออกทีหลัง
//   (เจ้าของสั่ง 7 ส.ค.69: วางบิลก่อน ค่อยออกใบเสนอ แล้วผูกกับคนนี้)
//
// สิ่งที่ทำ:
//   1) ผูก quotation_id + job_id (job มาจากใบเสนอ) · is_external = false · จด linked_at/by
//   2) auto-approve ใบเสนอ (เหมือนโฟลว์วางบิลปกติ — วางบิลแล้ว = ลูกค้าตกลงแล้ว)
//   3) ⚠ เติม finance_entries ย้อนหลังทุกงวดที่ "รับเงินไปแล้ว"
//      ตอนบิลยังไม่มี job_id การรับชำระจะข้าม sync เส้น B (lib/billing.ts) → เงินไม่เข้าบัญชี/ค้างรับ
//      ถ้าไม่เติมตรงนี้ ผูกงานแล้วเงินก็ยังหาย
//
// ไม่ทำ (ตั้งใจ):
//   · ไม่แก้ยอด/งวดของบิลตามใบเสนอ — บิลส่งลูกค้าไปแล้ว อาจมีใบเสร็จออกแล้ว (ยอดต้องนิ่ง)
//     ถ้ายอดไม่ตรงจะคืน warning ให้หน้าจอเตือน แต่ไม่บล็อก (เจ้าของตัดสินใจเอง)
//   · ไม่ทับ customer_snapshot อัตโนมัติ — ใบที่พิมพ์ส่งลูกค้าไปแล้วต้องคงหัวเดิม
//     ส่ง sync_customer: true ถ้าอยากให้ทับตามใบเสนอ

const BodySchema = z.object({
  quotation_id: z.number().int().positive("ต้องเลือกใบเสนอราคา"),
  sync_customer: z.boolean().optional().default(false),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "finance", "write")) return FORBIDDEN();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.errors[0]?.message ?? "payload ไม่ถูกต้อง");
  const { quotation_id: qid, sync_customer } = parsed.data;

  const supabase = createClient();

  // 1) บิลต้องมีอยู่ · ยังไม่ยกเลิก · ยังไม่เคยผูกใบเสนอ
  const { data: bn, error: bnErr } = await supabase
    .from("billing_notes")
    .select("id, code, status, total, quotation_id, job_id")
    .eq("id", params.id)
    .single<{ id: number; code: string; status: string; total: number; quotation_id: number | null; job_id: string | null }>();
  if (bnErr || !bn) return fail("ไม่พบใบวางบิล", 404);
  if (bn.status === "cancelled") return fail("ใบวางบิลถูกยกเลิกแล้ว ผูกเข้าระบบไม่ได้", 409);
  if (bn.quotation_id) return fail("ใบวางบิลนี้ผูกใบเสนอราคาอยู่แล้ว", 409);

  // 2) ใบเสนอต้องมีอยู่ · ไม่ถูกยกเลิก
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, code, status, net, job_id, customer_snapshot")
    .eq("id", qid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single<any>();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);
  if (q.status === "cancelled") return fail("ใบเสนอราคาถูกยกเลิกแล้ว ผูกไม่ได้", 409);

  // 3) ใบเสนอนี้ต้องยังไม่มีบิล active ใบอื่น (กันวางบิลซ้ำ — กติกาเดียวกับ POST /api/billing-notes)
  const { data: dup } = await supabase
    .from("billing_notes")
    .select("id, code")
    .eq("quotation_id", qid)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle<{ id: number; code: string }>();
  if (dup?.id) return fail(`ใบเสนอนี้มีใบวางบิลแล้ว (${dup.code}) — ผูกซ้ำไม่ได้`, 409);

  // 4) auto-approve ใบเสนอ (วางบิลไปแล้ว = ลูกค้าตกลงแล้ว)
  if (q.status !== "approved") {
    const { error: apErr } = await supabase.from("quotations").update({ status: "approved" }).eq("id", qid);
    if (apErr) return fail("อนุมัติใบเสนอราคาไม่สำเร็จ: " + apErr.message, 500);
  }

  // 5) ผูก
  const patch: Record<string, unknown> = {
    quotation_id: qid,
    job_id: q.job_id ?? null,
    ...(sync_customer ? { customer_snapshot: q.customer_snapshot } : {}),
  };
  const flags = { is_external: false, linked_at: new Date().toISOString(), linked_by: profile.id };
  let { error: upErr } = await supabase.from("billing_notes").update({ ...patch, ...flags }).eq("id", bn.id);
  if (upErr && /is_external|linked_at|linked_by/i.test(upErr.message ?? "")) {
    ({ error: upErr } = await supabase.from("billing_notes").update(patch).eq("id", bn.id));  // 0124 ยังไม่รัน
  }
  if (upErr) return fail("ผูกใบเสนอไม่สำเร็จ: " + upErr.message, 500);

  // 6) เติม finance_entries ย้อนหลัง — งวดที่จ่ายไปแล้วตอนยังไม่มีงาน
  let backfilled = 0;
  const warnings: string[] = [];
  if (q.job_id) {
    const { data: paidInsts } = await supabase
      .from("billing_installments")
      .select("id, seq, paid_amount, paid_date")
      .eq("billing_note_id", bn.id)
      .gt("paid_amount", 0)
      .order("seq", { ascending: true });
    const insts = (paidInsts ?? []) as { id: number; seq: number; paid_amount: number; paid_date: string | null }[];
    // ถ้าออกใบเสร็จไปแล้วตอนยังไม่ผูก ต้องผูก receipt_id ให้ finance_entry ด้วย
    // ไม่งั้น "ยกเลิกใบเสร็จ" จะหา entry ไม่เจอ → เงินค้างในบัญชีทั้งที่ใบเสร็จถูก void แล้ว
    const receiptOf = new Map<number, number>();
    if (insts.length) {
      const { data: rcs } = await supabase
        .from("receipts").select("id, installment_id")
        .in("installment_id", insts.map((i) => i.id))
        .eq("is_voided", false);   // receipts ใช้ is_voided ไม่ใช่ status (ตรงกับ void/route.ts)
      for (const r of (rcs ?? []) as { id: number; installment_id: number | null }[]) {
        if (r.installment_id != null) receiptOf.set(r.installment_id, r.id);
      }
    }
    for (const it of insts) {
      const err = await syncFinanceEntry(supabase, {
        jobId: q.job_id, installmentId: it.id, seq: it.seq,
        paid: Number(it.paid_amount) || 0,
        paidDate: it.paid_date || new Date().toISOString().slice(0, 10),
        ...(receiptOf.has(it.id) ? { receiptId: receiptOf.get(it.id) } : {}),
      });
      if (err) warnings.push(`งวด ${it.seq}: ลงบัญชีไม่สำเร็จ (${err})`);
      else backfilled++;
    }
    // งวดมัดจำ (seq 1) จ่ายแล้ว → ดันงานเข้าผลิตอัตโนมัติ (กันเคสผูกใบวางบิลนอกระบบแล้วงานไม่เข้าผลิต · Steve)
    const dep1 = insts.find((i) => i.seq === 1);
    if (dep1) await promoteJobToProductionIfPending(supabase, q.job_id, dep1.paid_date || new Date().toISOString().slice(0, 10));
  } else {
    warnings.push("ใบเสนอนี้ยังไม่ผูกงาน — เงินที่รับจะยังไม่ขึ้นในบัญชี/ค้างรับ ให้ผูกงานที่ใบเสนอก่อน");
  }

  // 7) ยอดไม่ตรง = เตือน ไม่บล็อก (บิลอาจออกใบเสร็จไปแล้ว ยอดต้องนิ่ง)
  const qNet = Number(q.net) || 0;
  if (qNet > 0 && Math.abs(qNet - (Number(bn.total) || 0)) > 0.5) {
    warnings.push(`ยอดไม่ตรงกัน: บิล ฿${Number(bn.total).toLocaleString("th-TH")} · ใบเสนอ ฿${qNet.toLocaleString("th-TH")} (ยอดบิลไม่ถูกแก้ — ตรวจสอบเอง)`);
  }

  return ok({ id: bn.id, quotation_code: q.code, backfilled, warnings });
}
