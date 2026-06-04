import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ProductGallery } from "@/lib/database.types";
import { z } from "zod";

const GalleryPatchSchema = z.object({
  title:       z.string().optional(),
  sort_order:  z.number().int().optional(),
  is_active:   z.boolean().optional(),
  product_key: z.string().min(1).optional(),
});

/** GET /api/gallery/[id] — คืนรูปเดี่ยว */
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("product_gallery", "read");
  const id = Number(params.id);
  if (!Number.isFinite(id)) return err("id ไม่ถูกต้อง", 400);

  const { data: rawData, error } = await ctx.supabase
    .from("product_gallery")
    .select("*")
    .eq("id", id)
    .single();

  // cast ผ่าน unknown — Supabase >=2.45 generic infer เป็น never กับ hand-maintained types
  const data = rawData as unknown as ProductGallery | null;
  if (error || !data) return notFound("ไม่พบรูป");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return ok({
    ...data,
    public_url: `${supabaseUrl}/storage/v1/object/public/product-images/${data.storage_path}`,
  });
});

/** PATCH /api/gallery/[id] — แก้ title / sort_order / is_active */
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  await requirePermission("product_gallery", "write");
  const id = Number(params.id);
  if (!Number.isFinite(id)) return err("id ไม่ถูกต้อง", 400);

  const body = await req.json().catch(() => null);
  const parsed = GalleryPatchSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return err("ไม่มีข้อมูลให้แก้", 422);

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny = svc as any;
  const patchResult = await svcAny
    .from("product_gallery")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single() as { data: ProductGallery | null; error: { message: string } | null };
  const { data: rawPatch, error } = patchResult;

  if (error) return err(error.message, 500);
  if (!rawPatch) return notFound("ไม่พบรูป");
  return ok(rawPatch);
});

/** DELETE /api/gallery/[id] — ซ่อนรูป (soft delete: is_active=false) */
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  await requirePermission("product_gallery", "write");
  const id = Number(params.id);
  if (!Number.isFinite(id)) return err("id ไม่ถูกต้อง", 400);

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svcAny2 = svc as any;
  const delResult = await svcAny2
    .from("product_gallery")
    .update({ is_active: false })
    .eq("id", id) as { error: { message: string } | null };
  const { error } = delResult;

  if (error) return err(error.message, 500);
  return ok({ id, is_active: false });
});
