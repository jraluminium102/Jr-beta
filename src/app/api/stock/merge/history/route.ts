import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/stock/merge/history?limit= — ประวัติการรวมรายการซ้ำ (audit STOCK_MERGE) · ADMIN อ่านอย่างเดียว
//   ใช้ตรวจย้อนหลังว่าพนักงานรวมอะไรเข้าอะไร ย้ายรหัส/ชื่ออะไร ราคาเปลี่ยนไหม ใครทำ เมื่อไหร่
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะแอดมินดูประวัติการรวมได้", 403);

  const limit = Math.min(300, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 150));
  const svc = createServiceClient() as any;

  const { data: rows, error } = await svc
    .from("audit_logs")
    .select("id, user_id, old_value, new_value, created_at")
    .eq("action", "STOCK_MERGE")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  // resolve ชื่อผู้ทำจาก profiles
  const ids = [...new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))];
  let names: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await svc.from("profiles").select("id, full_name").in("id", ids);
    names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
  }

  const items = (rows ?? []).map((r: any) => ({
    id: r.id,
    at: r.created_at,
    by: (r.user_id && names[r.user_id]) || "—",
    keep: r.old_value?.keep ?? null,          // {id,name,sku,unit_cost} ก่อนรวม
    removed: r.old_value?.removed ?? [],       // [{id,name,sku}] ที่ถูกยุบ+ลบ
    result: r.new_value ?? {},                 // {keepId,newSku,newName,pricedTo,boqMoved}
  }));

  return ok(items);
});
