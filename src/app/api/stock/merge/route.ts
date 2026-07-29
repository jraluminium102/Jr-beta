import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

// POST /api/stock/merge  — รวม "รายการซ้ำ" เข้าตัวเดียว (canonical) · ADMIN เท่านั้น
//   งานจริงทำใน RPC merge_stock_items (0113) แบบ atomic (all-or-nothing) + has_role('ADMIN') ในฟังก์ชัน
//   ดูรายละเอียดวิธีรวม/เหตุผลที่ไม่ยก stock_moves มาปน keep ได้ที่ 0113_merge_stock_items.sql
const Body = z.object({
  keepId: z.number().int().positive(),
  removeIds: z.array(z.number().int().positive()).min(1),
  newSku: z.string().trim().optional(),
  newName: z.string().trim().optional(),
  adoptPrice: z.boolean().optional(),
});

// map รหัส exception จาก RPC → ข้อความ/สถานะที่อ่านง่าย
function mapRpcError(msg: string): { message: string; status: number } {
  if (msg.includes("forbidden")) return { message: "ไม่มีสิทธิ์รวมรายการซ้ำ (เฉพาะแอดมิน/สโตร์)", status: 403 };
  if (msg.includes("no_remove")) return { message: "ต้องระบุรายการที่จะลบ (ต่างจากตัวที่เก็บ)", status: 400 };
  if (msg.includes("keep_not_found")) return { message: "ไม่พบรายการที่จะเก็บ", status: 404 };
  if (msg.includes("remove_not_found")) return { message: "ไม่พบบางรายการที่จะลบ (อาจถูกลบไปแล้ว)", status: 404 };
  if (msg.includes("has_qty:")) {
    const nm = msg.split("has_qty:")[1]?.trim() || "รายการนี้";
    return { message: `รวมไม่ได้ — "${nm}" ยังมีของคงเหลือ (ต้องปรับยอด/เบิกให้เป็น 0 ก่อนรวม)`, status: 409 };
  }
  if (msg.includes("bad_sku")) return { message: "รหัส (SKU) ที่จะย้ายไม่ตรงกับตัวที่ลบ", status: 400 };
  if (msg.includes("bad_name")) return { message: "ชื่อที่จะย้ายไม่ตรงกับตัวที่ลบ", status: 400 };
  return { message: msg, status: 500 };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "write");
  if (ctx.role !== "ADMIN" && ctx.role !== "STORE") return err("ไม่มีสิทธิ์รวมรายการซ้ำ (เฉพาะแอดมิน/สโตร์)", 403);

  const b = Body.parse(await req.json().catch(() => ({})));
  const removeIds = [...new Set(b.removeIds)].filter((id) => id !== b.keepId);
  if (removeIds.length === 0) return err("ต้องระบุรายการที่จะลบ (ต่างจากตัวที่เก็บ)", 400);

  const sb = ctx.supabase as any;

  // เก็บค่าเดิมของตัวที่เก็บ + ตัวที่ลบ ไว้ทำ audit (ก่อน RPC ทำงาน)
  const [{ data: keepBefore }, { data: removeRows }] = await Promise.all([
    sb.from("stock_items").select("id, name, sku, unit_cost").eq("id", b.keepId).maybeSingle(),
    sb.from("stock_items").select("id, name, sku, qty_on_hand").in("id", removeIds),
  ]);

  // ยิง RPC (atomic · has_role('ADMIN') อยู่ในฟังก์ชัน)
  const { data, error } = await sb.rpc("merge_stock_items", {
    p_keep: b.keepId,
    p_remove: removeIds,
    p_new_sku: b.newSku ?? null,
    p_new_name: b.newName ?? null,
    p_adopt_price: !!b.adoptPrice,
  });
  if (error) {
    const m = mapRpcError(error.message || "");
    // 42883 = ยังไม่ได้รัน migration 0113 (ฟังก์ชันยังไม่มี)
    if ((error as any).code === "42883") return err("ยังไม่ได้ติดตั้งฟังก์ชันรวมรายการซ้ำ (ต้องรัน migration 0113)", 501);
    return err(m.message, m.status);
  }

  await audit({
    userId: ctx.user.id, action: "STOCK_MERGE", table: "stock_items", recordId: String(b.keepId),
    oldValue: {
      keep: keepBefore ?? { id: b.keepId },
      removed: (removeRows ?? []).map((r: any) => ({ id: r.id, name: r.name, sku: r.sku })),
    },
    newValue: data ?? { keepId: b.keepId, removed: removeIds },
  });

  return ok(data ?? { keepId: b.keepId, removed: removeIds });
});
