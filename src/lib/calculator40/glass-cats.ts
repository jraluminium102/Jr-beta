// glass-cats.ts — จัดหมวดกระจก (พาริตี้ drill-down ของ R3.9) สำหรับ dropdown เลือกง่าย
// จัดจากรูปแบบชื่อ (ไม่แตะราคา) — ใช้ทำ <optgroup> ในตัวเลือกกระจก
export const GLASS_CAT_ORDER = ["ทั่วไป", "เทมเปอร์", "ลามิเนต", "อินซูเลท", "ดัดโค้ง", "อื่นๆ"] as const;
export type GlassCat = (typeof GLASS_CAT_ORDER)[number];

export function glassCat(name: string): GlassCat {
  const n = name || "";
  if (/ลามิเนต/.test(n)) return "ลามิเนต";
  if (/เทมเปอร์/.test(n)) return "เทมเปอร์";
  if (/อินซูเลท/.test(n)) return "อินซูเลท";
  if (/ดัดโค้ง/.test(n)) return "ดัดโค้ง";
  if (/ใส|เขียว|ชา|เงา|ยูโร|reflective|เคลือบ|ลอนแก้ว|เงาทอง|บรอนซ์|เกรย์/i.test(n)) return "ทั่วไป";
  return "อื่นๆ";
}

// จัดคีย์กระจกเป็นกลุ่มตามลำดับหมวด (เว้นหมวดที่ไม่มีของ)
export function groupGlass(keys: string[]): { cat: GlassCat; items: string[] }[] {
  const m: Record<string, string[]> = {};
  for (const k of keys) {
    const c = glassCat(k);
    (m[c] ||= []).push(k);
  }
  return GLASS_CAT_ORDER.filter((c) => m[c] && m[c].length).map((c) => ({ cat: c, items: m[c] }));
}
