import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

const Schema = z.object({
  name: z.string().min(1).optional(),
  is_leader: z.boolean().optional(),
  is_member: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// PATCH /api/crew-people/[id] → แก้ชื่อ/บทบาท/เปิด-ปิดใช้งาน (ปิดใช้งานแทนลบ กันประวัติทีมเก่าอ้างอิงไม่ได้)
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb.from("crew_people").update(p.data).eq("id", params.id).select("*").single();
  if (error) return err(error.message, 500);
  if (!data) return notFound("ไม่พบคนนี้");
  return ok(data);
});
