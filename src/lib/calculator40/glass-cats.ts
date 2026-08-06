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

/**
 * ตัวเลือก "แทนกระจก" ที่ไม่ได้อยู่ในตารางราคากระจก (pricebook GLASS)
 * engine รู้จักเป็น special-case: ไม่คิดกระจก แต่คิดแผ่น/เกล็ดแทน (ดู isPanelGlass ใน engine.mjs)
 *
 * ⚠ ต้องดึงจากที่นี่ที่เดียว — เดิมเติมมือไว้เฉพาะหน้าหลัก (Calculator40Client)
 *   ทำให้ G6 ห้องกระจก (RoomComposer) ไม่มีให้เลือกเลย (บั๊กที่เจ้าของเจอ 6 ส.ค.69)
 */
export const GLASS_EXTRA = ["แผ่นคอมโพสิต", "แผ่นลูกฟูก", 'เกล็ด Z 1"', 'เกล็ด Z 1.6"'] as const;

/** รายการกระจกทั้งหมดที่ให้เลือกได้ = ตารางราคากระจก + ตัวเลือกแทนกระจก */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allGlassKeys(pb: any): string[] {
  return [...Object.keys((pb?.GLASS ?? {}) as Record<string, number>), ...GLASS_EXTRA];
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
