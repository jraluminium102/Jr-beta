import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

export const GET = withRoute(async () => {
  const ctx = await requirePermission("installation", "read");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).from("install_teams").select("*").eq("is_active", true).order("sort_order", { ascending: true });
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

const Schema = z.object({
  name: z.string().min(1, "ต้องระบุชื่อทีม"),
  lead_name: z.string().optional().default(""),
  color: z.string().optional().default("red"),
  sort_order: z.number().int().optional().default(0),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).from("install_teams").insert(p.data).select("*").single();
  if (error) return err(error.message, 500);
  return ok(data);
});
