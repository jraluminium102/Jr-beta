// ชื่อผู้ใช้ล็อกอินแบบไม่ต้องมีอีเมลจริง — ระบบใช้ "ชื่อผู้ใช้@jr.local" เป็นอีเมลภายในของ Supabase Auth
//   พนักงาน (เช่น สโตร์) ล็อกอินด้วย "ชื่อผู้ใช้ + รหัส" · ยังรองรับอีเมลจริงเดิม (ถ้าพิมพ์มี @)
export const LOGIN_DOMAIN = "jr.local";

// ชื่อผู้ใช้ที่ใช้ได้ = a-z 0-9 . _ - (ตัวพิมพ์เล็ก) — ไว้ประกอบอีเมลภายใน
export function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return u ? `${u}@${LOGIN_DOMAIN}` : "";
}

// อินพุตช่องล็อกอิน → อีเมลจริงที่ส่งเข้า Supabase · มี @ = อีเมลจริง · ไม่มี = ชื่อผู้ใช้ (เติมโดเมนภายใน)
export function loginIdToEmail(input: string): string {
  const s = input.trim();
  if (!s) return "";
  return s.includes("@") ? s.toLowerCase() : usernameToEmail(s);
}
