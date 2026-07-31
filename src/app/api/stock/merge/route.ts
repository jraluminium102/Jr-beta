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
  // ราคาที่ตัวเก็บจะใช้ (= ราคาที่คิดราคา4.0/ใบตัดใช้): keep=ตัวเก็บชนะ(เติมถ้าว่าง) · remove=เอาราคาตัวที่ลบมาทับ
  priceMode: z.enum(["keep", "remove"]).optional(),
  // จำนวนคงเหลือตัวหลักหลังรวม (0116): block=ตัวลบต้อง0 · sum=รวม · removed=ของตัวลบ · keep=คงตัวหลัก
  qtyMode: z.enum(["block", "sum", "removed", "keep"]).optional(),
  reason: z.string().trim().optional(),   // เหตุผล write-off (บังคับเมื่อโหมดทิ้งของ)
});
const PRICE_WRITE = ["ADMIN", "ACCOUNTING"];

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
  if (msg.includes("qty_forbidden")) return { message: "การรวมที่เปลี่ยนจำนวนคงเหลือ ทำได้เฉพาะแอดมิน/บัญชี (สโตร์ต้องปรับยอดตัวซ้ำเป็น 0 ก่อน)", status: 403 };
  if (msg.includes("need_reason")) return { message: "โหมดนี้ทิ้งของบางส่วน (ตัดจำหน่ายสต็อก) — ต้องระบุเหตุผล", status: 400 };
  if (msg.includes("type_mismatch")) return { message: "รวมข้ามชนิดคิดต้นทุนไม่ได้ (อลูคิดต่อโล vs คิดต่อชิ้น) — ต้นทุนจะเพี้ยน", status: 409 };
  return { message: msg, status: 500 };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "write");
  // แอดมิน/สโตร์/บัญชี รวมได้ (บัญชี = role ที่ปรับมูลค่าคงคลัง ต้องผ่านด่านแรกด้วย)
  if (!["ADMIN", "STORE", "ACCOUNTING"].includes(ctx.role)) return err("ไม่มีสิทธิ์รวมรายการซ้ำ (เฉพาะแอดมิน/สโตร์/บัญชี)", 403);

  const b = Body.parse(await req.json().catch(() => ({})));
  const removeIds = [...new Set(b.removeIds)].filter((id) => id !== b.keepId);
  if (removeIds.length === 0) return err("ต้องระบุรายการที่จะลบ (ต่างจากตัวที่เก็บ)", 400);

  const qtyMode = b.qtyMode ?? "block";
  // โหมดที่เปลี่ยนจำนวน/มูลค่าคงคลัง = เฉพาะแอดมิน/บัญชี (กันไว้ก่อนถึง RPC ด้วย)
  if (qtyMode !== "block" && !PRICE_WRITE.includes(ctx.role)) {
    return err("การรวมที่เปลี่ยนจำนวนคงเหลือ ทำได้เฉพาะแอดมิน/บัญชี", 403);
  }

  const sb = ctx.supabase as any;

  // เก็บค่าเดิมของตัวที่เก็บ + ตัวที่ลบ (รวมต้นทุน/จำนวน) + snapshot ประวัติ moves ตัวที่ลบ ไว้ทำ audit ก่อน RPC ลบทิ้ง
  const [{ data: keepBefore }, { data: removeRows }, { data: removeMoves }] = await Promise.all([
    sb.from("stock_items").select("id, name, sku, unit_cost, qty_on_hand").eq("id", b.keepId).maybeSingle(),
    sb.from("stock_items").select("id, name, sku, qty_on_hand, unit_cost, price_per_kg").in("id", removeIds),
    // snapshot ledger ตัวที่ลบ (บัญชีสั่ง: ห้ามให้ประวัติเบิก/รับหายเงียบ) — เก็บเฉพาะที่ยัง active
    sb.from("stock_moves").select("id, stock_item_id, type, qty, unit_cost, total_price, job_id, ref, note, created_at, created_by")
      .in("stock_item_id", removeIds).eq("is_voided", false),
  ]);

  // ยิง RPC (atomic · has_role อยู่ในฟังก์ชัน)
  const { data, error } = await sb.rpc("merge_stock_items", {
    p_keep: b.keepId,
    p_remove: removeIds,
    p_new_sku: b.newSku ?? null,
    p_new_name: b.newName ?? null,
    p_price_mode: b.priceMode ?? "keep",
    p_qty_mode: qtyMode,
    p_reason: b.reason ?? null,
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
      // เก็บต้นทุน+จำนวน ตัวที่ลบ (บัญชี: มูลค่าที่กำลังยุบ) + snapshot ประวัติ moves (กันหายเงียบ)
      removed: (removeRows ?? []).map((r: any) => ({ id: r.id, name: r.name, sku: r.sku, qty_on_hand: r.qty_on_hand, unit_cost: r.unit_cost, price_per_kg: r.price_per_kg })),
      removedMoves: removeMoves ?? [],
      qtyMode, priceMode: b.priceMode ?? "keep", reason: b.reason ?? null,
    },
    newValue: data ?? { keepId: b.keepId, removed: removeIds },
  });

  return ok(data ?? { keepId: b.keepId, removed: removeIds });
});
