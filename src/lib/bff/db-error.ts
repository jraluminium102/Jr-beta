import { HttpError } from "./context";

// แปลง error ของ Supabase/Postgres ให้เป็นข้อความอ่านรู้เรื่อง (แทน "Internal error" 500)
export function dbError(error: { code?: string; message: string }): HttpError {
  if (error.code === "23503") return new HttpError(422, "ข้อมูลอ้างอิงไม่ถูกต้อง (เช่น เซลล์ที่เลือกไม่มีอยู่)");
  if (error.code === "23502") return new HttpError(422, "ข้อมูลไม่ครบ (มีช่องบังคับที่ว่าง)");
  if (error.code === "23514") return new HttpError(422, "ค่าไม่อยู่ในเงื่อนไขที่กำหนด");
  if (error.code === "PGRST116") return new HttpError(404, "ไม่พบข้อมูล");
  return new HttpError(400, error.message || "บันทึกไม่สำเร็จ");
}
