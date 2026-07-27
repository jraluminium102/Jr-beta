import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

type Params = { params: { jobId: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// content jsonb — โครงที่ editor แก้ (ดู migration 0111_cover_sheets.sql)
const lineSchema = z.object({
  text: z.string().max(500),
  color: z.enum(["", "red", "blue", "green"]).optional().default(""),
  hl: z.boolean().optional().default(false),
});
const groupSchema = z.object({
  n: z.number(),
  title: z.string().max(300),
  lines: z.array(lineSchema).default([]),
});
const contentSchema = z.object({
  floorNote: z.string().max(500).optional().default(""),
  groups: z.array(groupSchema).default([]),
  midLines: z.array(lineSchema).default([]),
  rightLines: z.array(lineSchema).default([]),
});

const putSchema = z.object({
  mode: z.enum(["short", "grouped"]).default("short"),
  content: contentSchema,
  quotation_id: z.union([z.number(), z.string()]).nullish(),
});

// migration 0111 ยังไม่รัน → บอกชัดแทนโยน error ดิบ (แนวเดียวกับ job_blocker_notes 0098)
function isMissingTable(message?: string): boolean {
  return /cover_sheets|does not exist|42P01|schema cache/i.test(message ?? "");
}
const MIGRATION_HINT = "ยังไม่ได้รัน migration 0111 (ใบปะหน้า) — รัน supabase/migrations/0111_cover_sheets.sql ก่อนใช้งาน";

// GET /api/cover-sheets/:jobId — ใบปะหน้าเดิม(ถ้ามี) + ข้อมูลงาน + ใบเสนอราคาล่าสุด (สำหรับอ้างอิง/สร้างอัตโนมัติ)
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as AnySb;
  const jobId = params.jobId;

  const [jobR, coverR, quoR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, floor_work, floor_note, current_stage").eq("id", jobId).maybeSingle(),
    sb.from("cover_sheets").select("mode, content").eq("job_id", jobId).maybeSingle(),
    // ใบล่าสุดของงาน — ตัดใบ cancelled + เรียง created_at ล่าสุด (ตรง pattern quotation-checklist)
    //   ห้ามใช้ revision_no เป็นคีย์หลัก: แต่ละใบนับ revision ของตัวเอง (ใบเก่าที่ revise เยอะอาจชนะใบใหม่)
    sb.from("quotations").select("id, code, created_at").eq("job_id", jobId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false }),
  ]);

  if (jobR.error) throw dbError(jobR.error);
  if (!jobR.data) return err("ไม่พบงานนี้", 404);
  if (coverR.error && isMissingTable(coverR.error.message)) return err(MIGRATION_HINT, 400);
  if (coverR.error) throw dbError(coverR.error);
  if (quoR.error) throw dbError(quoR.error);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestQ = ((quoR.data ?? []) as any[])[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quotation: { id: number; code: string; items: any[] } | null = null;
  if (latestQ) {
    const { data: items, error: itemsErr } = await sb
      .from("quotation_items")
      .select("name, detail, group_label, sort_order")
      .eq("quotation_id", latestQ.id)
      .order("sort_order", { ascending: true });
    if (itemsErr) throw dbError(itemsErr);
    quotation = { id: latestQ.id, code: latestQ.code, items: items ?? [] };
  }

  return ok({
    cover: coverR.data ?? null,
    job: jobR.data,
    quotation,
  });
});

// PUT /api/cover-sheets/:jobId — สร้าง/บันทึกทับใบปะหน้า (1 งาน = 1 ใบ, upsert by job_id)
export const PUT = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const jobId = params.jobId;
  const body = putSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as AnySb;

  const { data: job, error: jobErr } = await sb.from("jobs").select("id").eq("id", jobId).maybeSingle();
  if (jobErr) throw dbError(jobErr);
  if (!job) return err("ไม่พบงานนี้", 404);

  const payload: Record<string, unknown> = {
    job_id: jobId,
    mode: body.mode,
    content: body.content,
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };
  if (body.quotation_id !== undefined && body.quotation_id !== null && body.quotation_id !== "") {
    const qid = Number(body.quotation_id);
    if (Number.isFinite(qid)) payload.quotation_id = qid; // กัน NaN ลง bigint column
  }

  const { data, error } = await sb
    .from("cover_sheets")
    .upsert(payload, { onConflict: "job_id" })
    .select("id, job_id, quotation_id, mode, content, updated_at")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return err(MIGRATION_HINT, 400);
    throw dbError(error);
  }
  return ok(data);
});
