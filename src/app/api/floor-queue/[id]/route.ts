import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };
type Params = { params: { id: string } };

const SELECT = "*, job:job_id(job_code, customer_name, current_stage)";

// ทุกช่องแก้ inline ได้ (ส่งมาเฉพาะที่เปลี่ยน) — "" ในช่องวันที่ → null
const patchSchema = z.object({
  job_id: z.string().uuid().nullish(),
  customer_name: z.string().trim().min(1).optional(),
  work_desc: z.string().optional(),
  extra_note: z.string().optional(),
  duration_note: z.string().optional(),
  scheduled_date: z.string().nullish(),
  start_time: z.string().optional(),
  status: z.enum(["confirmed", "wait_cf", "wait_cf_jr"]).optional(),
  bucket: z.enum(["scheduled", "after_jr", "deposit_wait"]).optional(),
  kind: z.enum(["work", "assess"]).optional(),
  sort_order: z.number().int().optional(),
});

// PATCH /api/floor-queue/:id — แก้คิว (ย้ายถัง/ลงวันที่/เปลี่ยนสถานะ/แก้ข้อความ ฯลฯ)
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("floor_queue", "write");
  const body = patchSchema.parse(await req.json());

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) clean[k] = v === "" ? null : v;

  // ลงวันที่ให้ถังท้าย (after_jr/deposit_wait) โดยไม่ได้สั่งเปลี่ยน bucket มาด้วย → ย้ายเข้าปฏิทินอัตโนมัติ
  if (clean.scheduled_date && clean.bucket === undefined) clean.bucket = "scheduled";
  // ถอดวันที่ออก (ย้ายกลับถัง) โดยไม่ได้สั่ง bucket มาด้วย → ต้องระบุ bucket ปลายทางเอง (กันแถว "หาย" ไม่เข้าถังไหนเลย)
  //   เช็คทั้ง "" (จาก UI) และ null (จาก API ตรง) — zod รับได้ทั้งคู่
  if ((body.scheduled_date === "" || body.scheduled_date === null) && clean.bucket === undefined) {
    return err("ถอดวันที่ออกต้องเลือกถังปลายทางด้วย (รอต่อหลัง JR เสร็จ / มัดจำแล้ว รอลงคิว)", 422);
  }

  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("floor_queue_entries")
    .update(clean)
    .eq("id", params.id)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return err("งานนี้อยู่ในคิวอยู่แล้ว (ผูกได้แค่ 1 แถวต่องาน)", 409);
    throw dbError(error);
  }
  if (!data) return notFound("ไม่พบคิวนี้");
  return ok(data);
});

// DELETE /api/floor-queue/:id — ลบคิว
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("floor_queue", "write");
  const sb = ctx.supabase as unknown as Sb;
  const { error } = await sb.from("floor_queue_entries").delete().eq("id", params.id);
  if (error) throw dbError(error);
  return ok({ id: params.id });
});
