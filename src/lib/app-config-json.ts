/**
 * อ่าน/เขียนก้อน JSON ใน app_config แบบกันบันทึกซ้อน (ฝั่ง server · service client)
 *
 * ใช้กับของที่เก็บทั้งก้อนต่อ key (รายงานภาษีซื้อรายเดือน · สมุดร้านค้า) — อ่าน-แก้-เขียนทั้งก้อน ถ้าไม่กัน:
 *   ใบของอีกคนหายเงียบ หรือคลิกซ้ำแล้วใบเดียวกันถูกเพิ่ม 2 ครั้ง
 * วิธีกัน: เขียนได้ก็ต่อเมื่อ updated_at ยังเป็นตัวที่เราอ่านมา · ไม่ใช่ = 409 ให้ผู้ใช้โหลดใหม่
 */
import { HttpError } from "@/lib/bff/context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sb = { from: (t: string) => any };
export type Loaded = { value: string | null; stamp: string | null };

export async function loadConfig(sb: Sb, key: string): Promise<Loaded> {
  const { data, error } = await sb.from("app_config").select("value, updated_at").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message ?? "อ่านข้อมูลไม่สำเร็จ");
  return { value: data?.value ?? null, stamp: data ? String(data.updated_at) : null };
}

export async function saveConfig(sb: Sb, key: string, value: unknown, prevStamp: string | null): Promise<void> {
  const busy = () => new HttpError(409, "มีการบันทึกซ้อนกันพอดี — โหลดหน้าใหม่แล้วทำอีกครั้ง (รายการล่าสุดยังไม่ได้บันทึก)");
  const row = { value: JSON.stringify(value), updated_at: new Date().toISOString() };
  if (prevStamp == null) {
    const { error } = await sb.from("app_config").insert({ key, ...row });
    if (error) { if (/duplicate|unique|23505/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw busy(); throw new Error(error.message ?? "บันทึกไม่สำเร็จ"); }
    return;
  }
  const { data, error } = await sb.from("app_config").update(row).eq("key", key).eq("updated_at", prevStamp).select("key");
  if (error) throw new Error(error.message ?? "บันทึกไม่สำเร็จ");
  if (!data || data.length === 0) throw busy();
}
