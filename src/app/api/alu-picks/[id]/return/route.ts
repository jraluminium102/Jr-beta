import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { pickCtx, runPick } from "@/lib/alu-pick/route-helpers";
import { returnPickItems } from "@/lib/alu-pick/service";

export const dynamic = "force-dynamic";

/** POST /api/alu-picks/[id]/return {items:[{item_id, qty}]} → คืนเส้น (รับเข้า ref เดิม) */
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const { sb, actor } = await pickCtx(req, "write");
  const b = await req.json().catch(() => ({}));
  const id = Number(params.id);
  return runPick(async () => {
    await returnPickItems(sb, actor, id, Array.isArray(b.items) ? b.items : []);
    await audit({ userId: actor.userId, action: "ALU_PICK_RETURN", table: "alu_picks", recordId: String(id), newValue: { by: actor.name, items: b.items } });
    return ok({ id });
  });
});
