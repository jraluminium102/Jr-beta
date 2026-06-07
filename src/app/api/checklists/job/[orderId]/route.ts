/**
 * GET  /api/checklists/job/[orderId]
 *   — เช็คลิสต์ทั้งหมดสำหรับ production_order (กรองตาม role)
 * POST /api/checklists/job/[orderId]
 *   — บันทึก/อัปเดตผลการติ๊ก (ตรวจ target_role)
 */
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import type {
  ChecklistTemplate,
  ChecklistItem,
  JobChecklist,
  ChecklistItemsState,
} from "@/lib/database.types";
import type { ProductionOrder } from "@/lib/types";
import { z } from "zod";

const ItemStateSchema = z.object({
  checked: z.boolean(),
  note:    z.string().max(500).optional(),
});

const SaveChecklistSchema = z.object({
  template_id:  z.number({ required_error: "ต้องระบุ template_id" }).int().positive(),
  items_state:  z.record(z.string(), ItemStateSchema),
});

type Params = { params: { orderId: string } };

function parseOrderId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * GET /api/checklists/job/[orderId]
 */
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "read");
  const orderId = parseOrderId(params.orderId);
  if (!orderId) return err("orderId ไม่ถูกต้อง", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;

  // 1) ดึง production_order
  const { data: orderRaw, error: orderErr } = await ctx.supabase
    .from("production_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  const order = orderRaw as unknown as ProductionOrder | null;
  if (orderErr || !order) return notFound("ไม่พบใบสั่งผลิต");

  // 2) ดึง templates ที่ active
  const { data: tplsData, error: tplErr } = await svcAny
    .from("checklist_templates")
    .select("*")
    .eq("is_active", true)
    .order("id", { ascending: true }) as { data: ChecklistTemplate[] | null; error: { message: string } | null };

  if (tplErr) return err(tplErr.message, 500);
  const allTemplates = tplsData ?? [];

  // กรอง role
  const templates = ctx.role === "ADMIN"
    ? allTemplates
    : allTemplates.filter(
        (t) => t.target_role.length === 0 || t.target_role.includes(ctx.role)
      );

  if (templates.length === 0) return ok({ order, templates: [] });

  const templateIds = templates.map((t) => t.id);

  // 3) ดึง items
  const { data: itemsData, error: itemsErr } = await svcAny
    .from("checklist_items")
    .select("*")
    .in("template_id", templateIds)
    .order("seq", { ascending: true }) as { data: ChecklistItem[] | null; error: { message: string } | null };

  if (itemsErr) return err(itemsErr.message, 500);
  const allItems = itemsData ?? [];

  // 4) ดึง job_checklists ที่บันทึกไว้
  const { data: savedData } = await svcAny
    .from("job_checklists")
    .select("*")
    .eq("production_order_id", orderId)
    .in("template_id", templateIds) as { data: JobChecklist[] | null };

  const saved = savedData ?? [];
  const savedByTemplate = new Map(saved.map((s) => [s.template_id, s]));

  // 5) รวม items กับ saved checklist
  const result = templates.map((tpl) => {
    const items = allItems.filter((it) => it.template_id === tpl.id);
    const checklist = savedByTemplate.get(tpl.id) ?? null;

    return {
      template: tpl,
      items,
      saved_checklist: checklist,
    };
  });

  return ok({ order, templates: result });
});

/**
 * POST /api/checklists/job/[orderId]
 */
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "write");
  const orderId = parseOrderId(params.orderId);
  if (!orderId) return err("orderId ไม่ถูกต้อง", 400);

  const body = await req.json().catch(() => null);
  const parsed = SaveChecklistSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { template_id, items_state } = parsed.data;

  // ตรวจว่า production_order มีอยู่จริง
  const { data: orderCheck } = await ctx.supabase
    .from("production_orders")
    .select("id")
    .eq("id", orderId)
    .single();
  if (!orderCheck) return notFound("ไม่พบใบสั่งผลิต");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;

  // ตรวจ template + target_role
  const { data: tplData } = await svcAny
    .from("checklist_templates")
    .select("id, target_role, is_active")
    .eq("id", template_id)
    .single() as { data: Pick<ChecklistTemplate, "id" | "target_role" | "is_active"> | null };

  if (!tplData || !tplData.is_active) return notFound("ไม่พบ template");

  // security: role ต้องอยู่ใน target_role
  if (ctx.role !== "ADMIN") {
    const allowed = tplData.target_role.length === 0 || tplData.target_role.includes(ctx.role);
    if (!allowed) return err("บทบาทนี้ไม่มีสิทธิ์ติ๊กเช็คลิสต์นี้", 403);
  }

  // upsert — unique: production_order_id + template_id
  const { data, error } = await svcAny
    .from("job_checklists")
    .upsert(
      {
        production_order_id: orderId,
        template_id,
        checked_by: ctx.user.id,
        checked_at: new Date().toISOString(),
        items_state: items_state as unknown as ChecklistItemsState,
      },
      { onConflict: "production_order_id,template_id" }
    )
    .select("*")
    .single() as { data: JobChecklist | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  return ok(data as JobChecklist);
});
