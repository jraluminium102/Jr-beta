import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

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
}).refine((b) => b.title !== undefined || b.annotations !== undefined, { message: "ไม่มีข้อมูลให้บันทึก" });

// PATCH /api/job-drawings/:id — บันทึกชื่อชุดแบบ และ/หรือ ตำแหน่งกล่องข้อความ (annotations)
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("drawings", "write");
  const sb = ctx.supabase as unknown as AnySb;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return err("id ไม่ถูกต้อง", 422);
  const body = patchSchema.parse(await req.json());

  const { data: existing, error: findErr } = await sb.from("job_drawings").select("id").eq("id", id).maybeSingle();
  if (findErr) throw dbError(findErr);
  if (!existing) return err("ไม่พบแบบนี้", 404);

  const payload: Record<string, unknown> = { updated_by: ctx.user.id, updated_at: new Date().toISOString() };
  if (body.title !== undefined) payload.title = body.title;
  if (body.annotations !== undefined) payload.annotations = body.annotations;

  const { data, error } = await sb.from("job_drawings").update(payload).eq("id", id).select("*").maybeSingle();
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
