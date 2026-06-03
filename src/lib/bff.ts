// ตัวช่วยสำหรับ Route Handlers (BFF layer)
import { NextResponse } from "next/server";

export const ok = (data: unknown, init?: number) =>
  NextResponse.json({ data }, { status: init ?? 200 });

export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: message, ...extra }, { status });

export const UNAUTHORIZED = () => fail("ยังไม่ได้เข้าสู่ระบบ", 401);
export const FORBIDDEN = () => fail("ไม่มีสิทธิ์ดำเนินการ (ต้องเป็น Sales/Admin/Owner)", 403);
