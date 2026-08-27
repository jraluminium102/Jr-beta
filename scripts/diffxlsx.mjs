#!/usr/bin/env node
/**
 * diffxlsx — เทียบไฟล์ตัดประกอบ 2 เวอร์ชัน ว่าชีตไหน/ช่องไหนเปลี่ยน
 *   node scripts/diffxlsx.mjs <เก่า.xlsx> <ใหม่.xlsx> [--full]
 *
 * ใช้ตอนสลับโฟลเดอร์ไฟล์ตัด (เจ้าของสั่ง 27 ส.ค.69 "เอาโฟลเดอร์ที่ใหม่ที่สุด")
 * เทียบเฉพาะค่าที่มองเห็น (ข้อความ/ตัวเลข) ไม่สนรูป/ฟอร์แมต
 */
import { openXlsx, sheetList, readSheet } from "./dumpxlsx.mjs";

const [oldF, newF, ...rest] = process.argv.slice(2);
const FULL = rest.includes("--full");
if (!oldF || !newF) { console.error("ใช้: node scripts/diffxlsx.mjs <เก่า.xlsx> <ใหม่.xlsx> [--full]"); process.exit(1); }

const load = (f) => {
  const { zip, ss } = openXlsx(f);
  const out = new Map();
  for (const s of sheetList(zip)) out.set(s.name, readSheet(zip, s.path, ss));
  return out;
};
const A = load(oldF), B = load(newF);

const cell = (rows, r, c) => {
  const v = rows[r]?.[c];
  return v === undefined || v === null ? "" : String(v).trim();
};
const dims = (rows) => {
  let R = rows.length, C = 0;
  for (const r of rows) if (r && r.length > C) C = r.length;
  return [R, C];
};
const colName = (i) => { let s = "", n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

const names = [...new Set([...A.keys(), ...B.keys()])];
let totalChanged = 0;
console.log(`\n📄 ${oldF.split(/[\\/]/).pop()}  →  ${newF.split(/[\\/]/).pop()}`);

for (const n of names) {
  const a = A.get(n), b = B.get(n);
  if (!a) { console.log(`  ➕ ชีตใหม่: "${n}"`); totalChanged++; continue; }
  if (!b) { console.log(`  ➖ ชีตหายไป: "${n}"`); totalChanged++; continue; }
  const [ra, ca] = dims(a), [rb, cb] = dims(b);
  const R = Math.max(ra, rb), C = Math.max(ca, cb);
  const diffs = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const x = cell(a, r, c), y = cell(b, r, c);
      if (x !== y) diffs.push({ at: `${colName(c)}${r + 1}`, from: x, to: y });
    }
  if (!diffs.length) continue;
  totalChanged += diffs.length;
  console.log(`\n  🔸 ชีต "${n}" — เปลี่ยน ${diffs.length} ช่อง${ra !== rb || ca !== cb ? ` (ขนาด ${ra}×${ca} → ${rb}×${cb})` : ""}`);
  const show = FULL ? diffs : diffs.slice(0, 40);
  for (const d of show) console.log(`     ${d.at.padEnd(6)} "${d.from}"  →  "${d.to}"`);
  if (!FULL && diffs.length > show.length) console.log(`     … อีก ${diffs.length - show.length} ช่อง (ใส่ --full เพื่อดูทั้งหมด)`);
}
if (!totalChanged) console.log("  ✅ เนื้อหาเหมือนกันทุกช่อง (ต่างแค่รูป/ฟอร์แมต)");
