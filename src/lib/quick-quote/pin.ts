import { createServiceClient } from "@/lib/supabase/admin";

/**
 * รหัสผ่านหน้าคิดราคาประเมิน (public · เซลล์ใส่ครั้งเดียวจำในเครื่อง)
 * ลำดับ: env QUICK_QUOTE_PIN → app_config key=quote_pin → "" (ยังไม่ตั้ง = ล็อกไว้)
 * ตั้งผ่าน SQL ได้ (migration 0132) ไม่ต้องยุ่ง Vercel env — เจ้าของเปลี่ยนเองได้ทุกเมื่อ
 */
export async function getQuotePin(): Promise<string> {
  const env = process.env.QUICK_QUOTE_PIN;
  if (env && env.length >= 3) return env;
  try {
    const sb = createServiceClient() as unknown as { from: (t: string) => any };
    const { data } = await sb.from("app_config").select("value").eq("key", "quote_pin").maybeSingle();
    const v = (data?.value as string | undefined) ?? "";
    return v.length >= 3 ? v : "";
  } catch {
    return "";
  }
}
