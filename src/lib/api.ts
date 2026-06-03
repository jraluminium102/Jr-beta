// Typed BFF client — frontend แตะ Supabase ผ่าน /api/* เท่านั้น
type ApiOk<T> = { success: true; data: T; meta?: Record<string, unknown> };
type ApiErr = { success: false; error: string; details?: unknown };

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
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
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
