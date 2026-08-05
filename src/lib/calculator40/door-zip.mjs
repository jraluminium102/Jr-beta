/**
 * ม่านซิปประตู (G7 ม่านซิป Z100/Z120) — ออปชั่นของบานประตู/หน้าต่างในห้องกระจก (G6)
 *
 * ราคาคิดจากรุ่น G7 ม่านซิปจริง (PRODUCTS.zipscreen · series Z100/Z120 — ไม่ใช่ Skylight)
 * ผ่าน computeCost — ไม่ทำสูตร/ก๊อปเรตซ้ำ (single source กับม่านซิปเดี่ยว/ม่านซิปหลังคา)
 *
 * pattern เดียวกับ roof-zip.mjs/mosquito.mjs: app เรียก computeDoorZipR4() → ส่งผลเข้า opt.doorZipR4
 * → engine addon 'door_zip' แค่อ่านค่ามาโชว์/บวกยอด (ไม่แตะ anchor · verify-r40 ไม่เห็น)
 */
import { PRODUCTS } from "./products.mjs";
import { computeCost } from "./engine.mjs";

// ผ้าที่รุ่น Z100/Z120 รองรับจริง (fab table มี 5/10/30 ครบทั้งคู่)
export const DOOR_ZIP_FABRICS = [
  ["5", "F05 5% (ขายดี)"],
  ["10", "F10 10%"],
  ["30", "F30 30%"],
];

/**
 * คิดราคาม่านซิปประตู จากค่าที่ผู้ใช้เลือกในของเสริมของบาน
 * @param addons  ของเสริมของบาน — ใช้ door_zip('none'|'z100'|'z120') · dzFab · dzNoRemote
 * @param dims    { wCm, hCm } = ขนาดบานประตู (ซม.) → ใช้เป็นขนาดม่าน
 * @param pb      pricebook (overlay ราคาสด)
 * @param profitPct กำไร% (ม่านซิปเป็น sell-based mult ในตัว · ส่งไปเพื่อความสอดคล้อง)
 * @returns { label, amount, cost } (amount = ขาย, cost = ทุนจริงจาก zip) หรือ null ถ้าไม่เลือก
 */
export function computeDoorZipR4(addons, dims, pb, profitPct) {
  const sel = addons && addons.door_zip;
  if (!sel || sel === "none") return null;
  const zprod = PRODUCTS.zipscreen;
  if (!zprod) return null;

  const is120 = sel === "z120";
  const form = is120 ? "Z120" : "Z100";
  const fab = ["5", "10", "30"].includes(addons.dzFab) ? addons.dzFab : "5";

  const opt = {
    w: dims.wCm,
    h: dims.hCm,
    p: 1,
    form,
    material: fab,
    color: "white",
    profitPct: profitPct || 100,
    installProfitPct: profitPct || 100,
    addons: {},
  };
  if (addons.dzNoRemote === "yes") opt.noRemote = true; // ไม่เอารีโมทในชุด (engine sellZip อ่าน opt.noRemote)

  const r = computeCost(pb, zprod, opt);
  if (!r || !r.sell || !(r.sell.withInstall > 0)) return null;

  return {
    label: "ม่านซิปประตู (" + (is120 ? "Z120" : "Z100") + " · ผ้า F" + (fab.length === 1 ? "0" + fab : fab) + ")",
    amount: r.sell.withInstall,
    cost: r.cost ? r.cost.total : undefined,
  };
}
