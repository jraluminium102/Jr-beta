import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";

// PUT /api/boq/[id]/items  → replace รายการวัสดุทั้งหมด (ลบเก่า-ใส่ใหม่)
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "boq", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) return fail("payload ไม่ถูกต้อง (ต้องมี items[])");

  // --- [#17] validate payload ก่อน "ลบของเก่า" กันข้อมูลหายเมื่อเน็ตหลุดกลางคัน ---
  const rawItems = body.items as Record<string, unknown>[];
  const invalidRow = rawItems.findIndex(
    (it) => !it.name || String(it.name).trim() === ""
  );
  if (invalidRow !== -1) {
    return fail(`แถวที่ ${invalidRow + 1}: ต้องระบุชื่อรายการ`, 400);
  }

  const supabase = createClient();

  // ยืนยันว่ามี BOQ จริงก่อน
  const { data: boq, error: boqErr } = await supabase
    .from("boqs")
    .select("id")
    .eq("id", params.id)
    .single();
  if (boqErr || !boq) return fail("ไม่พบ BOQ", 404);

  // normalize รายการ → ผูก boq_id + sort_order ตามลำดับ array
  const rows = rawItems.map((it, i) => ({
    boq_id: boq.id,
    category: String(it.category ?? ""),
    name: String(it.name ?? ""),
    spec: String(it.spec ?? ""),
    qty: Number(it.qty) || 0,
    unit: String(it.unit ?? "เส้น"),
    stock_item_id: it.stock_item_id ? Number(it.stock_item_id) : null,
    sort_order: i,
  }));

  // ลบของเก่าทั้งหมด (ถึงขั้นนี้ได้ = payload ผ่านแล้ว)
  const { error: delErr } = await supabase.from("boq_items").delete().eq("boq_id", boq.id);
  if (delErr) return fail("ลบรายการเดิมไม่สำเร็จ: " + delErr.message, 500);

  // ใส่ชุดใหม่ (ถ้ามี)
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("boq_items").insert(rows);
    if (insErr) return fail("บันทึกรายการใหม่ไม่สำเร็จ: " + insErr.message, 500);
  }

  return ok({ count: rows.length });
}
