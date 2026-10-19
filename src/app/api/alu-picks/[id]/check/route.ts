import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { requirePermission } from "@/lib/bff/context";
import { runPick } from "@/lib/alu-pick/route-helpers";
import { setPickChecked, type Sb } from "@/lib/alu-pick/service";

export const dynamic = "force-dynamic";

/** POST /api/alu-picks/[id]/check {checked:true|false} → สโตร์ตรวจแล้ว (เฉพาะคนล็อกอิน · ช่างกดไม่ได้) */
export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("stock", "write");
  const b = await req.json().catch(() => ({}));
  const id = Number(params.id);
  const checked = b?.checked !== false;
  return runPick(async () => {
    await setPickChecked(ctx.supabase as unknown as Sb, { userId: ctx.user.id, name: ctx.profile.full_name ?? "", isChang: false }, id, checked);
    await audit({ userId: ctx.user.id, action: checked ? "ALU_PICK_CHECK" : "ALU_PICK_UNCHECK", table: "alu_picks", recordId: String(id) });
    return ok({ id, checked });
  });
});
