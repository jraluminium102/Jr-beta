import { createServiceClient } from "@/lib/supabase/admin";

/**
 * วันตัดบิล / วันตัดเอกสารทดสอบ (17 ก.ค.69 · เจ้าของสั่งตอน cutover)
 *
 * เอกสาร (ใบเสนอ/ใบวางบิล/ใบเสร็จ) ที่ "ออกก่อนวันตัด" = เอกสารช่วงทดสอบ → ซ่อนจากลิสต์จริงโดยดีฟอลต์
 * เก็บวันตัดใน app_config (key=doc_test_cutoff · service role อ่าน/เขียน · ตั้งครั้งเดียวตอน go-live)
 * ไม่ต้อง backfill ต่อแถว — ยึด "วันที่ในเอกสาร < วันตัด" = ทดสอบ (เปลี่ยนวันตัดแล้วเห็นผลทันที)
 *
 * cache ระดับ process (60 วิ) — ค่านี้เปลี่ยนน้อยมาก + list ทุกหน้าถามบ่อย
 */
const CONFIG_KEY = "doc_test_cutoff";
let cache: { at: number; value: string } | null = null;
const TTL_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/** วันตัด (YYYY-MM-DD) หรือ "" ถ้ายังไม่ตั้ง — เอกสารก่อนวันนี้ = ทดสอบ */
export async function getDocCutoff(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const sb = createServiceClient() as unknown as Sb;
    const { data } = await sb.from("app_config").select("value").eq("key", CONFIG_KEY).maybeSingle();
    const v = String((data?.value as string | undefined) ?? "").trim();
    const value = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return "";
  }
}

/** ตั้งวันตัด (ADMIN) — "" = ล้าง (โชว์ทุกเอกสาร) */
export async function setDocCutoff(date: string): Promise<void> {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  const sb = createServiceClient() as unknown as Sb;
  await sb.from("app_config").upsert({ key: CONFIG_KEY, value: v, updated_at: new Date().toISOString() }, { onConflict: "key" });
  cache = { at: Date.now(), value: v };
}
