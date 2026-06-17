// ตัวช่วยสำหรับ Route Handlers (BFF layer)
import { NextResponse } from "next/server";

// เพิ่ม success:true ให้ตรงกับ envelope ที่ api client (src/lib/api.ts) ตรวจ
// (เดิมไม่มี → api.get throw ทันที ทำให้หน้า/ค้นหาที่ใช้ route เก่าไม่ขึ้นข้อมูลเงียบๆ)
// additive: ผู้ที่อ่าน .data ตรงๆ ไม่กระทบ
export const ok = (data: unknown, init?: number) =>
  NextResponse.json({ success: true, data }, { status: init ?? 200 });

export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: message, ...extra }, { status });

export const UNAUTHORIZED = () => fail("ยังไม่ได้เข้าสู่ระบบ", 401);
export const FORBIDDEN = () => fail("ไม่มีสิทธิ์ดำเนินการ (ต้องเป็น Sales/Admin/Owner)", 403);
