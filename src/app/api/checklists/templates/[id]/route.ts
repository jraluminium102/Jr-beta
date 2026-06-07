/**
 * GET    /api/checklists/templates/[id]   — ดู template + items
 * PATCH  /api/checklists/templates/[id]   — แก้ template (ADMIN)
 * DELETE /api/checklists/templates/[id]   — soft delete: is_active=false (ADMIN)
 */
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ChecklistTemplate, ChecklistItem } from "@/lib/database.types";
import { z } from "zod";

const TemplatePatchSchema = z.object({
  name:         z.string().min(1).optional(),
  target_role:  z.array(z.enum(["ADMIN","SALES","DESIGNER","PRODUCTION","INSTALLER","ACCOUNTING","VIEWER"])).optional(),
  product_keys: z.array(z.string().regex(/^[a-zA-Z0-9_-]*$/)).optional(),
  is_active:    z.boolean().optional(),
});

type Params = { params: { id: string } };

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** GET /api/checklists/templates/[id] — template + items */
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "read");
  const id = parseId(params.id);
  if (!id) return err("id ไม่ถูกต้อง", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;

  const { data: tpl, error: tplErr } = await svcAny
    .from("checklist_templates")
    .select("*")
    .eq("id", id)
    .single() as { data: ChecklistTemplate | null; error: { message: string } | null };

  if (tplErr || !tpl) return notFound("ไม่พบ template");

  // กรอง role: non-ADMIN เห็นเฉพาะ template ที่ตัวเองมีสิทธิ์
  if (
    ctx.role !== "ADMIN" &&
    tpl.target_role.length > 0 &&
    !tpl.target_role.includes(ctx.role)
  ) {
    return notFound("ไม่พบ template");
  }

  const { data: itemsData, error: itemsErr } = await svcAny
    .from("checklist_items")
    .select("*")
    .eq("template_id", id)
    .order("seq", { ascending: true }) as { data: ChecklistItem[] | null; error: { message: string } | null };

  if (itemsErr) return err(itemsErr.message, 500);
  const items = itemsData ?? [];

  return ok({ ...tpl, items });
});

/** PATCH /api/checklists/templates/[id] */
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะ ADMIN เท่านั้น", 403);

  const id = parseId(params.id);
  if (!id) return err("id ไม่ถูกต้อง", 400);

  const body = await req.json().catch(() => null);
  const parsed = TemplatePatchSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return err("ไม่มีข้อมูลให้แก้", 422);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;
  const { data, error } = await svcAny
    .from("checklist_templates")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single() as { data: ChecklistTemplate | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  if (!data) return notFound("ไม่พบ template");
  return ok(data);
});

/** DELETE /api/checklists/templates/[id] — soft delete */
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะ ADMIN เท่านั้น", 403);

  const id = parseId(params.id);
  if (!id) return err("id ไม่ถูกต้อง", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;
  const { error } = await svcAny
    .from("checklist_templates")
    .update({ is_active: false })
    .eq("id", id) as { error: { message: string } | null };

  if (error) return err(error.message, 500);
  return ok({ id, is_active: false });
});
