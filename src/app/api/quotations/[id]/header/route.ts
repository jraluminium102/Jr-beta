import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";

// PATCH /api/quotations/[id]/header — แก้หัวบิลใบเสนอ
//   body: { name?, address?, issue_date?, save_to_registry? }
//   - name/address → อัปเดต customer_snapshot ของใบนี้เสมอ (บิลที่ดูอยู่เปลี่ยนทันที)
//       + save_to_registry(default) & มี customer_id → อัปเดต customers ในทะเบียน
//         · name → DB trigger 0051/0071 กระจายไปทุกเอกสารของลูกค้า (แตะเฉพาะ key name)
//         · address → อัปเดตทะเบียนอย่างเดียว (ไม่ propagate ไปเอกสารเก่า = ปลอดภัยเรื่องภาษี)
//   - issue_date → วันที่ออกใบเสนอ (ต่อใบ · ISO YYYY-MM-DD · บล็อกปี พ.ศ.)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const saveToRegistry = body?.save_to_registry !== false; // default = true

  // ── validate + เก็บเฉพาะ field ที่ส่งมา ──
  const snapPatch: Record<string, string> = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail("กรุณากรอกชื่อลูกค้า");
    if (name.length > 200) return fail("ชื่อลูกค้ายาวเกินไป");
    snapPatch.name = name;
  }
  if (body?.address !== undefined) {
    const address = String(body.address).trim();
    if (address.length > 500) return fail("ที่อยู่ยาวเกินไป");
    snapPatch.address = address;
  }

  let issueDate: string | undefined;
  if (body?.issue_date !== undefined) {
    const d = String(body.issue_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
    const year = Number(d.slice(0, 4));
    if (year >= 2500) return fail("กรุณากรอกปี ค.ศ. (ไม่ใช่ พ.ศ.)");
    if (year < 1990) return fail("ปีไม่ถูกต้อง");
    const dt = new Date(d + "T00:00:00Z");
    if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d) return fail("วันที่ไม่ถูกต้อง");
    issueDate = d;
  }

  if (Object.keys(snapPatch).length === 0 && issueDate === undefined) {
    return fail("ไม่มีข้อมูลให้แก้ไข");
  }

  const supabase = createClient();
  const { data: q, error: qErr } = await supabase
    .from("quotations")
    .select("id, customer_id, customer_snapshot, issue_date")
    .eq("id", params.id)
    .single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyQ = q as any;
  const snap = (anyQ.customer_snapshot ?? {}) as Record<string, unknown>;
  const customerId = anyQ.customer_id as number | null;
  const oldName = String(snap.name ?? "").trim();

  // 1) อัปเดตทะเบียน (ถ้าเลือก + มีลิงก์) — name เปลี่ยน → trigger กระจายไปเอกสารอื่น
  let propagated = false;
  if (saveToRegistry && customerId && Object.keys(snapPatch).length > 0) {
    const { error: cErr } = await supabase.from("customers").update(snapPatch).eq("id", customerId);
    if (cErr) return fail("บันทึกทะเบียนไม่สำเร็จ: " + cErr.message, 500);
    propagated = true;
    if (snapPatch.name && snapPatch.name !== oldName) {
      await audit({
        userId: profile.id,
        action: "CUSTOMER_RENAME",
        table: "customers",
        recordId: String(customerId),
        oldValue: { name: oldName },
        newValue: { name: snapPatch.name },
      });
    }
  }

  // 2) อัปเดตใบนี้ — snapshot (การันตีบิลนี้เปลี่ยน แม้ trigger ไม่แตะ) + issue_date
  const qUpdate: Record<string, unknown> = {};
  if (Object.keys(snapPatch).length > 0) qUpdate.customer_snapshot = { ...snap, ...snapPatch };
  if (issueDate !== undefined) qUpdate.issue_date = issueDate;

  const { error: uErr } = await supabase.from("quotations").update(qUpdate).eq("id", params.id);
  if (uErr) return fail("บันทึกใบเสนอไม่สำเร็จ: " + uErr.message, 500);

  await audit({
    userId: profile.id,
    action: "EDIT_QUOTATION_HEADER",
    table: "quotations",
    recordId: String(params.id),
    oldValue: {
      ...(snapPatch.name !== undefined ? { name: oldName } : {}),
      ...(snapPatch.address !== undefined ? { address: String(snap.address ?? "") } : {}),
      ...(issueDate !== undefined ? { issue_date: anyQ.issue_date } : {}),
    },
    newValue: { ...snapPatch, ...(issueDate !== undefined ? { issue_date: issueDate } : {}), save_to_registry: propagated },
  });

  return ok({ ...snapPatch, ...(issueDate !== undefined ? { issue_date: issueDate } : {}), propagated });
}
