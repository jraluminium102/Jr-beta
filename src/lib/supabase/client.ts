"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Browser client — ใช้เฉพาะ auth flow (signInWithOAuth / signOut).
// data ทั้งหมดวิ่งผ่าน BFF (/api/*) ไม่ query Supabase ตรงจาก client
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
