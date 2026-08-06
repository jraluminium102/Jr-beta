/**
 * ตรวจ "ตัวเลือกครบเท่ากันทุกหน้า" ของคิดราคา 4.0
 *   node scripts/verify-options-parity.mjs
 *
 * ที่มา (เจ้าของเจอ 6 ส.ค.69): ในห้องกระจก G6 ไม่มีตัวเลือก "แผ่นลูกฟูก/คอมโพสิต แทนกระจก"
 * ให้เลือก ทั้งที่หน้าหลักมี — เพราะแต่ละหน้า "ประกอบรายการตัวเลือกเอง" แล้วลืมอัปเดตให้ตรงกัน
 *
 * ด่านนี้กันไม่ให้กลับไปเป็นแบบนั้นอีก: บังคับว่าทุกหน้าต้องดึงจาก "ตัวกลาง" เท่านั้น
 *   · รายการกระจก      → allGlassKeys()      (glass-cats.ts)
 *   · ออปชั่น universal → withUniversalAddons() (universal-addons.ts)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GLASS_EXTRA, allGlassKeys, groupGlass } from "../src/lib/calculator40/glass-cats.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let failed = 0;
const bad = (m) => { failed++; console.log("  ❌ " + m); };
const ok = (m) => console.log("  ✅ " + m);

// ── ① ตัวเลือกแทนกระจก ต้องอยู่ในรายการที่ทุกหน้าใช้ ──
console.log("═══ ① ตัวเลือก “แทนกระจก” (คอมโพสิต/ลูกฟูก/เกล็ด Z) ═══");
{
  const PB = JSON.parse(read("src/lib/calculator40/pricebook.json"));
  const keys = allGlassKeys(PB);
  for (const k of GLASS_EXTRA) {
    if (keys.includes(k)) ok(`มี "${k}" ในรายการกลาง`);
    else bad(`ไม่มี "${k}" ในรายการกลาง`);
  }
  // ต้องโผล่ใน dropdown จริง (หมวด "อื่นๆ")
  const other = groupGlass(keys).find((g) => g.cat === "อื่นๆ");
  const missing = GLASS_EXTRA.filter((k) => !other?.items.includes(k));
  if (!missing.length) ok(`ทั้ง ${GLASS_EXTRA.length} ตัวโผล่ในหมวด “อื่นๆ” ของ dropdown`);
  else bad(`ไม่โผล่ใน dropdown: ${missing.join(", ")}`);
  if (keys.length > GLASS_EXTRA.length) ok(`รวมกระจกทั้งหมด ${keys.length} รายการ`);
  else bad("รายการกระจกน้อยผิดปกติ (อ่าน pricebook ไม่ติด?)");
}

// ── ② ทุกหน้าต้องดึงจากตัวกลาง ไม่ประกอบรายการเอง ──
console.log("\n═══ ② ทุกหน้าต้องใช้ตัวกลาง (ไม่ hardcode รายการเอง) ═══");
{
  const UI = [
    ["src/components/Calculator40Client.tsx", "หน้าหลัก"],
    ["src/components/calculator40/RoomComposer.tsx", "G6 ห้องกระจก"],
  ];
  for (const [file, label] of UI) {
    const src = read(file);

    // ห้ามพิมพ์ชื่อตัวเลือกแทนกระจกใส่ array เอง (ยกเว้นข้อความอธิบาย/คอมเมนต์)
    const hardcoded = GLASS_EXTRA.filter((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/"/g, '\\\\?"');
      return new RegExp(`\\[[^\\]]*${esc}`, "s").test(src);
    });
    if (!hardcoded.length) ok(`${label} — ไม่ hardcode รายการกระจก`);
    else bad(`${label} — ยัง hardcode: ${hardcoded.join(", ")}`);

    // ทุกจุดที่ทำ dropdown กระจก ต้องได้รายการมาจาก allGlassKeys() เท่านั้น
    //   ห้าม: groupGlass(Object.keys(pb.GLASS…))  หรือ  const glassKeys = Object.keys(pb.GLASS…)
    //   (ตรงนี้คือรูปร่างของบั๊กจริง — ถ้าเช็คหลวมกว่านี้จะจับไม่ได้)
    const glassSelects = (src.match(/groupGlass\(/g) || []).length;
    const inlineRaw = (src.match(/groupGlass\(\s*Object\.keys/g) || []).length;
    const localList = (src.match(/(?:const|let)\s+glass\w*\s*=\s*(?:useMemo\(\s*\(\)\s*=>\s*)?\[?\s*(?:\.\.\.)?Object\.keys\s*\(\s*\(?\s*pb/g) || []).length;
    if (inlineRaw || localList) {
      bad(`${label} — ยังสร้างรายการกระจกเองจาก pb.GLASS (${inlineRaw} จุดใน groupGlass · ${localList} จุดเป็นตัวแปร) ต้องใช้ allGlassKeys()`);
    } else if (glassSelects === 0) {
      ok(`${label} — ไม่มี dropdown กระจก`);
    } else {
      ok(`${label} — dropdown กระจก ${glassSelects} จุด ได้รายการจาก allGlassKeys() ทั้งหมด`);
    }

    // ห้ามประกอบ addons universal เอง
    if (/addons:\s*\[\s*\.\.\.[^\]]*"(elec|solid_panel|roof_zip|door_zip)"/.test(src)) {
      bad(`${label} — ยังต่อ addons universal เอง (ต้องใช้ withUniversalAddons)`);
    } else ok(`${label} — ไม่ต่อ addons universal เอง`);
  }
}

// ── ③ ออปชั่น universal ต้องเท่ากันทั้ง 2 หน้า ──
console.log("\n═══ ③ ออปชั่น universal ต่อรุ่น (หน้าหลัก ↔ G6) ═══");
{
  const { PRODUCTS } = await import("../src/lib/calculator40/products.mjs");
  const { withUniversalAddons } = await import("../src/lib/calculator40/universal-addons.ts");

  const g1 = Object.values(PRODUCTS).filter((p) => p && p.group === 1 && !p.pickerHide);
  let diff = 0;
  for (const p of g1) {
    const main = new Set(withUniversalAddons(p).addons || []);
    const room = new Set(withUniversalAddons(p, { doorZip: true }).addons || []);
    // G6 ต้องมีทุกอย่างที่หน้าหลักมี (+ door_zip ที่มีเฉพาะ G6)
    const lost = [...main].filter((a) => !room.has(a));
    if (lost.length) { bad(`${p.name}: G6 ขาด ${lost.join(", ")}`); diff++; }
    if (!room.has("door_zip")) { bad(`${p.name}: G6 ไม่มี door_zip`); diff++; }
  }
  if (!diff) ok(`บาน G1 ทั้ง ${g1.length} รุ่น — G6 ได้ออปชั่นครบเท่าหน้าหลัก + door_zip`);

  // รุ่นหลังคาต้องได้ roof_zip ทั้ง 2 ทาง
  for (const id of ["roof", "roof_gable", "roof_slide"]) {
    const p = PRODUCTS[id];
    if (!p) continue;
    const has = (withUniversalAddons(p).addons || []).includes("roof_zip");
    has ? ok(`${p.name} — มี roof_zip`) : bad(`${p.name} — ไม่มี roof_zip`);
  }

  // ม่านซิป (sellZip) ต้องไม่ได้ elec/solid_panel (เจ้าของสั่ง 29 ก.ค.69)
  const zip = Object.values(PRODUCTS).filter((p) => p?.sellZip);
  const leaked = zip.filter((p) => (withUniversalAddons(p).addons || []).some((a) => a === "elec" || a === "solid_panel"));
  if (!leaked.length) ok(`ม่านซิป ${zip.length} รุ่น — ไม่มี “ออปชั่นใช้บ่อย” ปนมา (ตามที่สั่ง)`);
  else bad(`ม่านซิปมีออปชั่นปน: ${leaked.map((p) => p.name).join(", ")}`);
}

console.log(`\n═══ สรุป: ${failed === 0 ? "✅ ผ่านทั้งหมด" : `❌ ไม่ผ่าน ${failed} ข้อ`} ═══`);
process.exit(failed === 0 ? 0 : 1);
