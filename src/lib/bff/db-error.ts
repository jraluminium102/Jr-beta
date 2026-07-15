import { HttpError } from "./context";

// แปลง error ของ Supabase/Postgres ให้เป็นข้อความอ่านรู้เรื่อง (แทน "Internal error" 500)
export function dbError(error: { code?: string; message: string }): HttpError {
  if (error.code === "23503") return new HttpError(422, "ข้อมูลอ้างอิงไม่ถูกต้อง (เช่น เซลล์ที่เลือกไม่มีอยู่)");
  if (error.code === "23502") return new HttpError(422, "ข้อมูลไม่ครบ (มีช่องบังคับที่ว่าง)");
  if (error.code === "23514") return new HttpError(422, "ค่าไม่อยู่ในเงื่อนไขที่กำหนด");
  if (error.code === "PGRST116") return new HttpError(404, "ไม่พบข้อมูล");
  // RLS ปฏิเสธ — ปกติแปลว่า BFF อนุญาตแต่ policy ใน DB ไม่ตรงกัน (role ตกหล่นใน migration)
  if (error.code === "42501") return new HttpError(403, "สิทธิ์ของบัญชีนี้ยังเขียนข้อมูลส่วนนี้ไม่ได้ — แจ้งแอดมิน (RLS ปฏิเสธ)");
  // ตาราง/relation หายไป — migration ยังไม่รัน
  if (error.code === "42P01") return new HttpError(400, "ตารางข้อมูลยังไม่ถูกสร้าง — ต้องรัน migration ล่าสุดก่อนใช้งานส่วนนี้");
  return new HttpError(400, error.message || "บันทึกไม่สำเร็จ");
}
