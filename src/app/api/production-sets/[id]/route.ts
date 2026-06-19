import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };
type Params = { params: { id: string } };

const d = z.string().nullish();   // วันที่ YYYY-MM-DD หรือ null
const t = z.string().optional();  // ข้อความ
// ทุก field ของ worksheet แก้ inline ได้ (ส่งมาเฉพาะที่เปลี่ยน)
const patchSchema = z.object({
  set_label: t, seq: z.number().int().optional(),
  measure_actual: d, measurer_name: t, design_received: t,
  must_finish_date: d, glass_done_date: d, actual_done_date: d,
  mat_equipment: t, mat_alu_normal: t, mat_alu_painted: t,
  glass_spec: t, glass_order: t, glass_installed: t, qc_before_glass: t,
  frame_status: t, screen_type: t, screen_installed: t, qc_after_glass: t,
  install_date: d, note: t,
});

// PATCH /api/production-sets/:id — แก้ช่องใน worksheet (ออฟฟิศ/ผลิต)
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const body = patchSchema.parse(await req.json());
  // "" ในช่องวันที่ → null
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) clean[k] = v === "" ? null : v;

  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("production_sets")
    .update(clean)
    .eq("id", params.id)
    .select("*, job:job_id(job_code, customer_name, customer_area, status, current_stage, planned_install_date)")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return notFound("ไม่พบชุดงานนี้");
  return ok(data);
});

// DELETE /api/production-sets/:id — ลบชุดงาน
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;
  const { error } = await sb.from("production_sets").delete().eq("id", params.id);
  if (error) throw dbError(error);
  return ok({ id: params.id });
});
