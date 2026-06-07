/**
 * GET    /api/checklists/templates/[id]/items            — รายการ items
 * POST   /api/checklists/templates/[id]/items            — เพิ่ม item (ADMIN)
 * PATCH  /api/checklists/templates/[id]/items?item_id=X  — แก้ item เดี่ยว (ADMIN)
 * DELETE /api/checklists/templates/[id]/items?item_id=X  — ลบ item (ADMIN)
 */
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, created, notFound } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ChecklistItem } from "@/lib/database.types";
import { z } from "zod";

const ItemInsertSchema = z.object({
  seq:           z.number().int().min(0).default(0),
  text:          z.string().min(1, "ต้องระบุข้อความรายการ"),
  requires_sign: z.boolean().default(false),
});

const ItemPatchSchema = z.object({
  seq:           z.number().int().min(0).optional(),
  text:          z.string().min(1).optional(),
  requires_sign: z.boolean().optional(),
});

type Params = { params: { id: string } };

function parseId(raw: string | null | undefined) {
  const id = Number(raw ?? "");
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** GET /api/checklists/templates/[id]/items */
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  await requirePermission("checklists", "read");
  const templateId = parseId(params.id);
  if (!templateId) return err("id ไม่ถูกต้อง", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;
  const { data, error } = await svcAny
    .from("checklist_items")
    .select("*")
    .eq("template_id", templateId)
    .order("seq", { ascending: true }) as { data: ChecklistItem[] | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

/** POST /api/checklists/templates/[id]/items */
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะ ADMIN เท่านั้น", 403);

  const templateId = parseId(params.id);
  if (!templateId) return err("id ไม่ถูกต้อง", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;

  // ตรวจว่า template มีอยู่จริง
  const { data: tpl } = await svcAny
    .from("checklist_templates")
    .select("id")
    .eq("id", templateId)
    .single() as { data: { id: number } | null };
  if (!tpl) return notFound("ไม่พบ template");

  const body = await req.json().catch(() => null);
  const parsed = ItemInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { data, error } = await svcAny
    .from("checklist_items")
    .insert({
      template_id:   templateId,
      seq:           parsed.data.seq,
      text:          parsed.data.text,
      requires_sign: parsed.data.requires_sign,
    })
    .select("*")
    .single() as { data: ChecklistItem | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  return created(data as ChecklistItem);
});

/** PATCH /api/checklists/templates/[id]/items?item_id=X */
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะ ADMIN เท่านั้น", 403);

  const templateId = parseId(params.id);
  if (!templateId) return err("template id ไม่ถูกต้อง", 400);

  const url = new URL(req.url);
  const itemId = parseId(url.searchParams.get("item_id"));
  if (!itemId) return err("ต้องระบุ item_id", 400);

  const body = await req.json().catch(() => null);
  const parsed = ItemPatchSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return err("ไม่มีข้อมูลให้แก้", 422);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;
  const { data, error } = await svcAny
    .from("checklist_items")
    .update(parsed.data)
    .eq("id", itemId)
    .eq("template_id", templateId)
    .select("*")
    .single() as { data: ChecklistItem | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  if (!data) return notFound("ไม่พบ item");
  return ok(data);
});

/** DELETE /api/checklists/templates/[id]/items?item_id=X */
export const DELETE = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("checklists", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะ ADMIN เท่านั้น", 403);

  const templateId = parseId(params.id);
  if (!templateId) return err("template id ไม่ถูกต้อง", 400);

  const url = new URL(req.url);
  const itemId = parseId(url.searchParams.get("item_id"));
  if (!itemId) return err("ต้องระบุ item_id", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = createServiceClient() as any;
  const { error } = await svcAny
    .from("checklist_items")
    .delete()
    .eq("id", itemId)
    .eq("template_id", templateId) as { error: { message: string } | null };

  if (error) return err(error.message, 500);
  return ok({ id: itemId, deleted: true });
});
