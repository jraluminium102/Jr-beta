"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { loginIdToEmail } from "@/lib/login-id";

export async function login(_prev: unknown, formData: FormData) {
  const email = loginIdToEmail(String(formData.get("email") ?? ""));   // ชื่อผู้ใช้ หรือ อีเมล → อีเมลภายใน
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "กรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน" };

  const supabase = createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "เข้าสู่ระบบไม่สำเร็จ — ตรวจชื่อผู้ใช้/รหัสผ่าน" };

  // ช่างผลิต (CHANG) → ตารางผลิต · สโตร์ (STORE) → เช็คสต๊อก (ทั้งคู่ไม่มีสิทธิ์หน้า dashboard)
  if (auth.user) {
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    const r = (prof as { role?: string } | null)?.role;
    if (r === "CHANG") redirect("/production-schedule");
    if (r === "STORE") redirect("/stock");
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
