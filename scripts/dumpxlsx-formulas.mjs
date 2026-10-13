#!/usr/bin/env node
/**
 * dumpxlsx-formulas — พิมพ์ "สูตร" (ไม่ใช่ค่า) ของเซลล์ในชีต .xlsx — ใช้คู่กับ dumpxlsx.mjs ที่พิมพ์ค่า cached
 *   node scripts/dumpxlsx-formulas.mjs <ไฟล์.xlsx> <ชื่อชีต> [คอลัมน์ เช่น "BDE"] [แถวสูงสุด=200]
 *
 * ทำไมต้องมี: ค่าในไฟล์เป็นค่า cached ที่อินพุตปัจจุบันเท่านั้น (เช่น 600×300 3 บาน) · อยากรู้ว่า 4 บาน/ขนาดอื่น ไฟล์คิดยังไง ต้องอ่านสูตร
 *   (13 ต.ค.69 ใช้ไล่ว่าทำไมบานเลื่อนยูโร 4 บานทุนโดด +18% จากตาราง 4.1 → ใบตัด "เลื่อน4" ใส่ต่อราง F7990 ×4 + เฟรมข้าง 2 ราง)
 */
import { openXlsx, sheetList } from "./dumpxlsx.mjs";

const [file, sheetName, cols = "ABCDEFGHIJKL", maxRow = "200"] = process.argv.slice(2);
if (!file || !sheetName) { console.log("ใช้: node scripts/dumpxlsx-formulas.mjs <ไฟล์.xlsx> <ชีต> [คอลัมน์] [แถวสูงสุด]"); process.exit(1); }
const x = openXlsx(file);
const sh = sheetList(x.zip).find((s) => s.name === sheetName);
if (!sh) { console.log("ไม่เจอชีต " + sheetName + " · มี: " + sheetList(x.zip).map((s) => s.name).join(" | ")); process.exit(1); }
const raw = x.zip.get ? x.zip.get(sh.path) : x.zip[sh.path];
const xml = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'");
// shared formulas (t="shared" si=N) — เซลล์ลูกไม่มีข้อความสูตร พิมพ์เป็น (shared #N) ให้รู้ว่าลอกจากต้นทาง
const re = /<c r="([A-Z]+)(\d+)"[^>]*>(?:<f([^>]*)>([^<]*)<\/f>|<f([^>]*)\/>)?/g;
let m;
while ((m = re.exec(xml))) {
  const [, col, row, attrs1, f, attrs2] = m;
  if (+row > +maxRow || !cols.includes(col)) continue;
  if (f) console.log(`${col}${row} = ${unesc(f)}`);
  else if (attrs2 && /shared/.test(attrs2)) console.log(`${col}${row} = (shared ${(attrs2.match(/si="(\d+)"/) || [])[1] ?? "?"})`);
}
