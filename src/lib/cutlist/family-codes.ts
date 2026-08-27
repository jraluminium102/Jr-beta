/**
 * cutlist/family-codes — จัดกลุ่ม "สเปกใบตัด" เป็น "ตระกูลรุ่น" (แบบที่คนสโตร์เข้าใจ)
 *   ใช้ในหน้าเช็คสต๊อก: กรองว่าวัสดุตัวนี้ใช้กับบานอะไร (บานเฟี้ยม/บานเลื่อน SMS ฯลฯ)
 *   ครอบทั้ง "อลูมิเนียม" (รหัสโปรไฟล์ B####/F####/box) และ "อุปกรณ์" (JR#####)
 *   ⚠ ที่มาของรหัส = สูตรใบตัดจริง (collectCodesForSpec) → รหัสไหนที่รุ่นนี้ตัดจริง = โชว์
 */
import { CUT_SPECS } from "./products.ts";
import { collectCodesForSpec } from "./codes.ts";

const norm = (s: string) => s.trim().toUpperCase();

// specId → familyKey (รวมหลาย variant ของรุ่นเดียวกันเป็นตระกูลเดียว)
const SPEC_FAMILY: Record<string, string> = {
  sms_slide_free: "sms_slide", sms_slide_center: "sms_slide", sms_slide_tow: "sms_slide",
  fuji_slide: "fuji_slide", fuji_slide_center: "fuji_slide", fuji_slide_multi: "fuji_slide",
  slimlux_slide: "slimlux", toprail_frame: "toprail",
  sms240_bifold: "sms_bifold", euro_bifold: "euro_bifold", euro_bifold_corner: "euro_bifold", euro_lift: "euro_lift",
  fixed_panel: "fixed", fuji_fix: "fuji_fix", fuji_swing: "fuji_swing", fuji_door: "fuji_door", fuji_hung: "fuji_hung",
  velora_swing: "velora", pc_door: "pcdoor", gate_slide: "gate", solid_door: "solid", woodjamb_swing: "woodjamb",
  awning: "awning", awning_l: "awning", awning_multi: "awning",
  gable_straight: "gable", gable_multi: "gable", glasshouse: "glasshouse", glasshouse_multi: "glasshouse",
  louver_panel: "louver",
};

// familyKey → ป้ายไทย (เรียงตามที่อยากโชว์ใน dropdown)
export const FAMILIES: { key: string; label: string }[] = [
  { key: "sms_slide", label: "บานเลื่อน SMS" },
  { key: "fuji_slide", label: "บานเลื่อน FUJI" },
  { key: "slimlux", label: "บานเลื่อน SlimLux" },
  { key: "toprail", label: "บานเลื่อนรางบน (Hafele)" },
  { key: "sms_bifold", label: "บานเฟี้ยม SMS" },
  { key: "euro_bifold", label: "บานเฟี้ยม ยูโร" },
  { key: "euro_lift", label: "บานเฟี้ยมยก" },
  { key: "fixed", label: "บานติดตาย (Fix)" },
  { key: "fuji_fix", label: "FUJI บานติดตาย" },
  { key: "fuji_swing", label: "FUJI บานเปิด/กระทุ้ง" },
  { key: "fuji_door", label: "FUJI ประตูเดี่ยว" },
  { key: "fuji_hung", label: "FUJI บานยก (HUNG)" },
  { key: "velora", label: "Velora บานเปิด" },
  { key: "pcdoor", label: "ประตู PC Door" },
  { key: "gate", label: "ประตูรั้ว (ระแนง)" },
  { key: "solid", label: "บานโซลิด" },
  { key: "woodjamb", label: "บานเปิดครอบวงกบไม้" },
  { key: "awning", label: "กันสาด" },
  { key: "gable", label: "หลังคาจั่ว" },
  { key: "glasshouse", label: "กลาสเฮ้าส์" },
  { key: "louver", label: "บานระแนง" },
];

let _byFamily: Map<string, Set<string>> | null = null;
/** familyKey → เซ็ตรหัส (uppercase) ที่ตระกูลนั้นใช้ (อลู + อุปกรณ์ ทุก variant) */
export function familyCodeSets(): Map<string, Set<string>> {
  if (_byFamily) return _byFamily;
  const m = new Map<string, Set<string>>();
  for (const spec of CUT_SPECS) {
    const fam = SPEC_FAMILY[spec.id];
    if (!fam) continue;
    const set = m.get(fam) ?? new Set<string>();
    for (const c of collectCodesForSpec(spec)) set.add(c);
    m.set(fam, set);
  }
  _byFamily = m;
  return m;
}

/** วัสดุ sku นี้ ใช้กับตระกูลรุ่น family นี้ไหม */
export function skuInFamily(sku: string | null | undefined, family: string): boolean {
  if (!sku || !family) return false;
  return familyCodeSets().get(family)?.has(norm(String(sku))) ?? false;
}

/** วัสดุ sku นี้ ใช้กับตระกูลรุ่นไหนบ้าง (คืน label ไทย) */
export function familyLabelsOfSku(sku?: string | null): string[] {
  if (!sku) return [];
  const key = norm(String(sku));
  return FAMILIES.filter((f) => familyCodeSets().get(f.key)?.has(key)).map((f) => f.label);
}
