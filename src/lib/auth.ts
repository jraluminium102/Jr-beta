// ตัวช่วยฝั่ง server: ดึง user + profile(role) และ guard สิทธิ์
import { createClient } from "./supabase/server";
import type { Profile, UserRole } from "./types";

export async function getProfile(): Promise<Profile | null> {
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
}

// แอพรวม: เขียนเอกสารบัญชีได้ = ADMIN / SALES / ACCOUNTING (map จาก sales/admin/owner เดิม)
const WRITE_ROLES: UserRole[] = ["ADMIN", "SALES", "ACCOUNTING"];

export function canWrite(role: UserRole | undefined | null) {
  return !!role && WRITE_ROLES.includes(role);
}
