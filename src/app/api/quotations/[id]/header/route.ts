import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";

// PATCH /api/quotations/[id]/header — แก้หัวเอกสารใบเสนอ (เหมือนใบวางบิล)
//   body: { name?, address?, tax_id?, branch?, kind?, postal_code?, contact_person?, phone?, issue_date?, save_to_registry? }
//   - ฟิลด์ลูกค้าทั้งหมด → customer_snapshot ของใบนี้ (ใส่ชื่อบริษัท/นิติบุคคล/สาขา/เลขภาษีได้ ครบใบกำกับเต็มรูป)
//   - save_to_registry(default) & มี customer_id → อัปเดต customers ในทะเบียน (เฉพาะคอลัมน์ที่ทะเบียนมี)
//     · name → trigger 0051/0071 กระจายไปทุกเอกสาร · อื่น ๆ อัปเดตทะเบียนอย่างเดียว (ไม่ propagate = ปลอดภัยภาษี)
//     · kind/branch/postal_code = snapshot เท่านั้น (ทะเบียนไม่มีคอลัมน์ · เก็บใน billing_profiles)
//   - issue_date → วันที่ออก (ISO · บล็อกปี พ.ศ.)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const saveToRegistry = body?.save_to_registry !== false; // default = true

  // ── field ลูกค้า → snapshot (ใส่คีย์ไหนก็อัปเดตคีย์นั้น) ──
  const snapPatch: Record<string, string> = {};
  const setStr = (key: string, max: number, label: string): string | null => {
    if (body?.[key] === undefined) return null;
    const v = String(body[key]).trim();
    if (v.length > max) return `${label}ยาวเกินไป`;
    snapPatch[key] = v;
    return null;
  };
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail("กรุณากรอกชื่อลูกค้า");
    if (name.length > 200) return fail("ชื่อลูกค้ายาวเกินไป");
    snapPatch.name = name;
  }
  for (const [key, max, label] of [
    ["address", 500, "ที่อยู่"], ["tax_id", 40, "เลขผู้เสียภาษี"], ["branch", 80, "สาขา"],
    ["postal_code", 10, "รหัสไปรษณีย์"], ["contact_person", 120, "ผู้ติดต่อ"], ["phone", 40, "เบอร์โทร"],
    ["line_id", 120, "ชื่อ/ไอดีที่ใช้ติดต่อ"],
  ] as [string, number, string][]) {
    const errMsg = setStr(key, max, label);
    if (errMsg) return fail(errMsg);
  }
  // ช่องทางติดต่อ (0121) — จำกัดค่าให้ตรง constraint ที่ DB
  if (body?.contact_channel !== undefined) {
    const ch = String(body.contact_channel).trim().toUpperCase();
    if (ch && !["LINE", "FB", "IG", "OTHER"].includes(ch)) return fail("ช่องทางติดต่อไม่ถูกต้อง");
    snapPatch.contact_channel = ch || "LINE";
  }

  // kind = บุคคล/นิติบุคคล (จำกัดค่า)
  if (body?.kind !== undefined) {
    const k = String(body.kind).trim().toUpperCase();
    if (k && k !== "INDIVIDUAL" && k !== "COMPANY") return fail("ประเภทลูกค้าไม่ถูกต้อง");
    snapPatch.kind = k;
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
    .select("id, customer_id, customer_snapshot")
    .eq("id", params.id)
    .single();
  if (qErr || !q) return fail("ไม่พบใบเสนอราคา", 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyQ = q as any;
  const snap = (anyQ.customer_snapshot ?? {}) as Record<string, unknown>;
  const oldName = String(snap.name ?? "").trim();
  const customerId = anyQ.customer_id as number | null;

  // 1) อัปเดตทะเบียน (ถ้าเลือก + มีลิงก์) — เฉพาะคอลัมน์ที่ customers มี (name/address/tax_id/phone/contact_person)
  //    kind/branch/postal_code เป็น snapshot-only (customers ไม่มีคอลัมน์ · billing_profiles ต่างหาก)
  let propagated = false;
  if (saveToRegistry && customerId) {
    const REGISTRY_KEYS = ["name", "address", "tax_id", "phone", "contact_person", "line_id", "contact_channel"];
    const regPatch: Record<string, string> = {};
    for (const k of REGISTRY_KEYS) if (snapPatch[k] !== undefined) regPatch[k] = snapPatch[k];
    if (Object.keys(regPatch).length > 0) {
      let { error: cErr } = await supabase.from("customers").update(regPatch).eq("id", customerId);
      // กันพัง: ถ้าทะเบียนไม่มีบางคอลัมน์ → ลองใหม่เฉพาะ name/address (ชุดพื้นฐานที่มีแน่)
      if (cErr && /column|does not exist|schema cache/i.test(cErr.message ?? "")) {
        const basic: Record<string, string> = {};
        for (const k of ["name", "address"]) if (regPatch[k] !== undefined) basic[k] = regPatch[k];
        if (Object.keys(basic).length > 0) ({ error: cErr } = await supabase.from("customers").update(basic).eq("id", customerId));
        else cErr = null;
      }
      if (cErr) return fail("บันทึกทะเบียนไม่สำเร็จ: " + cErr.message, 500);
      propagated = true;
      if (snapPatch.name && snapPatch.name !== oldName) {
        await audit({
          userId: profile.id, action: "CUSTOMER_RENAME", table: "customers",
          recordId: String(customerId), oldValue: { name: oldName }, newValue: { name: snapPatch.name },
        });
      }
    }
  }

  // 2) อัปเดตใบนี้ — snapshot (การันตีบิลนี้เปลี่ยน) + issue_date
  const qUpdate: Record<string, unknown> = {};
  if (Object.keys(snapPatch).length > 0) qUpdate.customer_snapshot = { ...snap, ...snapPatch };
  if (issueDate !== undefined) qUpdate.issue_date = issueDate;

  const { error: uErr } = await supabase.from("quotations").update(qUpdate).eq("id", params.id);
  if (uErr) return fail("บันทึกใบเสนอไม่สำเร็จ: " + uErr.message, 500);

  await audit({
    userId: profile.id, action: "EDIT_QUOTATION_HEADER", table: "quotations", recordId: String(params.id),
    oldValue: { name: oldName },
    newValue: { ...snapPatch, ...(issueDate !== undefined ? { issue_date: issueDate } : {}), save_to_registry: propagated },
  });

  return ok({ ...snapPatch, ...(issueDate !== undefined ? { issue_date: issueDate } : {}), propagated });
}
