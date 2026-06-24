"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "กรอกอีเมลและรหัสผ่าน" };

  const supabase = createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "เข้าสู่ระบบไม่สำเร็จ — ตรวจอีเมล/รหัสผ่าน" };

  // ช่างผลิต (CHANG) → เข้าหน้าตารางผลิตเลย (ไม่มีสิทธิ์หน้าอื่น)
  if (auth.user) {
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
    if (prof?.role === "CHANG") redirect("/production-schedule");
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
