import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { z } from "zod";

const UploadUrlSchema = z.object({
  // กัน path traversal: อนุญาตเฉพาะ a-z A-Z 0-9 _ - (ห้าม / หรือ . ที่ใช้ ../ ออกนอกโฟลเดอร์)
  product_key: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "product_key ไม่ถูกต้อง"),
  filename:    z.string().min(1),            // ชื่อไฟล์ต้นฉบับ (ใช้ทำ path)
});

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const BUCKET = "product-images";

/**
 * POST /api/gallery/upload-url
 * คืน signed upload URL (60 วินาที) + storage_path ที่จะบันทึกใน product_gallery
 * Flow: client เรียก endpoint นี้ → ได้ url → PUT ไฟล์ขึ้น Supabase Storage →
 *       เรียก POST /api/gallery ด้วย storage_path ที่ได้
 */
export const POST = withRoute(async (req: Request) => {
  await requirePermission("product_gallery", "write");

  const body = await req.json().catch(() => null);
  const parsed = UploadUrlSchema.safeParse(body);
  if (!parsed.success) return err("ข้อมูลไม่ถูกต้อง", 422, parsed.error.flatten());

  const { product_key, filename } = parsed.data;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
  if (!allowedExts.includes(ext)) return err("ไฟล์ต้องเป็นรูปภาพ (jpg/png/webp/gif)", 400);

  // path: product_key/timestamp-random.ext  (กัน collision)
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${product_key}/${ts}-${rand}.${ext}`;

  const svc = createServiceClient();
  const { data, error } = await svc.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error) return err(error.message, 500);

  return ok({
    signed_url: data.signedUrl,
    token:      data.token,
    storage_path: storagePath,
    allowed_mime: ALLOWED_MIME,
  });
});
