import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadConfig, type Sb } from "@/lib/app-config-json";
import { readBillImage, ReadBillError } from "@/lib/ai/read-bill";
import { aiBillToRow, parseSupplierStore, SUPPLIERS_KEY } from "@/lib/purchase-tax";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/purchase-tax/read — ให้ AI อ่านรูปบิลซื้อ 1 หน้า (multipart: file = JPG/PNG · ref = ชื่อไฟล์+หน้า)
 *   คืน "แถวร่าง" (ยังไม่บันทึก) — หน้าจอเอาไปเพิ่มผ่าน POST /api/purchase-tax เอง
 *   เทียบสมุดร้านให้แล้ว (เลขผู้เสียภาษีตรง → ชื่อ/สาขา/วิธีชำระตามสมุด) · ใส่ธงเตือนตามที่ AI ไม่มั่นใจ
 *   หน้า PDF ถูกแปลงเป็นรูปที่เบราว์เซอร์ก่อนส่งมา (ทีละหน้า · ไฟล์ไม่เกิน 4 MB ตามเพดานของ Vercel)
 * สิทธิ์: finance:write (เรียก AI มีค่าใช้จ่าย)
 */
const MAX_BYTES = 4 * 1024 * 1024;

export const POST = withRoute(async (req: Request) => {
  await requirePermission("finance", "write");
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "อ่านรูปที่อัปโหลดไม่ได้");
  const f = form.get("file");
  if (!(f instanceof File)) throw new HttpError(400, "ยังไม่ได้แนบรูป");
  if (f.size > MAX_BYTES) throw new HttpError(400, "รูปใหญ่เกิน 4 MB");
  const ref = String(form.get("ref") ?? "").slice(0, 200);

  let result;
  try {
    result = await readBillImage(Buffer.from(await f.arrayBuffer()), f.type || "image/jpeg");
  } catch (e) {
    if (e instanceof ReadBillError) throw new HttpError(e.status, e.message);
    throw e;
  }
  const sup = parseSupplierStore((await loadConfig(createServiceClient() as unknown as Sb, SUPPLIERS_KEY)).value).list;
  const rows = result.bills.map((b) => aiBillToRow(b, sup, ref)).filter((r): r is NonNullable<typeof r> => r !== null);
  return ok({ rows, skipped: result.bills.length - rows.length, found: result.bills.length, usage: result.usage });
});
