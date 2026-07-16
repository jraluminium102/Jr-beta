import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };
type Params = { params: { id: string } };

// DELETE /api/production-set-options/:id — ลบตัวเลือก (ยกเว้นตัวที่ระบบใช้ตัดสินใจ)
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;

  const { data: row, error: rErr } = await sb
    .from("production_set_options")
    .select("id, field_key, value, is_locked")
    .eq("id", params.id)
    .maybeSingle();
  if (rErr) throw dbError(rErr);
  if (!row) return notFound("ไม่พบตัวเลือกนี้");

  // กันลบค่าที่ตรรกะระบบอิงอยู่ — ลบแล้วปุ่ม "ส่งติดตั้ง"/ป้าย "ทำแล้ว" จะพังเงียบ ๆ
  if (row.is_locked)
    return err(`"${row.value}" เป็นค่าที่ระบบใช้ตัดสินใจ (เช่น ปลดล็อกปุ่มส่งติดตั้ง) — ลบไม่ได้ แต่เพิ่มตัวเลือกอื่นได้`, 409);

  // ถูกใช้อยู่ไหม — ลบทิ้งเฉย ๆ จะทำให้ชุดงานที่ค้างค่านี้อ่านไม่รู้เรื่อง
  const { count } = await sb
    .from("production_sets")
    .select("id", { count: "exact", head: true })
    .eq(row.field_key, row.value);
  if ((count ?? 0) > 0)
    return err(`ยังมี ${count} ชุดงานใช้ "${row.value}" อยู่ — เปลี่ยนค่าในชุดงานนั้นก่อนถึงจะลบได้`, 409);

  const { error } = await sb.from("production_set_options").delete().eq("id", params.id);
  if (error) throw dbError(error);
  return ok({ id: Number(params.id) });
});
