import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const createSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1, "กรุณาระบุชื่อ"),
  team: z.enum(["BKK", "PHUKET"]).default("BKK"),
  role: z.enum(["MAIN", "ASSISTANT"]).default("ASSISTANT"),
  parent_sales_id: z.string().uuid().nullish(),
  active: z.boolean().default(true),
});

// GET /api/queue/sales — list all queue_sales (active only)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb
    .from("queue_sales")
    .select("*")
    .eq("active", true)
    .order("team")
    .order("role")
    .order("name");
  if (error) throw dbError(error);
  return ok(data ?? []);
});

// POST /api/queue/sales — add a new assistant (ADMIN only; RLS guards queue_sales_write)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = createSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb
    .from("queue_sales")
    .insert(body)
    .select("*")
    .single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(400, "สร้างรายชื่อเซลล์/ผู้ช่วยไม่สำเร็จ");
  return created(data);
});
