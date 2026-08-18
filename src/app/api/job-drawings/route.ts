import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";
// generator ตัวจริง (pure JS ไม่มี type · เหมือน cover-sheets/generate) — ห้ามแก้ logic
import { buildGroups } from "@/lib/cover-sheet/generate.mjs";
import { pickJobQuotation } from "@/lib/cover-sheet/pick-quotation";
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
});

// GET /api/job-drawings?job_id=... — รายการแบบที่อัปโหลดไว้ + prefill สเปคจากใบเสนอล่าสุด + สถานะงาน (มัดจำแล้วไหม)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("drawings", "read");
  const sb = ctx.supabase as unknown as AnySb;

  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id") ?? "";
  if (!z.string().uuid().safeParse(jobId).success) return err("ระบุ job_id ให้ถูกต้อง", 422);

  const [jobR, drawingsR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, status, deposit_date, customer_area, customer_id").eq("id", jobId).maybeSingle(),
    sb.from("job_drawings").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
  ]);

  if (jobR.error) throw dbError(jobR.error);
  if (!jobR.data) return err("ไม่พบงานนี้", 404);
  if (drawingsR.error) throw dbError(drawingsR.error);

  // ที่อยู่บ้านลูกค้า — ทะเบียนลูกค้าก่อน (เต็ม) ไม่งั้น customer_area ของงาน
  const jobRow = jobR.data as { customer_area: string | null; customer_id: number | null };
  let address = "";
  if (jobRow.customer_id != null) {
    const { data: cust } = await sb.from("customers").select("address").eq("id", jobRow.customer_id).maybeSingle();
    address = String((cust as { address: string | null } | null)?.address ?? "").trim();
  }
  if (!address) address = String(jobRow.customer_area ?? "").trim();

  // เลือก "ใบเสนอที่ลูกค้ามัดจำจริง" (ไม่ใช่ใบล่าสุด) — กันสแตมป์สเปคผิดใบเมื่องานมีหลายใบเสนอ (แก้เดียวกับใบปะหน้า)
  const picked = await pickJobQuotation(sb, jobId);
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

  const job = jobR.data as { job_code: string | null; customer_name: string; status: string; deposit_date: string | null };
  return ok({
    drawings: drawingsR.data ?? [],
    prefill,
    job: { ...job, deposited: !!job.deposit_date, address },
    can_write: can(ctx.role, "drawings", "write"),
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

  const { data, error } = await sb
    .from("job_drawings")
    .insert({
      job_id: body.job_id,
      title: body.title,
      pdf_path: body.pdf_path,
      original_name: body.original_name,
      pages: body.pages,
      annotations: [],
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select("*")
    .single();
  if (error) throw dbError(error);
  return created(data);
});
