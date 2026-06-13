import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";
import type { JobDocument } from "@/lib/database.types";

export const dynamic = "force-dynamic";

// ─── GET /api/job-documents?job_id=<uuid> ────────────────────────────────────
export const GET = withRoute(async (req: Request) => {
  await requirePermission("jobs", "read");
  // ใช้ createClient() untyped เพราะ Database type เพิ่ม job_documents แต่ยังไม่ได้ run migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;

  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get("job_id");
  if (!job_id) return err("ต้องระบุ job_id", 400);

  const { data, error } = await sb
    .from("job_documents")
    .select("*")
    .eq("job_id", job_id)
    .order("created_at", { ascending: true });

  if (error) return err("โหลดเอกสารไม่สำเร็จ: " + error.message, 500);

  return ok({ documents: (data ?? []) as JobDocument[] });
});

// ─── POST /api/job-documents — upsert by (job_id, doc_type) ─────────────────
const schema = z.object({
  job_id:    z.string().uuid("job_id ต้องเป็น UUID"),
  doc_type:  z.enum(["boq", "contract", "warranty", "other"]),
  doc_no:    z.string().nullable().optional(),
  file_link: z.string().nullable().optional(),
  doc_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").nullable().optional(),
  meta:      z.record(z.unknown()).optional(),
  done:      z.boolean().optional(),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;

  const body = schema.parse(await req.json());
  const { job_id, doc_type, doc_no, file_link, doc_date, meta, done } = body;

  // ตรวจว่างานมีอยู่จริง
  const { data: job, error: jErr } = await sb
    .from("jobs")
    .select("id")
    .eq("id", job_id)
    .maybeSingle();
  if (jErr || !job) return err("ไม่พบงาน", 404);

  // upsert: boq/contract/warranty มีได้ชนิดละ 1 ต่องาน (unique index)
  const payload: Record<string, unknown> = {
    job_id,
    doc_type,
    ...(doc_no    !== undefined ? { doc_no }    : {}),
    ...(file_link !== undefined ? { file_link } : {}),
    ...(doc_date  !== undefined ? { doc_date }  : {}),
    ...(meta      !== undefined ? { meta }      : {}),
    ...(done      !== undefined ? { done }      : {}),
    created_by: ctx.user.id,
  };

  const { data, error } = await sb
    .from("job_documents")
    .upsert(payload, {
      onConflict: "job_id,doc_type",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) return err("บันทึกเอกสารไม่สำเร็จ: " + error.message, 500);

  const doc = data as JobDocument;

  // ────────── best-effort: เลื่อน stage ตาม doc_type + done ──────────
  if (done === true) {
    let targetStage: number | null = null;
    if (doc_type === "contract") targetStage = 14;
    if (doc_type === "warranty") targetStage = 24;

    if (targetStage !== null) {
      try {
        await sb.rpc("advance_stage", {
          p_job:  job_id,
          p_to:   targetStage,
          p_note: doc_type === "contract"
            ? "ทำเอกสารลูกค้า/สัญญาแล้ว (ศูนย์เอกสาร)"
            : "ส่งงาน + ใบรับประกัน (ศูนย์เอกสาร)",
        });
      } catch (e) {
        console.warn(`[job-documents] advance_stage→${targetStage} failed (best-effort):`, e);
      }
    }
  }

  return ok({ document: doc });
});
