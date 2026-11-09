import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// PUT /api/stats/goal { goal } — เป้ายอดงานต่อเดือน (บาท ก่อน VAT) เก็บ app_config.stats_goal_monthly (0172)
//   บัญชีใช้เทียบ "ยอดรวมที่ต้องหาทั้งหมด" ต่อรอบเดือน · แก้ได้จากหน้าสถิติ
const schema = z.object({ goal: z.number().min(0).max(1_000_000_000) });

export const PUT = withRoute(async (req: Request) => {
  await requirePermission("finance", "write");
  const { goal } = schema.parse(await req.json());
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const { error } = await sb.from("app_config").upsert({ key: "stats_goal_monthly", value: String(Math.round(goal)), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return ok({ goal: Math.round(goal) });
});
