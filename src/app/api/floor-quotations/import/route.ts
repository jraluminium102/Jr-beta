import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { importQuoteXlsx } from "@/lib/floor-calc/import-quote";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_MB = 8;

/**
 * POST /api/floor-quotations/import — อัปโหลดใบเสนอราคา .xlsx ของผู้รับเหมา
 *   multipart/form-data · field ชื่อ "file"
 *
 * แค่ "อ่านและจัดให้" — ไม่บันทึกลงฐานข้อมูล ผู้ใช้ตรวจ/แก้บนหน้าจอก่อนแล้วค่อยกดบันทึก
 * ราคาที่ได้ = ตามไฟล์ต้นฉบับทั้งหมด (เจ้าของสั่ง "ไม่เกี่ยวกับราคาในเว็บ แค่จัดฟอร์ม")
 */
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return fail("อ่านไฟล์ที่อัปโหลดไม่ได้");
  }
  if (!file) return fail("ยังไม่ได้แนบไฟล์");
  if (!/\.xlsx$/i.test(file.name)) {
    return fail("รองรับเฉพาะไฟล์ .xlsx — ถ้าเป็น .xls รุ่นเก่า ให้เปิดใน Excel แล้ว “บันทึกเป็น” .xlsx ก่อน");
  }
  if (file.size > MAX_MB * 1024 * 1024) return fail(`ไฟล์ใหญ่เกิน ${MAX_MB} MB`);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = importQuoteXlsx(buf);
    if (result.items.length === 0) return fail("อ่านไฟล์ได้ แต่ไม่พบรายการงานในตาราง — ตรวจว่าไฟล์มีตารางรายการจริงไหม");
    return ok({ ...result, fileName: file.name });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
  }
}
