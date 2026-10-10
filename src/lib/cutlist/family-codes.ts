/**
 * cutlist/family-codes — จัดกลุ่ม "สเปกใบตัด" เป็น "ตระกูลรุ่น" (แบบที่คนสโตร์เข้าใจ)
 *   ใช้ในหน้าเช็คสต๊อก: กรองว่าวัสดุตัวนี้ใช้กับบานอะไร (บานเฟี้ยม/บานเลื่อน SMS ฯลฯ)
 *   ครอบทั้ง "อลูมิเนียม" (รหัสโปรไฟล์ B####/F####/box) และ "อุปกรณ์" (JR#####)
 *   ⚠ ที่มาของรหัส = สูตรใบตัดจริง (collectCodesForSpec) → รหัสไหนที่รุ่นนี้ตัดจริง = โชว์
 */
import { CUT_SPECS } from "./products.ts";
import { collectCodesForSpec } from "./codes.ts";
import { normBoxName } from "./stock-match.ts";

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

/**
 * ตระกูลที่เป็น "ประเภทบาน" — หมวดพวกนี้เอาแค่โปรไฟล์ประตู (เจ้าของสั่ง 10 ต.ค.69)
 *   ที่เหลือ (กันสาด/หลังคาจั่ว/กลาสเฮ้าส์/บานระแนง/ประตูรั้ว) เป็นงานโครง
 *   วัสดุของมันคือกล่อง/ฉากจริง ๆ จึงต้องเก็บไว้ ไม่งั้นหมวดกลายเป็น 0 รายการ
 */
const DOOR_FAMILIES = new Set([
  "sms_slide", "fuji_slide", "slimlux", "toprail", "sms_bifold", "euro_bifold", "euro_lift",
  "fuji_fix", "fuji_swing", "fuji_door", "fuji_hung", "velora", "pcdoor", "solid", "woodjamb",
]);
// ⚠ "บานติดตาย (Fix)" ไม่อยู่ในลิสต์ — สเปกนี้ทำจากกล่อง/ฉากล้วน (ตัวเลือกเดียวคือ "ชนิดกล่อง")
//   ถ้าใส่ไว้จะเหลือ 2-4 รหัสที่เป็นอลูเสริมอยู่ดี · ตัวที่เป็นโปรไฟล์ประตูจริงคือ "FUJI บานติดตาย" (fuji_fix)

let _byFamily: Map<string, Set<string>> | null = null;
let _boxByFamily: Map<string, Set<string>> | null = null;
/**
 * familyKey → เซ็ตรหัสที่ตระกูลนั้นใช้ (อุปกรณ์ JR + โปรไฟล์ประตู ทุก variant)
 * ⚠ 10 ต.ค.69 เจ้าของสั่ง: หมวดตามประเภทบาน ให้เอาแค่โปรไฟล์ประตู ไม่เอาอลูเสริม
 *   (กล่อง/ฉาก/แซด/ลูกฟูก/เส้นกลาง/ตบร่อง… ใช้ได้ทุกรุ่น ติดป้าย "รุ่นนี้ใช้" ไม่ได้)
 *   เดิมรวมมาด้วย → บานติดตายโชว์ ตบร่อง/กล่องเปิด · บานโซลิดโชว์ ลูกฟูก/เส้นกลาง
 *   · วงกบไม้โชว์ กล่องเรียบ/บังใบกล่อง · SlimLux/รางบน/PC Door โชว์กล่องหลายไซส์
 */
export function familyCodeSets(): Map<string, Set<string>> {
  if (_byFamily) return _byFamily;
  const m = new Map<string, Set<string>>();
  for (const spec of CUT_SPECS) {
    const fam = SPEC_FAMILY[spec.id];
    if (!fam) continue;
    const set = m.get(fam) ?? new Set<string>();
    for (const c of collectCodesForSpec(spec, { doorOnly: DOOR_FAMILIES.has(fam) })) set.add(c);
    m.set(fam, set);
  }
  _byFamily = m;
  // คีย์ชื่อกล่อง/ฉาก (งานโครง) — สูตรเขียนเป็นชื่อ ไม่ใช่รหัส JR ของสโตร์
  //   ต้องเทียบด้วย normBoxName ทั้งสองฝั่ง ไม่งั้นหมวดกันสาด/หลังคา/กลาสเฮ้าส์ โชว์ 0 รายการ
  _boxByFamily = new Map([...m].map(([k, v]) => [k, new Set([...v].map(normBoxName).filter(Boolean))]));
  return m;
}

/**
 * วัสดุแถวนี้ ใช้กับตระกูลรุ่น family นี้ไหม
 *   เทียบ sku ตรง ๆ ก่อน · แล้วลอง "รหัสที่ซ่อนหน้าชื่อ" (สโตร์ใส่ sku เป็น JR0xxxx
 *   แต่รหัสจริงอยู่หน้าชื่อ เช่น "B24013-คิ้วตบกระจก…") — เจ้าของทัก 10 ต.ค.69
 */
export function skuInFamily(sku: string | null | undefined, family: string, name?: string | null): boolean {
  if (!family) return false;
  const set = familyCodeSets().get(family);
  if (!set) return false;
  if (sku && set.has(norm(String(sku)))) return true;
  const head = String(name ?? "").trim().match(/^([A-Za-z]{1,3}\d{3,5}[A-Za-z]?)\b/);
  if (head && set.has(norm(head[1]))) return true;
  // งานโครง: สูตรเขียนเป็น "ชื่อกล่อง/ฉาก" ส่วนสโตร์เป็นรหัส JR → เทียบด้วยชื่อที่ปัดรูปแบบแล้ว
  const nb = normBoxName(name);
  return !!(nb && _boxByFamily?.get(family)?.has(nb));
}

/** วัสดุแถวนี้ ใช้กับตระกูลรุ่นไหนบ้าง (คืน label ไทย) */
export function familyLabelsOfSku(sku?: string | null, name?: string | null): string[] {
  return FAMILIES.filter((f) => skuInFamily(sku, f.key, name)).map((f) => f.label);
}

/** อลูเสริม (กล่อง/ฉาก/ลูกฟูก…) — ใช้ได้ทุกรุ่น จึงไม่อยู่ในหมวดตามประเภทบาน */
export { isAuxAluName } from "./codes.ts";
