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

// ── ต่ออายุ session อัตโนมัติเมื่อโทเคนหมดอายุ (กันหน้าเว็บว่างเพราะ 401) ──
//   ⚠ single-flight: หลายคำขอที่ 401 พร้อมกัน (เช่นหน้าที่ยิงหลาย query) จะรีเฟรช "ครั้งเดียว"
//   ไม่งั้นต่างคนต่างรีเฟรช = โทเคนหมุนชนกันเอง → refresh token พัง → 401 ค้างทั้งเว็บ (บั๊กที่เจอ 24 ก.ค.)
let refreshInFlight: Promise<boolean> | null = null;
async function refreshSessionOnce(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const { data, error } = await createClient().auth.refreshSession();
        return !error && !!data.session;
      } catch { return false; }
      finally { refreshInFlight = null; }
    })();
  }
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...changHeaders() },
    cache: "no-store", // ERP live data — กันเบราว์เซอร์ cache ทำให้คนละเครื่องเห็นข้อมูลไม่ตรง (เช่น ติ๊กงานพื้นแล้วอีกเครื่องไม่ขึ้น)
    ...init,
  });

  // 401 = โทเคนหมดอายุ → ต่ออายุแล้วลองใหม่ 1 ครั้ง (ยกเว้นลิงก์ช่าง = ไม่มี session ล็อกอิน)
  const isChang = typeof window !== "undefined" && window.location.pathname.startsWith("/chang");
  if (res.status === 401 && !retried && typeof window !== "undefined" && !isChang) {
    if (await refreshSessionOnce()) return request<T>(path, init, true);
    // ต่ออายุไม่ได้จริง = ต้องล็อกอินใหม่ (refresh token ตาย) → เด้งไปหน้าล็อกอิน แทนหน้าว่าง ๆ งง ๆ
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new ApiError("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่", 401);
  }

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
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
