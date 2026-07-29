import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";

// PATCH /api/quotations/[id]/customer-name — แก้ชื่อลูกค้า (หัวบิล) บนใบเสนอ
//   body: { name: string, save_to_registry?: boolean }
//   - อัปเดต customer_snapshot.name ของใบนี้เสมอ (บิลที่ดูอยู่เปลี่ยนทันที)
//   - save_to_registry + มี customer_id → อัปเดต customers.name ในทะเบียน
//       → DB trigger 0051/0071 (apply_customer_name) กระจายชื่อไปทุกเอกสาร/เฟสของลูกค้ารายนี้
//       (แตะเฉพาะ key name · ไม่แตะ tax_id/address = ปลอดภัยเรื่องภาษี)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const saveToRegistry = body?.save_to_registry !== false; // default = true
  if (!name) return fail("กรุณากรอกชื่อลูกค้า");
  if (name.length > 200) return fail("ชื่อลูกค้ายาวเกินไป");

  const supabase = createClient();

  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, customer_id, customer_snapshot")
    .eq("id", params.id)
    .single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = ((q as any).customer_snapshot ?? {}) as Record<string, unknown>;
  const oldName = String(snap.name ?? "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerId = (q as any).customer_id as number | null;

  if (name === oldName && !(saveToRegistry && customerId)) {
    return ok({ name, propagated: false }); // ไม่มีอะไรเปลี่ยน
  }

  // 1) อัปเดตทะเบียนก่อน (ถ้าเลือก + มีลิงก์) — trigger จะกระจายไปเอกสารอื่นที่ใช้ชื่อเดิม
  let propagated = false;
  if (saveToRegistry && customerId) {
    const { error: cErr } = await supabase.from("customers").update({ name }).eq("id", customerId);
    if (cErr) return fail("บันทึกทะเบียนไม่สำเร็จ: " + cErr.message, 500);
    propagated = true;
    await audit({
      userId: profile.id,
      action: "CUSTOMER_RENAME",
      table: "customers",
      recordId: String(customerId),
      oldValue: { name: oldName },
      newValue: { name },
    });
  }

  // 2) การันตีว่าใบนี้เปลี่ยนแน่ (เผื่อ snapshot เดิมไม่ตรงชื่อทะเบียน = trigger ไม่แตะ)
  const { error: sErr } = await supabase
    .from("quotations")
    .update({ customer_snapshot: { ...snap, name } })
    .eq("id", params.id);
  if (sErr) return fail("บันทึกใบเสนอไม่สำเร็จ: " + sErr.message, 500);

  await audit({
    userId: profile.id,
    action: "EDIT_QUOTATION_CUSTOMER_NAME",
    table: "quotations",
    recordId: String(params.id),
    oldValue: { name: oldName },
    newValue: { name, save_to_registry: propagated },
  });

  return ok({ name, propagated });
}
