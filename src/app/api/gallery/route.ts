import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, created } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ProductGallery } from "@/lib/database.types";
import { z } from "zod";

const GalleryInsertSchema = z.object({
  product_key:  z.string().min(1, "ต้องระบุ product_key").regex(/^[a-zA-Z0-9_-]+$/, "product_key ไม่ถูกต้อง"),
  title:        z.string().default(""),
  storage_path: z.string().min(1, "ต้องระบุ storage_path"),
  sort_order:   z.number().int().default(0),
  is_active:    z.boolean().default(true),
});

/**
 * GET /api/gallery?product_key=sliding_sms
 * คืนรูปที่ active ของสินค้านั้น (ถ้าไม่ระบุ product_key คืนทั้งหมด)
 * พร้อม public_url จาก Supabase Storage
 */
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("product_gallery", "read");
  const params = new URL(req.url).searchParams;
  const productKey = params.get("product_key")?.trim() ?? "";
  // รูป inactive = ซ่อนจาก user ทั่วไป → เห็นได้เฉพาะ role ที่จัดการคลังภาพ (ADMIN/SALES)
  const includeInactive = params.get("include_inactive") === "1"
    && (ctx.role === "ADMIN" || ctx.role === "SALES");

  let query = ctx.supabase
    .from("product_gallery")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (productKey) query = query.eq("product_key", productKey);
  if (!includeInactive) query = query.eq("is_active", true);

  const { data: rawData, error } = await query;
  if (error) return err(error.message, 500);

  // cast ผ่าน unknown — Supabase >=2.45 generic เปลี่ยนทำให้ infer เป็น never สำหรับ hand-maintained types
  const rows = (rawData as unknown as ProductGallery[] ?? []);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const result = rows.map((row) => ({
    ...row,
    public_url: `${supabaseUrl}/storage/v1/object/public/product-images/${row.storage_path}`,
  }));

  return ok(result);
});

/**
 * POST /api/gallery
 * เพิ่มรูปใหม่ (upload file ต้องทำ client-side ผ่าน /api/gallery/upload-url ก่อน)
 * body: { product_key, title, storage_path, sort_order?, is_active? }
 */
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("product_gallery", "write");

  const body = await req.json().catch(() => null);
  const parsed = GalleryInsertSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const svc = createServiceClient();
  const { data: rawInsert, error } = await svc
    .from("product_gallery")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ ...parsed.data, created_by: ctx.user.id } as any)
    .select("*")
    .single();

  if (error) return err(error.message, 500);
  return created(rawInsert as unknown as ProductGallery);
});
