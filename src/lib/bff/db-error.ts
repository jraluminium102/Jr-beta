import { HttpError } from "./context";

type DbErr = { code?: string; message?: string } | null | undefined;

/** ยังไม่ได้รัน migration หรือเปล่า — เช็คทั้งฝั่ง Postgres (42P01) และ PostgREST (schema cache) */
function migrationHint(error: DbErr): string | null {
  if (!error) return null;
  const msg = error.message ?? "";
  const isMissing =
    error.code === "42P01" ||        // Postgres: relation ไม่มี
    error.code === "PGRST205" ||     // PostgREST: ไม่เจอตารางใน schema cache
    error.code === "PGRST202" ||     // PostgREST: ไม่เจอฟังก์ชัน/RPC
    /schema cache/i.test(msg);
  if (!isMissing) return null;
  const what = msg.match(/'public\.([a-zA-Z0-9_]+)'/)?.[1];
  return `ส่วนนี้ยังใช้ไม่ได้ — ยังไม่ได้รัน migration${what ? ` (ยังไม่มี ${what} ในฐานข้อมูล)` : ""} · แจ้งแอดมินให้รัน migration ล่าสุดก่อน`;
}

/**
 * error จาก DB → ข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง
 * ใช้กับ route ที่ยังไม่ได้ผ่าน withRoute/dbError (เช่น /api/cutlists ที่ต่อ error.message ดิบ ๆ)
 *
 * ที่มา: เจ้าของกดสร้างใบตัดแล้วเจอ "สร้างใบตัดไม่สำเร็จ: Could not find the table
 * 'public.cutlists' in the schema cache" — อ่านไม่ออกว่าต้องรัน migration (16 ก.ค.2569)
 */
export function dbMessage(error: DbErr, fallback: string): string {
  return migrationHint(error) ?? (error?.message ? `${fallback}: ${error.message}` : fallback);
}

// แปลง error ของ Supabase/Postgres ให้เป็นข้อความอ่านรู้เรื่อง (แทน "Internal error" 500)
export function dbError(error: { code?: string; message: string }): HttpError {
  if (error.code === "23503") return new HttpError(422, "ข้อมูลอ้างอิงไม่ถูกต้อง (เช่น เซลล์ที่เลือกไม่มีอยู่)");
  if (error.code === "23502") return new HttpError(422, "ข้อมูลไม่ครบ (มีช่องบังคับที่ว่าง)");
  if (error.code === "23514") return new HttpError(422, "ค่าไม่อยู่ในเงื่อนไขที่กำหนด");
  if (error.code === "PGRST116") return new HttpError(404, "ไม่พบข้อมูล");
  // RLS ปฏิเสธ — ปกติแปลว่า BFF อนุญาตแต่ policy ใน DB ไม่ตรงกัน (role ตกหล่นใน migration)
  if (error.code === "42501") return new HttpError(403, "สิทธิ์ของบัญชีนี้ยังเขียนข้อมูลส่วนนี้ไม่ได้ — แจ้งแอดมิน (RLS ปฏิเสธ)");
  // ตาราง/ฟังก์ชันยังไม่มี = migration ยังไม่รัน
  // ⚠ ต้องเช็คทั้ง 42P01 (Postgres) และ PGRST205/202 (PostgREST — เราคุยกับ DB ผ่านตัวนี้เสมอ)
  //   เช็คแค่ 42P01 ไม่พอ: เคสจริง 0094 ยังไม่รัน แล้วหลุดข้อความดิบ "Could not find the table
  //   'public.cutlists' in the schema cache" ให้ผู้ใช้เห็น (16 ก.ค.2569)
  const hint = migrationHint(error);
  if (hint) return new HttpError(400, hint);

  return new HttpError(400, error.message || "บันทึกไม่สำเร็จ");
}
