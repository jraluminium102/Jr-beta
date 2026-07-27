// Typed BFF client — frontend แตะ Supabase ผ่าน /api/* เท่านั้น
type ApiOk<T> = { success: true; data: T; meta?: Record<string, unknown> };
type ApiErr = { success: false; error: string; details?: unknown };

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message); }
}

/**
 * ถ้าหน้าที่เปิดอยู่คือ "ลิงก์ช่าง" (/chang/<token>/...) → แนบโทเคนไปกับทุกคำขออัตโนมัติ
 *
 * ทำแบบนี้เพื่อให้ "หน้าเว็บตัวเดียวกัน" ใช้ได้ทั้งคนล็อกอินและช่างผ่านลิงก์ โดยไม่ต้องแก้โค้ดหน้า
 * (ที่มา: เลย์เอาท์ลิงก์ช่างเคยหลุดจากเว็บหลัก เพราะเป็นหน้า/API คนละตัว — ดู src/lib/bff/chang-ctx.ts)
 *
 * ⚠ ชื่อช่างเป็นไทย → ต้อง encodeURIComponent ก่อนใส่ header
 *   (HTTP header รับแค่ ISO-8859-1 · ใส่ไทยดิบ ๆ fetch จะ throw ทั้งคำขอ)
 */
function changHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const m = window.location.pathname.match(/^\/chang\/([^/]+)/);
  if (!m) return {};
  let who = "";
  try { who = localStorage.getItem("chang_name") || ""; } catch { /* ignore */ }
  return { "x-chang-token": m[1], "x-chang-name": encodeURIComponent(who) };
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...changHeaders() },
    cache: "no-store", // ERP live data — กันเบราว์เซอร์ cache ทำให้คนละเครื่องเห็นข้อมูลไม่ตรง (เช่น ติ๊กงานพื้นแล้วอีกเครื่องไม่ขึ้น)
    ...init,
  });
  const json = (await res.json()) as ApiOk<T> | ApiErr;
  if (!res.ok || !json.success) {
    const e = json as ApiErr;
    throw new ApiError(e.error ?? "เกิดข้อผิดพลาด", res.status, e.details);
  }
  return { data: json.data, meta: json.meta };
}

export const api = {
  get: <T>(path: string) => request<T>(path).then((r) => r),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
