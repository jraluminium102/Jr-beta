import { isRoofZipProd } from "./roof-zip.mjs";

/**
 * ออปชั่นที่ให้ "ทุกรุ่น" เลือกได้ — augment ที่ชั้น app เท่านั้น
 *
 * ⚠ ห้ามไปเติมใน products.mjs — verify-r40 เทียบค่าจากชีต xlsx ต้นฉบับ ถ้าแก้ products
 *   ค่า anchor จะเพี้ยนหมด · ตรงนี้แค่ "เพิ่มให้เลือก" ไม่เลือก = ราคาไม่ขยับ (computeAddon คืน null)
 *
 * ⭐ ต้องเรียกจากที่นี่ที่เดียว — เดิม Calculator40Client เติม elec/solid_panel
 *    แต่ RoomComposer (G6 ห้องกระจก) เติมแค่ door_zip → บานใน G6 ไม่มีออปชั่นพวกนี้ให้เลือกเลย
 *    (บั๊กแบบเดียวกับตัวเลือกกระจกที่เจ้าของเจอ 6 ส.ค.69)
 *
 * ที่มาของกฎ:
 *   · elec (งานไฟ) + solid_panel (บานล่างทึบ) → ทุกงาน (เจ้าของสั่ง 17 ก.ค.69)
 *     ยกเว้นม่านซิป (sellZip) — ไม่เกี่ยวกับตัวม่าน (เจ้าของสั่ง 29 ก.ค.69)
 *   · roof_zip (ม่านซิปบนหลังคา) → เฉพาะรุ่นหลังคา
 *   · door_zip (ม่านซิปประตู) → เฉพาะบานในห้องกระจก (G6) เท่านั้น
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withUniversalAddons<T extends Record<string, any>>(prod: T, opts?: { doorZip?: boolean }): T {
  if (!prod) return prod;
  const base: string[] = prod.addons || [];
  const extra = [
    ...(prod.sellZip ? [] : ["elec", "solid_panel"]),
    ...(isRoofZipProd(prod) ? ["roof_zip"] : []),
    ...(opts?.doorZip ? ["door_zip"] : []),
  ].filter((u) => !base.includes(u));
  return extra.length ? ({ ...prod, addons: [...base, ...extra] } as T) : prod;
}
