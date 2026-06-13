import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";
import type { JobDocument } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// ─── PATCH /api/job-documents/[id] ───────────────────────────────────────────
const patchSchema = z.object({
  doc_no:    z.string().nullable().optional(),
  file_link: z.string().nullable().optional(),
  doc_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").nullable().optional(),
  meta:      z.record(z.unknown()).optional(),
  done:      z.boolean().optional(),
});

export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  await requirePermission("jobs", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;

  const body = patchSchema.parse(await req.json());
  if (Object.keys(body).length === 0) return err("ไม่มีข้อมูลให้แก้ไข", 400);

  const { data, error } = await sb
    .from("job_documents")
    .update(body)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return err("แก้ไขเอกสารไม่สำเร็จ: " + error.message, 500);
  if (!data) return err("ไม่พบเอกสาร", 404);

  return ok({ document: data as JobDocument });
});

// ─── DELETE /api/job-documents/[id] ──────────────────────────────────────────
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  await requirePermission("jobs", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;

  const { error } = await sb
    .from("job_documents")
    .delete()
    .eq("id", params.id);

  if (error) return err("ลบเอกสารไม่สำเร็จ: " + error.message, 500);

  return ok({ deleted: true });
});
