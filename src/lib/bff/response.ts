import { NextResponse } from "next/server";

export type ApiOk<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiErr = { success: false; error: string; details?: unknown };

export const ok = <T>(data: T, meta?: Record<string, unknown>, status = 200) =>
  NextResponse.json<ApiOk<T>>({ success: true, data, ...(meta ? { meta } : {}) }, { status });

export const created = <T>(data: T) => ok(data, undefined, 201);

export const err = (error: string, status = 400, details?: unknown) =>
  NextResponse.json<ApiErr>({ success: false, error, ...(details ? { details } : {}) }, { status });

export const unauthorized = () => err("Unauthorized", 401);
export const forbidden = () => err("Forbidden — บทบาทนี้ไม่มีสิทธิ์", 403);
export const notFound = (what = "ไม่พบข้อมูล") => err(what, 404);
