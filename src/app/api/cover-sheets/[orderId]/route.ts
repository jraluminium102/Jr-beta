/**
 * GET  /api/cover-sheets/[orderId]
 *   — derive ใบปะหน้าจาก production_order + โหลด saved notes (ถ้ามี)
 * PUT  /api/cover-sheets/[orderId]
 *   — upsert cover_sheet_notes (ADMIN / PRODUCTION / SALES เท่านั้น)
 */
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { deriveCoverSheet } from "@/lib/coverSheet";
import type { CoverSheetNotes } from "@/lib/database.types";
import type { ProductionOrder } from "@/lib/types";
import { z } from "zod";

const SaveCoverSheetSchema = z.object({
  installer_notes: z.string().max(4000).default(""),
  customer_notes:  z.string().max(4000).default(""),
  warning_left:    z.string().max(200).default(""),
  warning_right:   z.string().max(200).default(""),
});

type Params = { params: { orderId: string } };

function parseOrderId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * GET /api/cover-sheets/[orderId]
 * สิทธิ์: production_orders read (ทุก role ที่ใช้งานอยู่อ่านได้)
 */
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production_orders", "read");
  const orderId = parseOrderId(params.orderId);
  if (!orderId) return err("orderId ไม่ถูกต้อง", 400);

  // ดึง production_order ผ่าน user client (respect RLS)
  const { data: orderRaw, error: orderErr } = await ctx.supabase
    .from("production_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  const order = orderRaw as unknown as ProductionOrder | null;
  if (orderErr || !order) return notFound("ไม่พบใบสั่งผลิต");

  // derive ข้อมูลใบปะหน้าจากรายการในใบสั่งผลิต
  const derived = deriveCoverSheet(order);

  // โหลด saved notes (ถ้ามี) — ใช้ serviceClient เพราะ cover_sheet_notes ไม่อยู่ใน Database type ยังไม่ได้ gen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;

  const { data: savedRaw } = await svcAny
    .from("cover_sheet_notes")
    .select("installer_notes, customer_notes, warning_left, warning_right, updated_at")
    .eq("production_order_id", orderId)
    .maybeSingle() as { data: Pick<CoverSheetNotes, "installer_notes" | "customer_notes" | "warning_left" | "warning_right" | "updated_at"> | null };

  return ok({
    order: {
      id:                order.id,
      code:              order.code,
      customer_snapshot: order.customer_snapshot,
      items:             order.items,
      due_date:          order.due_date,
      status:            order.status,
    },
    derived,
    saved: savedRaw ?? null,
  });
});

/**
 * PUT /api/cover-sheets/[orderId]
 * สิทธิ์: เขียน production_orders (ADMIN / PRODUCTION / SALES)
 */
export const PUT = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production_orders", "write");
  const orderId = parseOrderId(params.orderId);
  if (!orderId) return err("orderId ไม่ถูกต้อง", 400);

  const body = await req.json().catch(() => null);
  const parsed = SaveCoverSheetSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  // ตรวจว่า production_order มีอยู่จริง
  const { data: orderCheck } = await ctx.supabase
    .from("production_orders")
    .select("id")
    .eq("id", orderId)
    .single();
  if (!orderCheck) return notFound("ไม่พบใบสั่งผลิต");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;

  const { data, error } = await svcAny
    .from("cover_sheet_notes")
    .upsert(
      {
        production_order_id: orderId,
        installer_notes:     parsed.data.installer_notes,
        customer_notes:      parsed.data.customer_notes,
        warning_left:        parsed.data.warning_left,
        warning_right:       parsed.data.warning_right,
        updated_by:          ctx.user.id,
      },
      { onConflict: "production_order_id" }
    )
    .select("installer_notes, customer_notes, warning_left, warning_right, updated_at")
    .single() as { data: Pick<CoverSheetNotes, "installer_notes" | "customer_notes" | "warning_left" | "warning_right" | "updated_at"> | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  return ok(data as NonNullable<typeof data>);
});
