// storage.ts — path ↔ public URL ของ bucket 'drawings' (migration 0117, public=true)
//   DB เก็บ "path สัมพัทธ์" (เช่น "<jobId>/<uuid>/page-1.png") ไม่ใช่ URL เต็ม
//   เหตุผล: ลบไฟล์ตอน DELETE ต้องใช้ path สัมพัทธ์ (storage.remove) · URL เต็มค่อยต่อตอนแสดงผล (client/print)
//   ใช้ได้ทั้งฝั่ง client (browser) และ server (Server Component print) — ต่อ string ตรง ๆ ไม่ต้องสร้าง supabase client

const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

export function drawingPublicUrl(path: string): string {
  if (!path) return "";
  return `${BASE}/storage/v1/object/public/drawings/${path}`;
}
