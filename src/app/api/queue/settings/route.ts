import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// ตั้งค่าคิว (queue_settings id=1) — ส่วนที่หน้าเว็บแก้เองได้ (0174): ต้องอยู่ออฟฟิศกี่วัน/เดือน · ออกหน้างานติดกันกี่วันถึงเตือน
const COLS = "office_days_required, field_streak_warn, max_pair_min, max_pair_km";
const DEFAULTS = { office_days_required: 4, field_streak_warn: 6, max_pair_min: 45, max_pair_km: 8 };

export const GET = withRoute(async () => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("queue_settings").select(COLS).eq("id", 1).maybeSingle();
  if (error && !/office_days_required|field_streak_warn/.test(String(error.message ?? ""))) throw dbError(error);
  return ok({ ...DEFAULTS, ...(data ?? {}), migrated: !error });
});

const putSchema = z.object({
  office_days_required: z.number().int().min(0).max(31).optional(),
  field_streak_warn: z.number().int().min(1).max(30).optional(),
});
export const PUT = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = putSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("queue_settings").update(body).eq("id", 1).select(COLS).maybeSingle();
  if (error) throw dbError(error);
  return ok({ ...DEFAULTS, ...(data ?? {}) });
});
