import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

type Params = { params: { id: string; noteId: string } };
// job_blocker_notes ยังไม่อยู่ใน database.types.ts — cast แบบเดียวกับตารางใหม่ตัวอื่น (ดูคอมเมนต์ใน route.ts ข้างเคียง)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// DELETE /api/jobs/:id/blocker-notes/:noteId — เอาโน้ตออก (กดออกเร็วจากหน้ารายการ)
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as AnySb;
  const { data, error } = await sb
    .from("job_blocker_notes")
    .delete()
    .eq("id", params.noteId)
    .eq("job_id", params.id)
    .select("id")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return notFound("ไม่พบโน้ตนี้ (อาจถูกลบไปแล้ว)");
  return ok({ id: params.noteId });
});
