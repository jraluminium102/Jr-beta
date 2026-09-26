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
  // กระจกหลายแผ่นต่อชุด (0154) — แหล่งจริงต่อแผ่น · API คิด roll-up กลับคอลัมน์เดิมให้
  glass_items: z.array(z.object({
    spec: z.string().default(""), order: z.string().default(""), installed: z.string().default(""),
  })).optional(),
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

  const sb = ctx.supabase as unknown as Sb;
  // ── กระจกหลายแผ่น (0154): glass_items = แหล่งจริง → คิด roll-up ระดับชุดลงคอลัมน์เดิม ──
  const V_GLASS_DONE = "ใส่แล้ว";
  let glassItemsProvided = false;
  // อ่านค่าปัจจุบันครั้งเดียว (ไว้ทำ audit "เปลี่ยนจริงเท่านั้น" + sync ช่างกด set-level ให้ตรงต่อแผ่น)
  let curGlass: { glass_installed?: string | null; glass_items?: unknown } = {};
  if (body.glass_items !== undefined || body.glass_installed !== undefined) {
    let cur = (await sb.from("production_sets").select("glass_installed, glass_items").eq("id", params.id).maybeSingle()).data;
    if (!cur) cur = (await sb.from("production_sets").select("glass_installed").eq("id", params.id).maybeSingle()).data;   // 0154 ยังไม่รัน (ไม่มีคอลัมน์)
    curGlass = cur ?? {};
  }
  if (body.glass_items !== undefined) {
    glassItemsProvided = true;
    const items = body.glass_items
      .map((i) => ({ spec: String(i.spec ?? "").trim(), order: String(i.order ?? "").trim(), installed: String(i.installed ?? "").trim() }))
      .filter((i) => i.spec || i.order || i.installed);
    clean.glass_items = items;
    clean.glass_spec = items.map((i) => i.spec).filter(Boolean).join("\n") || null;
    const orders = [...new Set(items.map((i) => i.order).filter(Boolean))];
    clean.glass_order = orders.length ? orders.join(" · ") : null;
    // ชุด "ใส่กระจกครบ" = ทุกแผ่น installed = ใส่แล้ว (ขับเฟส/ส่งติดตั้ง เหมือนเดิม)
    clean.glass_installed = (items.length > 0 && items.every((i) => i.installed === V_GLASS_DONE)) ? V_GLASS_DONE : null;
  } else if (body.glass_installed !== undefined) {
    // ช่างกด "ใส่กระจก" ระดับชุด (ชุดแผ่นเดียว/ลิงก์ช่างเก่า) → sync ทุกแผ่นให้ตรง (แหล่งเดียว กัน roll-up รอบหน้าย้อนค่า)
    //   ⚠ บอร์ดช่างที่อัปเดตแล้วจะส่ง glass_items รายแผ่นมาเอง (กรณีหลายแผ่น) — else นี้เหลือแค่ชุดแผ่นเดียว จึงปลอดภัย
    const items = Array.isArray(curGlass.glass_items) ? (curGlass.glass_items as { spec?: string; order?: string; installed?: string }[]) : [];
    if (items.length) {
      clean.glass_items = items.map((i) => ({ spec: i.spec ?? "", order: i.order ?? "", installed: clean.glass_installed === V_GLASS_DONE ? V_GLASS_DONE : "" }));
    }
  }

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
    const isGlass = field === "glass_installed";
    // glass_installed อาจถูกตั้งจาก roll-up ของ glass_items (ไม่ได้ส่ง field ตรง ๆ) → ถือว่า provided ด้วย
    const provided = body[field as keyof typeof body] !== undefined || (isGlass && glassItemsProvided);
    if (!provided) continue;
    // ★ ปั๊มผู้กด/เวลา "เฉพาะตอนสถานะใส่กระจกเปลี่ยนจริง" (แก้กระจกอื่น/สั่งกระจก ไม่ทับ audit ช่างที่ใส่จริง)
    if (isGlass && String(clean.glass_installed ?? "") === String(curGlass.glass_installed ?? "")) continue;
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

  const sel = "*, job:job_id(job_code, customer_name, customer_area, status, current_stage)";
  let { data, error } = await sb.from("production_sets").update(clean).eq("id", params.id).select(sel).maybeSingle();
  // กันพัง: 0154 (glass_items) ยังไม่รัน → ถอด glass_items ออก (roll-up glass_spec/glass_installed ยังบันทึกได้เหมือนเดิม)
  if (error && /glass_items/i.test(error.message ?? "")) {
    const { glass_items: _gi, ...rest } = clean;
    ({ data, error } = await sb.from("production_sets").update(rest).eq("id", params.id).select(sel).maybeSingle());
  }
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
