/**
 * GET  /api/checklists/templates      — รายการ template (กรองตาม role + is_active)
 * POST /api/checklists/templates      — สร้าง template ใหม่ (ADMIN เท่านั้น)
 */
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, created } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ChecklistTemplate } from "@/lib/database.types";
import { z } from "zod";

const TemplateInsertSchema = z.object({
  name:         z.string().min(1, "ต้องระบุชื่อชุดเช็ค"),
  target_role:  z.array(z.enum(["ADMIN","SALES","DESIGNER","PRODUCTION","INSTALLER","ACCOUNTING","VIEWER"]))
                 .min(1, "ต้องระบุ role อย่างน้อย 1 บทบาท"),
  product_keys: z.array(z.string().regex(/^[a-zA-Z0-9_-]*$/, "product_key ไม่ถูกต้อง")).default([]),
  is_active:    z.boolean().default(true),
});

/** GET /api/checklists/templates */
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("checklists", "read");
  const params = new URL(req.url).searchParams;
  const includeInactive = params.get("include_inactive") === "1" && ctx.role === "ADMIN";

  // ใช้ svcAny — Supabase >=2.45 generic ทำให้ checklist tables (hand-maintained) infer เป็น never
  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = svc as any;

  let query = svcAny
    .from("checklist_templates")
    .select("*")
    .order("id", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query as { data: ChecklistTemplate[] | null; error: { message: string } | null };
  if (error) return err(error.message, 500);

  const rows = data ?? [];

  // กรองตาม target_role ของผู้เรียก (เว้นแต่เป็น ADMIN ดูทั้งหมด)
  const filtered = ctx.role === "ADMIN"
    ? rows
    : rows.filter((t) => t.target_role.length === 0 || t.target_role.includes(ctx.role));

  return ok(filtered);
});

/** POST /api/checklists/templates */
export const POST = withRoute(async (req: Request) => {
  // เฉพาะ ADMIN เท่านั้นที่สร้าง/แก้ template ได้
  const ctx = await requirePermission("checklists", "write");
  if (ctx.role !== "ADMIN") return err("เฉพาะ ADMIN เท่านั้น", 403);

  const body = await req.json().catch(() => null);
  const parsed = TemplateInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  // ใช้ service client เพราะ hand-maintained Database type ยังไม่รู้จัก checklist tables
  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = svc as any;
  const { data, error } = await svcAny
    .from("checklist_templates")
    .insert({ ...parsed.data, created_by: ctx.user.id })
    .select("*")
    .single() as { data: ChecklistTemplate | null; error: { message: string } | null };

  if (error) return err(error.message, 500);
  return created(data as ChecklistTemplate);
});
