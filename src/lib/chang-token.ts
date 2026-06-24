import { createServiceClient } from "@/lib/supabase/admin";

// โทเคนลิงก์ช่าง — ใช้ env CHANG_LINK_TOKEN ถ้ามี ไม่งั้นอ่านจาก DB app_config (key=chang_link_token)
// เก็บใน DB ได้ → ตั้งผ่าน SQL ไม่ต้องยุ่ง Vercel env
export async function getChangToken(): Promise<string> {
  const env = process.env.CHANG_LINK_TOKEN;
  if (env && env.length >= 8) return env;
  try {
    const sb = createServiceClient() as unknown as { from: (t: string) => any };
    const { data } = await sb.from("app_config").select("value").eq("key", "chang_link_token").maybeSingle();
    const v = (data?.value as string | undefined) ?? "";
    return v.length >= 8 ? v : "";
  } catch {
    return "";
  }
}
