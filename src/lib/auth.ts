// ตัวช่วยฝั่ง server: ดึง user + profile(role) และ guard สิทธิ์
import { createClient } from "./supabase/server";
import type { Profile, UserRole } from "./types";

export async function getProfile(): Promise<Profile | null> {
  // กัน 500 ทั้งเว็บเมื่อ env Supabase ยังไม่ถูกตั้ง — ให้ layout redirect ไป /login แทน
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .single();

    if (!data) return { id: user.id, full_name: "", role: "VIEWER" };
    return data as Profile;
  } catch {
    // Supabase ไม่พร้อม/เครือข่ายมีปัญหา → ถือว่ายังไม่ login (ไม่ทำให้ 500)
    return null;
  }
}

// แอพรวม: เขียนเอกสารบัญชีได้ = ADMIN / SALES / ACCOUNTING (map จาก sales/admin/owner เดิม)
const WRITE_ROLES: UserRole[] = ["ADMIN", "SALES", "ACCOUNTING"];

export function canWrite(role: UserRole | undefined | null) {
  return !!role && WRITE_ROLES.includes(role);
}
