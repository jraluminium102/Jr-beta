import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };
type Params = { params: { id: string } };

// DELETE /api/calc-overrides/:id — ลบ override (= คืนค่าเดิมของสูตร)
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("calc_overrides", "write");
  const sb = ctx.supabase as unknown as Sb;

  const { data: existing } = await sb.from("calc_line_overrides").select("*").eq("id", params.id).maybeSingle();
  if (!existing) return notFound("ไม่พบ override นี้ (อาจถูกลบไปแล้ว)");

  const { error } = await sb.from("calc_line_overrides").delete().eq("id", params.id);
  if (error) throw dbError(error);

  await audit({
    userId: ctx.user.id,
    action: "DELETE_CALC_OVERRIDE",
    table: "calc_line_overrides",
    recordId: params.id,
    oldValue: existing,
    newValue: null,
  });

  return ok({ id: params.id });
});
