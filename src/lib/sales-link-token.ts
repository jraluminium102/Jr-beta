import { createServiceClient } from "@/lib/supabase/admin";

// โทเคนลิงก์คิวประเมินของเซลล์ (/sales-queue/<token>) — env SALES_LINK_TOKEN ถ้ามี ไม่งั้นอ่าน app_config (0165)
//   แยกจากโทเคนลิงก์ช่าง → เปลี่ยน/ยกเลิกลิงก์เซลล์ได้โดยไม่กระทบช่าง
export async function getSalesToken(): Promise<string> {
  const env = process.env.SALES_LINK_TOKEN;
  if (env && env.length >= 8) return env;
  try {
    const sb = createServiceClient() as unknown as { from: (t: string) => any };
    const { data } = await sb.from("app_config").select("value").eq("key", "sales_link_token").maybeSingle();
    const v = (data?.value as string | undefined) ?? "";
    return v.length >= 8 ? v : "";
  } catch {
    return "";
  }
}
