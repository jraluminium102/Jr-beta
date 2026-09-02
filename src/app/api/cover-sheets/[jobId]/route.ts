import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { pickJobQuotation, listJobQuotations } from "@/lib/cover-sheet/pick-quotation";

export const dynamic = "force-dynamic";

type Params = { params: { jobId: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// content jsonb — โครงที่ editor แก้ (ดู migration 0111_cover_sheets.sql)
const lineSchema = z.object({
  text: z.string().max(500),
  color: z.enum(["", "red", "blue", "green"]).optional().default(""),
  hl: z.boolean().optional().default(false),   // เดิม (boolean เหลืองอย่างเดียว) — เก็บไว้ backward-compat กับข้อมูลเก่า
  hlc: z.enum(["", "yellow", "green", "pink", "blue", "orange"]).optional(), // ใหม่ — สีไฮไลต์จริง (ชนะ hl เดิมถ้ามีค่า)
  kind: z.enum(["spec", "group"]).optional(),
  n: z.number().optional(),
});
// โมเดลแบน (flat): left/mid/right เป็น list บรรทัดตรง ๆ — สิ่งที่เห็น=สิ่งที่พิมพ์
const contentSchema = z.object({
  floorNote: z.string().max(500).optional().default(""),
  warnings: z.array(z.string().max(200)).max(20).optional().default([]),
  left: z.array(lineSchema).default([]),
  mid: z.array(lineSchema).default([]),
  right: z.array(lineSchema).default([]),
});

const putSchema = z.object({
  mode: z.enum(["short", "grouped"]).optional(),
  content: contentSchema.optional(),   // ไม่ส่ง = โหมด pin-only (แค่เปลี่ยนใบอ้างอิง ไม่แตะเนื้อหา)
  quotation_id: z.union([z.number(), z.string()]).nullish(),
  sync_rev: z.boolean().optional(),    // true = บันทึกนี้ "ดึงจากใบเสนอล่าสุด" → เคลียร์ป้ายเตือน (ไม่งั้นเซฟแก้ typo ป้ายไม่หาย)
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

  const [jobR, coverR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, floor_work, floor_note, current_stage, deposit_date").eq("id", jobId).maybeSingle(),
    sb.from("cover_sheets").select("mode, content, quotation_id, quotation_rev_no").eq("job_id", jobId).maybeSingle(),
  ]);

  if (jobR.error) throw dbError(jobR.error);
  if (!jobR.data) return err("ไม่พบงานนี้", 404);
  if (coverR.error && isMissingTable(coverR.error.message)) return err(MIGRATION_HINT, 400);
  if (coverR.error) throw dbError(coverR.error);

  // (0136) ถ้าเคยสร้างใบปะหน้าแล้ว ยึดใบเสนอที่ pin ไว้ (quotation_id) เป็นค่าเริ่มต้นเสมอ — ไม่ auto-overwrite
  //   ยังไม่เคยสร้าง (cover เป็น null หรือไม่มี quotation_id) → เลือกอัตโนมัติ (ใบที่มีบิลผูก/ล่าสุด — พฤติกรรมเดิม)
  const coverRow = coverR.data as { mode: string; content: unknown; quotation_id?: number | null; quotation_rev_no?: number } | null;
  const storedQuotationId = coverRow?.quotation_id ?? null;
  const picked = await pickJobQuotation(sb, jobId, storedQuotationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quotation: { id: number; code: string; items: any[] } | null = null;
  if (picked) {
    const { data: items, error: itemsErr } = await sb
      .from("quotation_items")
      .select("name, detail, group_label, sort_order")
      .eq("quotation_id", picked.id)
      .order("sort_order", { ascending: true });
    if (itemsErr) throw dbError(itemsErr);
    quotation = { id: picked.id, code: picked.code, items: items ?? [] };
  }

  // ดรอปดาวน์เลือกใบเสนอ/rev เอง (default = picked ด้านบน)
  const quotations = await listJobQuotations(sb, jobId);
  // เตือน "มี Rev" เฉพาะตอนมีใบปะหน้าอยู่แล้ว + เคย pin ใบไว้จริง + ใบนั้นถูก Rev ทีหลัง (revision_no ปัจจุบัน > ตอนสร้าง/บันทึกล่าสุด)
  const rev_stale = !!(coverRow && storedQuotationId != null && picked && picked.revision_no > (coverRow.quotation_rev_no ?? 0));

  return ok({
    cover: coverRow,
    job: jobR.data,
    quotation,
    quotations,
    picked: picked ? { id: picked.id, code: picked.code, revision_no: picked.revision_no } : null,
    rev_stale,
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

  // แถวเดิม (ถ้ามี) — select("*") กัน 0136 ยังไม่รัน (quotation_rev_no อาจไม่มี · ระบุชื่อจะพังทั้ง query)
  const { data: existingCover } = await sb.from("cover_sheets").select("*").eq("job_id", jobId).maybeSingle();
  const stored = existingCover as { quotation_id?: number | null; quotation_rev_no?: number } | null;
  const missingRevCol = (m?: string) => /quotation_rev_no/i.test(m ?? "");

  // ใบที่จะ pin: ส่ง quotation_id ชัดเจน → ใช้ตัวนั้น (null/"" = ยกเลิก pin กลับอัตโนมัติ) · ไม่ส่ง → คง pin เดิม
  let pinnedId: number | null;
  if (body.quotation_id !== undefined) {
    const qid = body.quotation_id !== null && body.quotation_id !== "" ? Number(body.quotation_id) : NaN;
    pinnedId = Number.isFinite(qid) ? qid : null;
  } else {
    pinnedId = stored?.quotation_id ?? null;
  }
  const picked = await pickJobQuotation(sb, jobId, pinnedId);

  // ── โหมด pin-only (ไม่ส่ง content) = แค่เปลี่ยนใบอ้างอิงจากดรอปดาวน์ → อัปเดตแค่ quotation_id/rev_no ไม่แตะเนื้อหาที่ยังไม่เซฟ ──
  if (body.content === undefined) {
    if (!stored) return err("ยังไม่มีใบปะหน้า — สร้างก่อนจึงเปลี่ยนใบอ้างอิงได้", 400);
    const upd: Record<string, unknown> = { updated_by: ctx.user.id, updated_at: new Date().toISOString(), quotation_id: picked?.id ?? null, quotation_rev_no: picked?.revision_no ?? 0 };
    let { error: uErr } = await sb.from("cover_sheets").update(upd).eq("job_id", jobId);
    if (uErr && missingRevCol(uErr.message)) { // 0136 ยังไม่รัน → ถอย ไม่เขียน rev_no (pin ยังทำงานผ่าน quotation_id ของ 0111)
      const { quotation_rev_no: _r, ...updNoRev } = upd; void _r;
      ({ error: uErr } = await sb.from("cover_sheets").update(updNoRev).eq("job_id", jobId));
    }
    if (uErr) throw dbError(uErr);
    return ok({ ok: true, quotation_id: picked?.id ?? null, quotation_rev_no: picked?.revision_no ?? 0 });
  }

  // ── โหมดบันทึกเนื้อหา ── rev_no: เคลียร์ป้ายเตือนเฉพาะ (ก) ดึงล่าสุด sync_rev (ข) เปลี่ยน pin (ค) แถวใหม่/ยังไม่เคยตั้ง
  //   เซฟแก้ typo เฉย ๆ (pin เดิม · ไม่ sync) → คง rev_no เดิม ป้ายเตือนไม่หาย (กันเผลอปิดเตือนโดยไม่ได้ดึง rev ใหม่)
  const pinChanged = (pinnedId ?? null) !== (stored?.quotation_id ?? null);
  let revNo = stored?.quotation_rev_no ?? 0;
  if (picked && (body.sync_rev || pinChanged || !stored || stored.quotation_rev_no == null)) revNo = picked.revision_no;

  const payload: Record<string, unknown> = {
    job_id: jobId,
    mode: body.mode ?? "short",
    content: body.content,
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
    quotation_id: picked?.id ?? null,
    quotation_rev_no: revNo,
  };

  let { data, error } = await sb
    .from("cover_sheets")
    .upsert(payload, { onConflict: "job_id" })
    .select("id, job_id, quotation_id, quotation_rev_no, mode, content, updated_at")
    .maybeSingle();
  if (error && missingRevCol(error.message)) { // 0136 ยังไม่รัน → ถอย ไม่เขียน/ไม่ select rev_no (ยอด/เนื้อหายังถูก)
    const { quotation_rev_no: _r, ...payloadNoRev } = payload; void _r;
    ({ data, error } = await sb.from("cover_sheets").upsert(payloadNoRev, { onConflict: "job_id" })
      .select("id, job_id, quotation_id, mode, content, updated_at").maybeSingle());
  }
  if (error) {
    if (isMissingTable(error.message)) return err(MIGRATION_HINT, 400);
    throw dbError(error);
  }
  return ok(data);
});
