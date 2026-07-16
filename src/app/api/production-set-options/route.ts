import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type SetOption = { id: number; field_key: string; value: string; sort_order: number; is_locked: boolean };

/** ฟิลด์ที่แก้ตัวเลือกได้ — กันคนยิง field_key มั่วมาสร้างขยะในตาราง */
export const OPTION_FIELDS = [
  "design_received", "frame_status", "mat_equipment", "mat_alu_normal", "mat_alu_painted",
  "glass_order", "glass_installed", "screen_type", "screen_installed",
  "qc_before_glass", "qc_after_glass",
] as const;

// GET /api/production-set-options — ตัวเลือกดรอปดาวน์ทั้งหมดของ worksheet ผลิต
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("production_set_options")
    .select("id, field_key, value, sort_order, is_locked")
    .order("field_key")
    .order("sort_order")
    .order("id");
  // 0099 ยังไม่รัน → คืนว่างแทน 500 · หน้าเว็บมี fallback เป็นค่ามาตรฐานเดิมอยู่แล้ว
  // (บทเรียน 0098: เพิ่มตารางใหม่แล้วไม่มี fallback = หน้างานผลิตพังทั้งหน้าตอน deploy มาก่อน migration)
  if (error && /production_set_options|does not exist|42P01/i.test(error.message ?? "")) {
    return ok([], { can_write: can(ctx.role, "production", "write"), migrated: false });
  }
  if (error) throw dbError(error);
  return ok((data ?? []) as SetOption[], { can_write: can(ctx.role, "production", "write"), migrated: true });
});

const createSchema = z.object({
  field_key: z.enum(OPTION_FIELDS),
  value: z.string().trim().min(1, "กรอกชื่อตัวเลือก").max(60, "ชื่อตัวเลือกยาวเกินไป (เกิน 60 ตัว)"),
});

// POST /api/production-set-options — เพิ่มตัวเลือกใหม่
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;
  const body = createSchema.parse(await req.json());

  // ต่อท้ายรายการเดิมเสมอ
  const { data: last } = await sb
    .from("production_set_options")
    .select("sort_order")
    .eq("field_key", body.field_key)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = ((last?.sort_order as number | undefined) ?? 0) + 1;

  const { data, error } = await sb
    .from("production_set_options")
    .insert({ field_key: body.field_key, value: body.value, sort_order, is_locked: false })
    .select("id, field_key, value, sort_order, is_locked")
    .single();
  if (error) {
    if ((error.code ?? "") === "23505") return err(`มีตัวเลือก "${body.value}" อยู่แล้ว`, 409);
    throw dbError(error);
  }
  return ok(data as SetOption, undefined, 201);
});
