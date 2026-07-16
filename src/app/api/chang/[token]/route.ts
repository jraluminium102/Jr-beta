import { z } from "zod";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getChangToken } from "@/lib/chang-token";
import { buildScheduleRows, isVisibleToChang } from "@/lib/production/schedule";

// ── API สาธารณะสำหรับลิงก์ช่าง (ไม่ต้อง login) — ป้องกันด้วยโทเคน (env หรือ DB) ──
// อ่านตารางผลิต + กดมาร์ค 4 ช่องเท่านั้น (service role + whitelist field กันใช้ผิด)
export const dynamic = "force-dynamic";

async function tokenOk(token: string) {
  const expected = await getChangToken();
  return !!expected && token === expected;
}

const MARK_FIELDS = ["design_received", "frame_done", "glass_installed", "qc_before_glass", "qc_after_glass", "screen_installed"] as const;
const DONE: Record<string, string> = { design_received: "ได้รับแบบ", frame_done: "ผลิตเสร็จ", glass_installed: "ใส่แล้ว", qc_before_glass: "ผ่าน", qc_after_glass: "ผ่าน", screen_installed: "ใส่แล้ว" };
const AUDIT: Record<string, [string, string]> = {
  design_received: ["design_received_by", "design_received_at"],
  glass_installed: ["glass_installed_by", "glass_installed_at"],
  qc_before_glass: ["qc_before_by", "qc_before_at"],
  qc_after_glass: ["qc_after_by", "qc_after_at"],
};

// มาร์คได้เฉพาะ field ใน whitelist (กันลิงก์สาธารณะเขียนอะไรก็ได้)
// ⚠ value max 60 = เท่ากับความยาวสูงสุดของ "ตัวเลือกดรอปดาวน์" ที่ออฟฟิศเพิ่มเองได้ (0099
//   /api/production-set-options) — ถ้าเลขนี้น้อยกว่า ช่างจะกดตัวเลือกยาว ๆ ไม่ได้ ต้องขยับคู่กัน
const patchSchema = z.object({
  set_id: z.number().int(),
  field: z.enum(MARK_FIELDS),
  value: z.string().max(60),          // ค่าที่จะลง (ค่า done / "" / ค่า undone)
  by: z.string().max(60).optional(),  // ชื่อช่างที่กด (ไว้ audit)
});

// GET /api/chang/:token — ตารางผลิต (งานในระบบ + งานจดเอง + ชุดงาน)
// ⚠ ใช้ buildScheduleRows ตัวเดียวกับเว็บหลัก /api/production-schedule — ห้าม query เอง
//   (เดิม query แยก แล้วหลุดกันเงียบ ๆ: ลิงก์ช่างไม่มีงานจดเอง/โน้ตช่าง + โชว์งาน READY ที่เว็บหลักซ่อน)
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!(await tokenOk(params.token))) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const rows = (await buildScheduleRows(sb)).filter(isVisibleToChang);
  return NextResponse.json({ data: rows });
}

// PATCH /api/chang/:token — มาร์ค 1 ช่อง (เฉพาะ 4 ช่อง whitelist)
export async function PATCH(req: Request, { params }: { params: { token: string } }) {
  if (!(await tokenOk(params.token))) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });
  let body;
  try { body = patchSchema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const marked = body.value === DONE[body.field];
  const patch: Record<string, unknown> = {
    [body.field]: body.value === "" ? null : body.value,
  };
  // บาง field มี audit column (by/at) บางอันไม่มี (frame_done/screen_installed)
  const audit = AUDIT[body.field];
  if (audit) {
    patch[audit[0]] = marked ? (body.by?.trim() || "ช่าง (ลิงก์)") : null;
    patch[audit[1]] = marked ? new Date().toISOString() : null;
  }
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const { error } = await sb.from("production_sets").update(patch).eq("id", body.set_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
