import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

type Params = { params: { id: string } };

// GET /api/issues/:id/updates — timeline ความคืบหน้า (เก่า→ใหม่)
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("issues", "read");
  const { data, error } = await ctx.supabase
    .from("issue_updates")
    .select("*, author:author_id(full_name)")
    .eq("issue_id", params.id)
    .order("created_at", { ascending: true });
  if (error) throw dbError(error);
  return ok(data ?? []);
});

const schema = z.object({
  note:       z.string().min(1, "กรุณาระบุความคืบหน้า"),
  new_status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(),
  resolution: z.string().nullish(), // จำเป็นเมื่อปิดงานจาก timeline
});

// POST /api/issues/:id/updates — เพิ่มความคืบหน้า; ถ้า new_status มา → อัปเดต issues.status ด้วย
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("issues", "write");
  const body = schema.parse(await req.json());

  // guard เดิม: ปิดงานต้องมี resolution
  if (body.new_status === "CLOSED" && !body.resolution) {
    return err("ต้องระบุวิธีแก้ก่อนปิด issue", 422);
  }

  const { data, error } = await ctx.supabase
    .from("issue_updates")
    .insert({ issue_id: params.id, note: body.note, new_status: body.new_status ?? null, author_id: ctx.profile.id })
    .select("*, author:author_id(full_name)")
    .single();
  if (error || !data) throw dbError(error ?? { message: "Insert failed" });

  // sync สถานะ issue ตาม update (best-effort, อยู่ใน transaction เดียวกันเชิงตรรกะ)
  if (body.new_status) {
    const patch: Record<string, unknown> = { status: body.new_status };
    if (body.new_status === "CLOSED") {
      patch.resolution = body.resolution;
      patch.resolved_at = new Date().toISOString();
    }
    const { error: upErr } = await ctx.supabase.from("issues").update(patch).eq("id", params.id);
    if (upErr) throw dbError(upErr);
  }

  return created(data);
});
