import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };

// GET /api/warranties/[id]  → ใบรับประกันเดี่ยว
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("warranties", "read");
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb
    .from("warranties")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) throw dbError(error);
  if (!data) return notFound("ไม่พบใบรับประกัน");
  return ok(data);
});
