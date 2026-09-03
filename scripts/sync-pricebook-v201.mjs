/**
 * sync-pricebook-v201 — เทียบ "ตารางราคากลาง" ในเว็บ (pricebook.json) กับไฟล์ถอดทุนล่าสุด
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของสั่ง 3 ก.ย.69: "เอาทุกอย่างอ้างอิงตามไฟล์ล่าสุด อะไรที่ไฟล์ล่าสุดไม่มีก็ไม่ต้องมี
 *                        อย่าให้ข้อมูลเก่าใหม่ตีกัน"
 *
 * ค่าตั้งต้น = รายงานอย่างเดียว (dry-run) · ใส่ --write ถึงจะเขียนทับ pricebook.json
 *   node scripts/sync-pricebook-v201.mjs            → ดูว่าต่างตรงไหน
 *   node scripts/sync-pricebook-v201.mjs --write    → อัปเดตตามไฟล์
 *
 * ⚠ ตัวที่ "ไฟล์ไม่มีแล้ว" จะถูกลบออกจากตารางราคา — ใบเสนอเก่าที่อ้างชื่อนั้น
 *   จะไม่หายเงียบ ๆ เพราะ engine ขึ้นเตือน "ไม่มีในไฟล์ถอดทุนล่าสุด" ให้เลือกใหม่
 */
import fs from "node:fs";
import path from "node:path";
import { openXlsx } from "./dumpxlsx.mjs";

const XLSX = "ถอดทุน_รวมทั้งหมด v20.1.xlsx";
const PB_PATH = "src/lib/calculator40/pricebook.json";
const WRITE = process.argv.includes("--write");
// ค่าแรงแยกสวิตช์ต่างหาก (--labor) — เปลี่ยนแล้ว "ราคาขาย" ขยับทุกรุ่น ±25% ต้องให้เจ้าของเคาะก่อน
//   ตารางค่าแรงในเว็บยังเป็นของไฟล์ ถอดทุน_รวมทั้งหมด.xlsx (ตัวแรก) · v20 ขึ้นไปรื้อชั่วโมง+ใส่ตัวคูณใหม่
const WRITE_LABOR = WRITE && process.argv.includes("--labor");

const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

/** ตารางที่เทียบได้ตรง ๆ (ชื่อ → ราคา) : ชีต, คอลัมน์ชื่อ, คอลัมน์ราคา, แถวเริ่ม-จบ */
const TABLES = [
  { pb: "GLASS", sheet: "ราคากระจก", name: "A", price: "B", from: 3, to: 112, label: "ราคากระจก (ทุน/ตร.ม.)" },
];

/**
 * ตารางค่าแรง (ชีต "ค่าแรง") — 4 ตัวเลขต่อแถว: ฐานผลิต · ผลิต/ตร.ม. · ฐานติดตั้ง · ติดตั้ง/ตร.ม.
 *   ตรวจสูตรกับตัวอย่างในชีตเองแล้ว: Velora 15.4 ตร.ม. → ผลิต 700 + 43.75×15.4 = 1,373.75 ✓ (ตรงเซลล์ B5)
 *
 * ⚠ อัปเดตเฉพาะคีย์ที่ "มีอยู่แล้วทั้งสองฝั่ง" + เพิ่มคีย์ใหม่จากไฟล์
 *   คีย์ในเว็บที่ไฟล์ไม่มี = กลไกของเว็บ ไม่ใช่เรตในไฟล์ (เหมารวม / "(ในวัสดุ)" = ค่าแรงรวมในราคาวัสดุแล้ว)
 *   ห้ามย้าย laborKey ของรุ่นไปชี้แถวใหม่เอง — จะกลายเป็นคิดค่าแรงซ้ำ (เช่น Shower/ราวกันตก/Futuretech)
 */
const LABOR = { sheet: "ค่าแรง", from: 12, to: 60, cols: { pBase: "B", pRate: "C", iBase: "D", iRate: "E" } };

const X = openXlsx(XLSX);
const sheetPath = (name) => {
  const hit = X.sheets.find((s) => s.name === name);
  if (!hit) throw new Error(`ไม่เจอชีต "${name}" ในไฟล์ ${XLSX}`);
  return hit.path;
};

const pb = JSON.parse(fs.readFileSync(PB_PATH, 'utf8'));
let anyDiff = false;

for (const t of TABLES) {
  const rows = X.read(sheetPath(t.sheet));
  const file = new Map();
  for (const { row: n, cells: r } of rows) {
    if (!(n >= t.from && n <= t.to)) continue;
    const name = String(r[t.name] ?? "").trim();
    const price = num(r[t.price]);
    if (!name || price == null) continue;
    if (!file.has(name)) file.set(name, price);   // แถวแรกชนะ (ตารางหลักอยู่บน · ประวัติราคาอยู่ล่าง)
  }
  const web = pb[t.pb] ?? {};
  const changed = [], onlyWeb = [], onlyFile = [];
  for (const [k, v] of file) {
    if (!(k in web)) onlyFile.push([k, v]);
    else if (Math.abs(web[k] - v) > 0.005) changed.push([k, web[k], v]);
  }
  for (const k of Object.keys(web)) if (!file.has(k)) onlyWeb.push([k, web[k]]);

  console.log(`\n═══ ${t.label} — ไฟล์ ${file.size} รายการ · เว็บ ${Object.keys(web).length} รายการ ═══`);
  if (changed.length) {
    console.log(`\n● ราคาต่างกัน ${changed.length} รายการ (เว็บ → ไฟล์)`);
    for (const [k, a, b] of changed) console.log(`   ${k}   ${a} → ${b}`);
  }
  if (onlyFile.length) {
    console.log(`\n● มีในไฟล์ ไม่มีในเว็บ ${onlyFile.length} รายการ (ต้องเพิ่ม)`);
    for (const [k, v] of onlyFile) console.log(`   ${k}   ${v}`);
  }
  if (onlyWeb.length) {
    console.log(`\n● มีในเว็บ ไฟล์ล่าสุดไม่มีแล้ว ${onlyWeb.length} รายการ (ต้องเอาออก)`);
    for (const [k, v] of onlyWeb) console.log(`   ${k}   ${v}`);
  }
  if (!changed.length && !onlyFile.length && !onlyWeb.length) console.log("  ✅ ตรงกันทุกรายการ");
  anyDiff = anyDiff || !!(changed.length || onlyFile.length || onlyWeb.length);

  if (WRITE) pb[t.pb] = Object.fromEntries(file);
}

// ── ค่าแรง ────────────────────────────────────────────────────────────────
{
  const rows = X.read(sheetPath(LABOR.sheet));
  const file = new Map();
  for (const { row: n, cells: c } of rows) {
    if (!(n >= LABOR.from && n <= LABOR.to)) continue;
    const name = String(c.A ?? "").trim();
    if (!name || name.startsWith("▶") || name === "แบบบาน") continue;
    const v = Object.fromEntries(Object.entries(LABOR.cols).map(([k, col]) => [k, Number(c[col])]));
    if (!Object.values(v).every(Number.isFinite)) continue;
    if (!file.has(name)) file.set(name, v);
  }
  const web = pb.LABOR ?? {};
  const r2 = (x) => Math.round(x * 100) / 100;
  const changed = [], added = [], onlyWeb = [];
  for (const [k, v] of file) {
    if (!(k in web)) { added.push([k, v]); continue; }
    const d = Object.keys(LABOR.cols).filter((f) => Math.abs((web[k]?.[f] ?? 0) - v[f]) > 0.01);
    if (d.length) changed.push([k, d.map((f) => `${f} ${r2(web[k][f])}→${r2(v[f])}`).join(" · ")]);
  }
  for (const k of Object.keys(web)) if (!file.has(k)) onlyWeb.push(k);

  console.log(`
═══ ค่าแรง (ฐาน + เรต/ตร.ม.) — ไฟล์ ${file.size} แถว · เว็บ ${Object.keys(web).length} แถว ═══`);
  if (changed.length) { console.log(`
● ต่างกัน ${changed.length} แถว`); for (const [k, d] of changed) console.log(`   ${k}  ${d}`); }
  if (added.length) { console.log(`
● มีในไฟล์ ไม่มีในเว็บ ${added.length} แถว (เพิ่มให้)`); for (const [k, v] of added) console.log(`   ${k}  ${JSON.stringify(v)}`); }
  if (onlyWeb.length) console.log(`
● คีย์ของเว็บที่ไฟล์ไม่มี (กลไกเว็บ — คงไว้) ${onlyWeb.length}: ${onlyWeb.join(" · ")}`);
  anyDiff = anyDiff || !!(changed.length || added.length);
  if (WRITE_LABOR) pb.LABOR = { ...web, ...Object.fromEntries(file) };
  else if (changed.length) console.log("\n  ⚠ ยังไม่เขียนทับ — ค่าแรงเปลี่ยน = ราคาขายขยับทุกรุ่น (ใส่ --write --labor ถึงจะอัปเดต)");
}

if (WRITE) {
  const eol = fs.readFileSync(PB_PATH, "utf8").includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(PB_PATH, JSON.stringify(pb, null, 2).replace(/\n/g, eol));
  console.log(`\n✍  เขียนทับ ${path.basename(PB_PATH)} ตามไฟล์ ${XLSX} แล้ว`);
} else if (anyDiff) {
  console.log("\n(dry-run — ใส่ --write เพื่ออัปเดตตามไฟล์)");
}
