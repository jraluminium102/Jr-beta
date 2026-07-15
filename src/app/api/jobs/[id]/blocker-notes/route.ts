import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

type Params = { params: { id: string } };

// tag ที่กดได้จริง (ตาม migration 0098) — "อื่นๆ" เท่านั้นที่พิมพ์ข้อความเองได้
const TAGS = ["floor_work", "wait_ykk", "wait_tostem", "other"] as const;

const postSchema = z.object({
  tag: z.enum(TAGS),
  note: z.string().trim().max(200).optional(),
}).refine((v) => v.tag !== "other" || !!v.note, { message: "กรุณาพิมพ์ข้อความสำหรับ 'อื่นๆ'", path: ["note"] });

// job_blocker_notes ยังไม่อยู่ใน database.types.ts (generated จาก schema) — cast แบบเดียวกับตารางใหม่ตัวอื่น
// (เช่น install_teams ใน src/app/api/install-teams/route.ts) เพราะ supabase generic เข้มเกินจริงกับตารางที่เพิ่งเพิ่ม
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// GET /api/jobs/:id/blocker-notes — โน้ตทั้งหมดของงานนี้ (เรียงเก่า→ใหม่)
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as AnySb;
  const { data, error } = await sb
    .from("job_blocker_notes")
    .select("id, tag, note, source, created_at")
    .eq("job_id", params.id)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error);
  return ok(data ?? []);
});

// POST /api/jobs/:id/blocker-notes — เพิ่มโน้ตเด่น (chip) ต่องาน
// body: { tag: floor_work|wait_ykk|wait_tostem|other, note?: string (บังคับเมื่อ tag=other) }
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const body = postSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as AnySb;

  const { data, error } = await sb
    .from("job_blocker_notes")
    .insert({
      job_id: params.id,
      tag: body.tag,
      note: body.tag === "other" ? (body.note ?? "") : "",
      source: "manual",
      created_by: ctx.user.id,
    })
    .select("id, tag, note, source, created_at")
    .single();
  if (error) {
    // แท็กสำเร็จรูปซ้ำ (unique index uq_job_blocker_notes_tag) — บอกเหตุผลเข้าใจง่ายแทน error DB ดิบ
    if (error.code === "23505") return err("ติดแท็กนี้ไว้แล้ว", 409);
    throw dbError(error);
  }
  return created(data);
});
