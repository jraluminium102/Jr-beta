import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { pickJobQuotation } from "@/lib/cover-sheet/pick-quotation";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any; storage: any };

const annotationSchema = z.object({
  id: z.string().min(1),
  page: z.number().int().min(0),
  xf: z.number().min(0).max(1),
  yf: z.number().min(0).max(1),
  size: z.number().min(0.005).max(0.25),
  text: z.string().max(2000),
  color: z.enum(["", "red", "blue", "green"]).optional().default(""),
  align: z.enum(["left", "center", "right"]).optional().default("left"),
  hl: z.enum(["", "yellow", "green", "pink", "blue", "orange"]).optional().default(""),
});

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  annotations: z.array(annotationSchema).max(300).optional(),
  quotation_id: z.union([z.number(), z.string()]).nullish(), // (0136) เปลี่ยนใบเสนอ/rev ที่ pin ไว้ — ไม่ส่ง = คงของเดิม, null/"" = เคลียร์ pin กลับไป auto-pick
  sync_rev: z.boolean().optional(),   // true = "ดึงสเปคจากใบเสนอล่าสุด" → เคลียร์ป้ายเตือน (เซฟชื่อ/ย้ายกล่องเฉย ๆ ไม่เคลียร์)
}).refine((b) => b.title !== undefined || b.annotations !== undefined || b.quotation_id !== undefined, { message: "ไม่มีข้อมูลให้บันทึก" });

function isMissingQuotationRefCol(message?: string): boolean {
  return /quotation_rev_no|quotation_id.*does not exist|column .*job_drawings.*quotation/i.test(message ?? "");
}

// PATCH /api/job-drawings/:id — บันทึกชื่อชุดแบบ และ/หรือ ตำแหน่งกล่องข้อความ (annotations) และ/หรือ ใบเสนอที่ pin ไว้
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("drawings", "write");
  const sb = ctx.supabase as unknown as AnySb;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return err("id ไม่ถูกต้อง", 422);
  const body = patchSchema.parse(await req.json());

  // select("*") — กัน 0136 ยังไม่รัน (คอลัมน์ quotation_id/quotation_rev_no อาจไม่มี · ระบุชื่อจะพังทั้ง query)
  const { data: existing, error: findErr } = await sb.from("job_drawings").select("*").eq("id", id).maybeSingle();
  if (findErr) throw dbError(findErr);
  if (!existing) return err("ไม่พบแบบนี้", 404);
  const existingRow = existing as { id: number; job_id: string; quotation_id?: number | null; quotation_rev_no?: number };

  const payload: Record<string, unknown> = { updated_by: ctx.user.id, updated_at: new Date().toISOString() };
  if (body.title !== undefined) payload.title = body.title;
  if (body.annotations !== undefined) payload.annotations = body.annotations;

  // (0136) pin: client ส่ง quotation_id ชัดเจน (ดรอปดาวน์ · null/"" = เคลียร์กลับ auto) ไม่งั้นคง pin เดิม
  let pinnedId: number | null;
  if (body.quotation_id !== undefined) {
    const qid = body.quotation_id !== null && body.quotation_id !== "" ? Number(body.quotation_id) : NaN;
    pinnedId = Number.isFinite(qid) ? qid : null;
  } else {
    pinnedId = existingRow.quotation_id ?? null;
  }
  const picked = await pickJobQuotation(sb, existingRow.job_id, pinnedId);
  // rev_no: เคลียร์ป้ายเตือนเฉพาะ (ก) sync_rev (ข) เปลี่ยน pin (ค) บันทึก annotations (แตะสเปค · แผง prefill โชว์ล่าสุดอยู่แล้ว) (ง) ยังไม่เคยตั้ง
  //   เซฟ "ชื่อชุดแบบ" เฉย ๆ → คง rev เดิม ป้ายเตือนไม่หาย (กันปิดเตือนโดยยังไม่ได้ดูสเปคใหม่)
  const pinChanged = (pinnedId ?? null) !== (existingRow.quotation_id ?? null);
  let revNo = existingRow.quotation_rev_no ?? 0;
  if (picked && (body.sync_rev || pinChanged || body.annotations !== undefined || existingRow.quotation_rev_no == null)) revNo = picked.revision_no;
  const payloadWithQuote = picked ? { ...payload, quotation_id: picked.id, quotation_rev_no: revNo } : { ...payload, quotation_id: null };

  let { data, error } = await sb.from("job_drawings").update(payloadWithQuote).eq("id", id).select("*").maybeSingle();
  if (error && isMissingQuotationRefCol(error.message)) {
    // migration 0136 ยังไม่รัน — บันทึกได้ตามปกติ แค่ไม่มี quotation_id/rev_no (เตือน rev ใช้ไม่ได้จนกว่าจะรัน)
    ({ data, error } = await sb.from("job_drawings").update(payload).eq("id", id).select("*").maybeSingle());
  }
  if (error) throw dbError(error);
  return ok(data);
});

// DELETE /api/job-drawings/:id — ลบแถว + ลบไฟล์ใน storage (ต้นฉบับ PDF + รูปทุกหน้า)
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("drawings", "write");
  const sb = ctx.supabase as unknown as AnySb;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return err("id ไม่ถูกต้อง", 422);

  const { data: row, error: findErr } = await sb.from("job_drawings").select("pdf_path, pages").eq("id", id).maybeSingle();
  if (findErr) throw dbError(findErr);
  if (!row) return err("ไม่พบแบบนี้", 404);

  const { error: delErr } = await sb.from("job_drawings").delete().eq("id", id);
  if (delErr) throw dbError(delErr);

  // ลบไฟล์ storage แบบ best-effort — ลบแถว DB ไปแล้ว ไม่ block response ถ้าไฟล์ลบไม่หมด (เช่น path เพี้ยนจากของเก่า)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = (row.pages ?? []) as any[];
    const paths = [row.pdf_path, ...pages.map((p) => p?.path)].filter((p): p is string => !!p);
    if (paths.length) await sb.storage.from("drawings").remove(paths);
  } catch (e) {
    console.error("[job-drawings DELETE] ลบไฟล์ storage ไม่สำเร็จ", e);
  }

  return ok({ deleted: true });
});
