import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { pickCtx, runPick } from "@/lib/alu-pick/route-helpers";
import { editPickQty, cancelPick } from "@/lib/alu-pick/service";

export const dynamic = "force-dynamic";

/**
 * PATCH  /api/alu-picks/[id] {items:[{item_id, qty}]} → แก้จำนวนเบิก (เพิ่ม = ตัดเพิ่ม · ลด = คืนเข้า)
 * DELETE /api/alu-picks/[id] {reason}              → ยกเลิกทั้งใบ (คืนเส้นที่ยังไม่คืนทั้งหมด)
 * ช่างทำได้เฉพาะใบที่สโตร์ยังไม่ตรวจ · สโตร์/ออฟฟิศทำได้ตลอด
 */
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const { sb, actor } = await pickCtx(req, "write");
  const b = await req.json().catch(() => ({}));
  const id = Number(params.id);
  return runPick(async () => {
    await editPickQty(sb, actor, id, Array.isArray(b.items) ? b.items : []);
    await audit({ userId: actor.userId, action: "ALU_PICK_EDIT", table: "alu_picks", recordId: String(id), newValue: { by: actor.name, items: b.items } });
    return ok({ id });
  });
});

export const DELETE = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const { sb, actor } = await pickCtx(req, "write");
  // api.del ไม่ส่ง body → เหตุผลมาทาง ?reason=
  const reason = (new URL(req.url).searchParams.get("reason") ?? "").trim();
  const id = Number(params.id);
  return runPick(async () => {
    await cancelPick(sb, actor, id, reason);
    await audit({ userId: actor.userId, action: "ALU_PICK_CANCEL", table: "alu_picks", recordId: String(id), newValue: { by: actor.name, reason } });
    return ok({ id });
  });
});
