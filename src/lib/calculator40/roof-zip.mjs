/**
 * ม่านซิปบนหลังคา (Skylight) — งานหลังคา (G3) + งานกลาสเฮ้า (G6)
 *
 * ราคาคิดจากรุ่น G7 ม่านซิปจริง (PRODUCTS.zipscreen · series Skylight 100/120)
 * ผ่าน computeCost — ไม่ทำสูตร/ก๊อปเรตซ้ำ (single source กับม่านซิปเดี่ยว)
 *
 * pattern เดียวกับ mosquito.mjs: app เรียก computeRoofZipR4() → ส่งผลเข้า opt.roofZipR4
 * → engine addon 'roof_zip' แค่อ่านค่ามาโชว์/บวกยอด (ไม่แตะ anchor · verify-r40 ไม่เห็น)
 */
import { PRODUCTS } from "./products.mjs";
import { computeCost } from "./engine.mjs";

// รุ่นหลังคาที่ให้เพิ่มม่านซิปได้ (ทรงจริงใน products.mjs · ใช้ทั้ง G3 และ G6)
export const ROOF_ZIP_PROD_IDS = ["roof", "roof_gable", "roof_slide"];
export function isRoofZipProd(prodOrId) {
  const id = typeof prodOrId === "string" ? prodOrId : prodOrId && prodOrId.id;
  return ROOF_ZIP_PROD_IDS.includes(id);
}

// ผ้าที่รุ่น Skylight (Z100S/Z120S) รองรับจริง — fab table มีแค่ 5/10/30
export const ROOF_ZIP_FABRICS = [
  ["5", "F05 5% (ขายดี)"],
  ["10", "F10 10%"],
  ["30", "F30 30%"],
];

/**
 * คิดราคาม่านซิปบนหลังคา จากค่าที่ผู้ใช้เลือกในของเสริม
 * @param addons  ของเสริมของรุ่นหลังคา — ใช้ roof_zip('none'|'sky100'|'sky120') · rzFab · rzNoRemote
 * @param dims    { wCm, hCm } = ขนาดหลังคา (ซม.) → ใช้เป็นขนาดม่าน
 * @param pb      pricebook (overlay ราคาสด)
 * @param profitPct กำไร% (ม่านซิปเป็น sell-based mult ในตัว · ส่งไปเพื่อความสอดคล้อง)
 * @returns { label, amount, cost } (amount = ขาย, cost = ทุนจริงจาก zip) หรือ null ถ้าไม่เลือก
 */
export function computeRoofZipR4(addons, dims, pb, profitPct) {
  const sel = addons && addons.roof_zip;
  if (!sel || sel === "none") return null;
  const zprod = PRODUCTS.zipscreen;
  if (!zprod) return null;

  const is120 = sel === "sky120";
  const form = is120 ? "Skylight 120" : "Skylight 100";
  const fab = ["5", "10", "30"].includes(addons.rzFab) ? addons.rzFab : "5";

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
  if (addons.rzNoRemote === "yes") opt.noRemote = true; // ไม่เอารีโมทในชุด (engine sellZip อ่าน opt.noRemote)

  const r = computeCost(pb, zprod, opt);
  if (!r || !r.sell || !(r.sell.withInstall > 0)) return null;

  return {
    label: "ม่านซิปบนหลังคา (Skylight " + (is120 ? "120" : "100") + " · ผ้า F" + (fab.length === 1 ? "0" + fab : fab) + ")",
    amount: r.sell.withInstall,
    cost: r.cost ? r.cost.total : undefined,
  };
}
