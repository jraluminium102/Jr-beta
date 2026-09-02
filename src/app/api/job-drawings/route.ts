import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";
// generator ตัวจริง (pure JS ไม่มี type · เหมือน cover-sheets/generate) — ห้ามแก้ logic
import { buildGroups } from "@/lib/cover-sheet/generate.mjs";
import { pickJobQuotation, listJobQuotations } from "@/lib/cover-sheet/pick-quotation";
import type { PrefillGroup } from "@/lib/job-drawings/types";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

const pageSchema = z.object({
  path: z.string().min(1),
  w: z.number().positive(),
  h: z.number().positive(),
});
const postSchema = z.object({
  job_id: z.string().uuid(),
  title: z.string().max(200).optional().default(""),
  pdf_path: z.string().min(1),
  original_name: z.string().max(300).optional().default(""),
  pages: z.array(pageSchema).min(1, "ไฟล์ PDF ต้องมีอย่างน้อย 1 หน้า").max(60),
  quotation_id: z.union([z.number(), z.string()]).nullish(), // (0136) ระบุเมื่อผู้ใช้เลือกใบเสนอ/rev เองก่อนอัปโหลด — ไม่ระบุ = auto-pick
});

// (0136) migration ยังไม่รัน (คอลัมน์ quotation_id/quotation_rev_no ยังไม่มี) — บอกเงียบ ๆ ว่าไม่ตั้งค่านี้ ไม่พังการสร้างแบบ
function isMissingQuotationRefCol(message?: string): boolean {
  return /quotation_rev_no|quotation_id.*does not exist|column .*job_drawings.*quotation/i.test(message ?? "");
}

// GET /api/job-drawings?job_id=... — รายการแบบที่อัปโหลดไว้ + prefill สเปคจากใบเสนอล่าสุด + สถานะงาน (มัดจำแล้วไหม)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("drawings", "read");
  const sb = ctx.supabase as unknown as AnySb;

  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id") ?? "";
  if (!z.string().uuid().safeParse(jobId).success) return err("ระบุ job_id ให้ถูกต้อง", 422);
  // (0136) แบบที่กำลังดูอยู่ (client ส่งมาตอนสลับแท็บ) — ใช้หา pin/rev_stale ของแถวนั้นโดยเฉพาะ (ไม่ระบุ = แถวแรก)
  const drawingIdParam = url.searchParams.get("drawing_id");
  const drawingIdNum = drawingIdParam != null && Number.isFinite(Number(drawingIdParam)) ? Number(drawingIdParam) : null;

  const [jobR, drawingsR, coverR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, status, deposit_date, customer_area, customer_id").eq("id", jobId).maybeSingle(),
    sb.from("job_drawings").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
    // ใบปะหน้า (ถ้ามี) — เอาช่อง "รายละเอียด สั่งของเตรียมผลิต" (content.left) มาเป็นบับเบิ้ลให้เลือก
    //   ไม่มีตาราง/ยังไม่ทำใบปะหน้า → coverR.data = null (ปล่อยผ่าน ไม่ error)
    sb.from("cover_sheets").select("content").eq("job_id", jobId).maybeSingle(),
  ]);

  if (jobR.error) throw dbError(jobR.error);
  if (!jobR.data) return err("ไม่พบงานนี้", 404);
  if (drawingsR.error) throw dbError(drawingsR.error);

  // บับเบิ้ลจากใบปะหน้า (ช่อง 1 · left) — คงข้อความ+สี+ไฮไลต์ (map ตรงกับ annotation ของแบบช่าง)
  type CoverLineRow = { text?: string; color?: string; hl?: boolean; hlc?: string; kind?: string; n?: number };
  const leftRaw = ((coverR?.data as { content?: { left?: CoverLineRow[] } } | null)?.content?.left ?? []) as CoverLineRow[];
  const coverBubbles = leftRaw
    .filter((l) => String(l.text ?? "").trim())
    .map((l) => ({
      text: String(l.text),
      color: (["red", "blue", "green"].includes(l.color ?? "") ? l.color : "") as string,
      hl: (l.hlc || (l.hl ? "yellow" : "")) as string,
      kind: l.kind === "group" ? "group" : "spec",
      n: typeof l.n === "number" ? l.n : undefined,
    }));

  // ที่อยู่บ้านลูกค้า — ทะเบียนลูกค้าก่อน (เต็ม) ไม่งั้น customer_area ของงาน
  const jobRow = jobR.data as { customer_area: string | null; customer_id: number | null };
  let address = "";
  if (jobRow.customer_id != null) {
    const { data: cust } = await sb.from("customers").select("address").eq("id", jobRow.customer_id).maybeSingle();
    address = String((cust as { address: string | null } | null)?.address ?? "").trim();
  }
  if (!address) address = String(jobRow.customer_area ?? "").trim();

  // (0136) แถวแบบที่กำลังดู — ใช้ quotation_id ที่ pin ไว้ของแถวนั้น (ถ้ามี) เป็นค่าเริ่มต้นเสมอ ไม่ auto-overwrite
  //   ไม่ระบุ drawing_id (โหลดหน้าแรก) → ใช้แถวแรก (client ก็เลือกแถวแรกเป็นค่าเริ่มต้นเหมือนกัน — ดู DrawingEditorPage)
  type DrawingRow = { id: number; quotation_id?: number | null; quotation_rev_no?: number };
  const drawingRows = (drawingsR.data ?? []) as DrawingRow[];
  const activeDrawing = (drawingIdNum != null ? drawingRows.find((d) => d.id === drawingIdNum) : drawingRows[0]) ?? null;

  // เลือก "ใบเสนอที่ลูกค้ามัดจำจริง" (ไม่ใช่ใบล่าสุด) — กันสแตมป์สเปคผิดใบเมื่องานมีหลายใบเสนอ (แก้เดียวกับใบปะหน้า)
  //   pin = quotation_id ที่แถวที่กำลังดูเคยเลือกไว้แล้ว (ถ้ามี) — ยังไม่เคยเลือก (แถวใหม่/ยังไม่มีแถวเลย) → auto-pick
  const picked = await pickJobQuotation(sb, jobId, activeDrawing?.quotation_id ?? null);
  let prefill: PrefillGroup[] = [];
  if (picked) {
    const { data: items, error: itemsErr } = await sb
      .from("quotation_items")
      .select("name, detail, group_label, sort_order")
      .eq("quotation_id", picked.id)
      .order("sort_order", { ascending: true });
    if (itemsErr) throw dbError(itemsErr);
    prefill = buildGroups(items ?? []) as PrefillGroup[];
  }

  // ดรอปดาวน์เลือกใบเสนอ/rev เอง (default = picked ด้านบน)
  const quotations = await listJobQuotations(sb, jobId);
  // เตือน "มี Rev" เฉพาะแบบที่มีอยู่แล้ว + เคย pin ใบไว้จริง + ใบนั้นถูก Rev ทีหลัง
  const rev_stale = !!(activeDrawing && activeDrawing.quotation_id != null && picked && picked.revision_no > (activeDrawing.quotation_rev_no ?? 0));

  const job = jobR.data as { job_code: string | null; customer_name: string; status: string; deposit_date: string | null };
  return ok({
    drawings: drawingsR.data ?? [],
    prefill,
    coverBubbles,
    job: { ...job, deposited: !!job.deposit_date, address },
    can_write: can(ctx.role, "drawings", "write"),
    quotations,
    picked: picked ? { id: picked.id, code: picked.code, revision_no: picked.revision_no } : null,
    rev_stale,
  });
});

// POST /api/job-drawings — สร้างแถวแบบใหม่ (client อัปไฟล์ขึ้น storage bucket 'drawings' เสร็จแล้ว ส่ง path มาบันทึก)
//   เฉพาะงานมัดจำแล้ว (deposit_date ไม่ว่าง) — เกณฑ์เดียวกับที่ระบบใช้ทั้งระบบ (mark-deposited/deposit-amount)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("drawings", "write");
  const sb = ctx.supabase as unknown as AnySb;
  const body = postSchema.parse(await req.json());

  const { data: job, error: jobErr } = await sb.from("jobs").select("id, deposit_date").eq("id", body.job_id).maybeSingle();
  if (jobErr) throw dbError(jobErr);
  if (!job) return err("ไม่พบงานนี้", 404);
  if (!job.deposit_date) return err("งานนี้ยังไม่มัดจำ — สแตมป์สเปคลงแบบทำได้เฉพาะงานที่มัดจำแล้ว", 403);

  // (0136) เก็บใบเสนอที่ใช้จริงตอนสร้างแบบนี้ — pin เอง (dropdown) หรือ auto-pick (ใบที่มีบิลผูก/ล่าสุด)
  const rawPin = body.quotation_id;
  const pinnedId = rawPin != null && rawPin !== "" && Number.isFinite(Number(rawPin)) ? Number(rawPin) : null;
  const picked = await pickJobQuotation(sb, body.job_id, pinnedId);

  const insertBase = {
    job_id: body.job_id,
    title: body.title,
    pdf_path: body.pdf_path,
    original_name: body.original_name,
    pages: body.pages,
    annotations: [],
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
  };
  const insertWithQuote = picked ? { ...insertBase, quotation_id: picked.id, quotation_rev_no: picked.revision_no } : insertBase;

  let { data, error } = await sb.from("job_drawings").insert(insertWithQuote).select("*").single();
  if (error && isMissingQuotationRefCol(error.message)) {
    // migration 0136 ยังไม่รัน — สร้างแบบได้ตามปกติ แค่ไม่มี quotation_id/rev_no (เตือน rev ใช้ไม่ได้จนกว่าจะรัน)
    ({ data, error } = await sb.from("job_drawings").insert(insertBase).select("*").single());
  }
  if (error) throw dbError(error);
  return created(data);
});
