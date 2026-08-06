import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * PUT /api/floor-quotations/[id]/installments — บันทึกงวดเงินทั้งชุด (แทนที่ของเดิม)
 * body: { rows: [{ seq, label, amount, work_items, is_final }] }
 *
 * seq 0 = มัดจำ · 1..N = งวด · งวดสุดท้าย (is_final) = "เก็บเงินส่วนที่เหลือ"
 *
 * ⚠ บทเรียนจากใบจริง (คุณพิทยารัตน์ Rev03): ผลรวมงวด 287,612 ≠ ใบเสนอ 305,612 (ต่าง 18,000
 *   = 2 ข้อที่ติดป้าย "งานเพิ่ม" ที่เพิ่มทีหลัง) → ตอบกลับ diff เสมอให้หน้าจอเตือน แต่ไม่บล็อก
 *   (บางทีตั้งใจแยกเก็บงานเพิ่มต่างหากจริง ๆ)
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return fail("ต้องส่ง rows");
  if (rows.length > 20) return fail("งวดมากเกินไป (สูงสุด 20)");

  const supabase = createClient();
  const { data: q, error: qErr } = await supabase
    .from("floor_quotations").select("id, total, status").eq("id", params.id).single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคางานพื้น", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((q as any).status === "cancelled") return fail("ใบนี้ยกเลิกแล้ว แก้ไขไม่ได้");

  const clean = rows.map((rw: Record<string, unknown>, i: number) => ({
    quotation_id: Number(params.id),
    seq: Number.isFinite(Number(rw?.seq)) ? Number(rw.seq) : i,
    label: String(rw?.label ?? "").trim().slice(0, 200),
    amount: r2(Number(rw?.amount) || 0),
    work_items: String(rw?.work_items ?? "").trim().slice(0, 4000),
    is_final: !!rw?.is_final,
  }));

  // seq ต้องไม่ซ้ำ (DB มี unique constraint อยู่แล้ว — เช็คก่อนเพื่อให้ error อ่านง่าย)
  const seqs = clean.map((c: { seq: number }) => c.seq);
  if (new Set(seqs).size !== seqs.length) return fail("ลำดับงวดซ้ำกัน");

  const { error: dErr } = await supabase.from("floor_installments").delete().eq("quotation_id", params.id);
  if (dErr) return fail("ลบงวดเดิมไม่สำเร็จ: " + dErr.message, 500);

  if (clean.length > 0) {
    const { error: iErr } = await supabase.from("floor_installments").insert(clean);
    if (iErr) return fail("บันทึกงวดไม่สำเร็จ: " + iErr.message, 500);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quoteTotal = Number((q as any).total) || 0;
  const sum = r2(clean.reduce((a: number, c: { amount: number }) => a + c.amount, 0));
  const diff = r2(quoteTotal - sum);

  await audit({
    userId: profile.id, action: "SAVE_FLOOR_INSTALLMENTS", table: "floor_installments",
    recordId: String(params.id), newValue: { rows: clean.length, sum, quoteTotal, diff },
  });

  return ok({ rows: clean.length, sum, quote_total: quoteTotal, diff });
}
