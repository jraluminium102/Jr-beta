import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";
import { sumItems } from "@/lib/floor-calc/engine.mjs";
import { normalizeItems } from "../route";

export const dynamic = "force-dynamic";

// GET /api/floor-quotations/[id] — ใบเสนอ + รายการ + งวดเงิน
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("floor_quotations")
    .select("*, floor_quotation_items(*), floor_installments(*)")
    .eq("id", params.id)
    .single();
  if (error || !data) return fail("ไม่พบใบเสนอราคางานพื้น", 404);
  return ok(data);
}

/**
 * PATCH /api/floor-quotations/[id] — แก้ใบ (หัว/รายการ/งวด)
 * ส่งคีย์ไหนอัปเดตคีย์นั้น · ส่ง items มา = แทนที่รายการทั้งชุด (แล้วคิด total ใหม่)
 *
 * rev: ส่ง bump_rev=true → นับ Rev +1 (พิมพ์ "(Rev01)" ท้ายชื่อเอกสารเหมือนใบจริง)
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const supabase = createClient();

  const { data: cur, error: cErr } = await supabase
    .from("floor_quotations").select("id, code, rev, status, total").eq("id", params.id).single();
  if (cErr || !cur) return fail("ไม่พบใบเสนอราคางานพื้น", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cu = cur as any;
  if (cu.status === "cancelled") return fail("ใบนี้ยกเลิกแล้ว แก้ไขไม่ได้");

  const patch: Record<string, unknown> = {};

  if (body?.customer !== undefined) {
    const name = String(body.customer?.name ?? "").trim();
    if (!name) return fail("กรุณากรอกชื่อลูกค้า");
    patch.customer_snapshot = {
      name: name.slice(0, 200),
      address: String(body.customer?.address ?? "").trim().slice(0, 500),
      phone: String(body.customer?.phone ?? "").trim().slice(0, 40),
    };
  }
  if (body?.issue_date !== undefined) {
    const d = String(body.issue_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
    if (Number(d.slice(0, 4)) >= 2500) return fail("กรุณากรอกปี ค.ศ. (ไม่ใช่ พ.ศ.)");
    patch.issue_date = d;
  }
  if (body?.status !== undefined) {
    const s = String(body.status);
    if (!["draft", "sent", "accepted", "cancelled"].includes(s)) return fail("สถานะไม่ถูกต้อง");
    patch.status = s;
  }
  if (body?.contractor !== undefined) patch.contractor = body.contractor;
  if (body?.calc !== undefined) patch.calc = body.calc;
  if (body?.note !== undefined) patch.note = String(body.note).trim();
  if (body?.job_id !== undefined) patch.job_id = body.job_id || null;
  if (body?.customer_id !== undefined) patch.customer_id = body.customer_id || null;
  if (body?.bump_rev) patch.rev = (Number(cu.rev) || 0) + 1;

  // ── รายการ: ส่งมา = แทนที่ทั้งชุด ──
  let newTotal: number | null = null;
  if (Array.isArray(body?.items)) {
    if (body.items.length === 0) return fail("ต้องมีอย่างน้อย 1 รายการ");
    if (body.items.length > 200) return fail("รายการมากเกินไป (สูงสุด 200)");
    const clean = normalizeItems(body.items);
    newTotal = sumItems(clean);

    const { error: dErr } = await supabase.from("floor_quotation_items").delete().eq("quotation_id", params.id);
    if (dErr) return fail("ลบรายการเดิมไม่สำเร็จ: " + dErr.message, 500);
    const { error: iErr } = await supabase
      .from("floor_quotation_items")
      .insert(clean.map((it, i) => ({ ...it, quotation_id: Number(params.id), sort_order: i })));
    if (iErr) return fail("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
    patch.total = newTotal;
  }

  if (Object.keys(patch).length === 0) return fail("ไม่มีข้อมูลให้แก้ไข");

  const { error: uErr } = await supabase.from("floor_quotations").update(patch).eq("id", params.id);
  if (uErr) return fail("บันทึกไม่สำเร็จ: " + uErr.message, 500);

  await audit({
    userId: profile.id, action: "EDIT_FLOOR_QUOTATION", table: "floor_quotations",
    recordId: String(params.id),
    oldValue: { total: cu.total, rev: cu.rev },
    newValue: { ...patch, items: Array.isArray(body?.items) ? body.items.length : undefined },
  });

  return ok({ id: Number(params.id), total: newTotal ?? cu.total, rev: patch.rev ?? cu.rev });
}

// DELETE /api/floor-quotations/[id] — ยกเลิกใบ (ไม่ลบจริง เก็บ audit trail)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const supabase = createClient();
  const { error } = await supabase.from("floor_quotations").update({ status: "cancelled" }).eq("id", params.id);
  if (error) return fail("ยกเลิกไม่สำเร็จ: " + error.message, 500);

  await audit({
    userId: profile.id, action: "CANCEL_FLOOR_QUOTATION", table: "floor_quotations", recordId: String(params.id),
  });
  return ok({ id: Number(params.id), status: "cancelled" });
}
