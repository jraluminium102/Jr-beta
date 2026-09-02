import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

const schema = z
  .object({
    product_id: z.string().trim().min(1, "ต้องระบุรุ่น"),
    scope: z.enum(["calc", "cut"]),
    match_key: z.string().trim().min(1, "ต้องระบุรหัส/คีย์ของบรรทัด"),
    reviewed: z.boolean(),
  })
  .strict();

// POST /api/calc-overrides/reviewed — ติ๊ก/ถอน "ตรวจแล้ว" ต่อบรรทัด (หน้า /calculator40/link ไล่ตรวจ 550 แถว)
//   แยกจาก POST /api/calc-overrides หลักโดยตั้งใจ — อันนั้นคำนวณผลกระทบต่อทุนทุกครั้ง (ดึงสต็อกทั้งชุด)
//   ติ๊กตรวจแล้วเป็น action ที่กดถี่/กดรัว ๆ ระหว่างไล่ตรวจ ต้องเบา ไม่งั้นตารางหน่วงทุกคลิก
//   ไม่มี override จริงมาก่อน → สร้างแถว "ตรวจแล้วอย่างเดียว" (set_* ทุกช่อง null ตามที่ตกลงไว้)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("calc_overrides", "write");
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 422);
  const { product_id, scope, match_key, reviewed } = parsed.data;
  const sb = ctx.supabase as unknown as Sb;

  const patch = {
    reviewed_at: reviewed ? new Date().toISOString() : null,
    reviewed_by: reviewed ? ctx.user.id : null,
  };

  const { data: existing } = await sb
    .from("calc_line_overrides")
    .select("id")
    .eq("product_id", product_id)
    .eq("scope", scope)
    .eq("match_key", match_key)
    .maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from("calc_line_overrides")
      .update(patch)
      .eq("id", existing.id)
      .select("id, reviewed_at, reviewed_by")
      .single();
    if (error) throw dbError(error);
    return ok(data);
  }

  const { data, error } = await sb
    .from("calc_line_overrides")
    .insert({ product_id, scope, match_key, ...patch })
    .select("id, reviewed_at, reviewed_by")
    .single();
  if (error) throw dbError(error);
  return ok(data);
});
