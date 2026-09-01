import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { requireChangOr } from "@/lib/bff/chang-ctx";
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
  glass_spec: t, glass_order: t, frame_done: t, glass_installed: t, qc_before_glass: t,
  frame_status: t, screen_type: t, screen_installed: t, qc_after_glass: t,
  screen_type_2: t, screen_installed_2: t,  // มุ้งอันที่ 2 (0119) — เช่น มุ้งจีบ + มุ้ง JR
  install_date: d, note: t,
  factories: z.array(z.string()).optional(),   // โรงงานผลิต (หลายโรงต่อชุด · 0114)
  factory_start: z.record(z.string(), z.string().nullable()).optional(),  // วันเริ่มผลิตแยกโรง (0115)
  // ผลิต/hold แยกชุด (0131) — install_status แก้ผ่าน /production-sets/:id/install-status (สิทธิ์ installation:write) เท่านั้น
  produce_status: z.enum(["PENDING", "PRODUCING", "DONE"]).optional(),
  hold: z.boolean().optional(),
  hold_reason: z.string().nullish(),  // ปลด hold → UI ส่ง null (z.string().optional() ไม่รับ null = 400 · ต้อง nullish)
});

// PATCH /api/production-sets/:id — แก้ช่องใน worksheet (ออฟฟิศ/ผลิต)
// ช่างมาร์คเช็คลิสต์ผ่านลิงก์ได้ (ไม่ต้อง login) — endpoint เดียวกับเว็บหลัก ไม่โคลน
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requireChangOr(req, "production", "write");
  const body = patchSchema.parse(await req.json());
  // "" ในช่องวันที่ → null
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) clean[k] = v === "" ? null : v;

  // audit การมาร์ค 4 ช่อง — ปั๊มชื่อผู้กด+เวลา (ล้างเมื่อยกเลิกมาร์ค)
  const MARK_AUDIT: Record<string, { by: string; at: string; done: string }> = {
    design_received: { by: "design_received_by", at: "design_received_at", done: "ได้รับแบบ" },
    glass_installed: { by: "glass_installed_by", at: "glass_installed_at", done: "ใส่แล้ว" },
    qc_before_glass: { by: "qc_before_by", at: "qc_before_at", done: "ผ่าน" },
    qc_after_glass: { by: "qc_after_by", at: "qc_after_at", done: "ผ่าน" },
  };
  // ⚠ ช่างผ่านลิงก์ profile เป็น null — ต้องใช้ ctx.actorName (requireChangOr เตรียมไว้) หรือ ctx.profile?.x
  //   คนล็อกอิน = ชื่อจริง · ช่าง = ชื่อที่พิมพ์ในหน้า · ห้ามอ่านแบบ dot ตรงจาก profile
  const actor = ctx.actorName || ctx.profile?.full_name || ctx.user.email || (ctx.isChang ? "ช่าง (ลิงก์)" : "ไม่ทราบ");
  const nowIso = new Date().toISOString();
  for (const [field, a] of Object.entries(MARK_AUDIT)) {
    if (body[field as keyof typeof body] === undefined) continue; // ไม่ได้ส่งช่องนี้มา
    const marked = clean[field] === a.done;
    clean[a.by] = marked ? actor : null;
    clean[a.at] = marked ? nowIso : null;
  }

  // ผลิตเสร็จรายชุด (0131) — ปั๊มผู้กด+เวลาเหมือน MARK_AUDIT (แยกเพราะ produce_status เป็น enum ไม่ใช่ "ค่า=ทำแล้ว")
  if (body.produce_status !== undefined) {
    const done = body.produce_status === "DONE";
    clean.produce_done_by = done ? actor : null;
    clean.produce_done_at = done ? nowIso : null;
  }
  // ปลด hold → เคลียร์เหตุผลค้าง (กันข้อความเก่าโผล่กลับตอน hold รอบใหม่)
  if (body.hold === false && body.hold_reason === undefined) {
    clean.hold_reason = null;
  }

  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("production_sets")
    .update(clean)
    .eq("id", params.id)
    .select("*, job:job_id(job_code, customer_name, customer_area, status, current_stage)")
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
