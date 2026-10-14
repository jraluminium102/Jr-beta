#!/usr/bin/env node
/**
 * set-r41-net — เขียน "กำไรสุทธิ" ของแต่ละรุ่น/แบบย่อย จาก ★ ตารางราคาขาย R4.1 ลง pricebook (PB.R41.net)
 *   node scripts/set-r41-net.mjs [--dry]
 *
 * เจ้าของเคาะ 13 ต.ค.69: "เอากำไรสุทธิจากไฟล์ R4.1 เป็นหลัก เป็นตัวตัดสินราคาขายของทุน · ยึดกำไรสุทธิให้ตรงตามไฟล์เป๊ะ ๆ"
 *   → เอนจินตั้งราคาขายรวม = ทุนรวม (ของ+ผลิต+ติดตั้ง) ÷ (1 − 30/130 − กำไรสุทธิ) แล้วปัดร้อย
 *
 * แหล่ง: scripts/fixtures/r41-rows.json (target = ตัวเลข "กำไรสุทธิ X%" ใต้ชื่อรุ่นใน PDF)
 *   หัวข้อที่ชื่อยาวหลายบรรทัด ตัวอ่าน PDF จับ % ไม่ติด (target = null) → ใช้กำไรสุทธิเฉลี่ยของแถวในตาราง ปัดเป็นจำนวนเต็ม
 *   (ตรวจกับ PDF แล้ว 13 ต.ค.69: บานระแนงเลื่อน 30 · หลังคาเมทัลชีท 30 · Shade/Prime เพิง 20 จั่ว 25 · ระแนง 1×1.6 36)
 *   หลังคาเลื่อน: PDF เขียน "กำไรเฉพาะตัวหลังคา 25% · ขายมอเตอร์ 35,000" → ตัวเลข 27–31% ที่หัวรวมมอเตอร์แล้ว
 *     เว็บแยกมอเตอร์เป็นราคาขายฟิก (ไม่เข้าทุนค่าของ) → ใช้ 25% กับตัวหลังคา
 */
import fs from "node:fs";

const PB_PATH = "src/lib/calculator40/pricebook.json";
const rows = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows;
const OVERRIDE = { roof_slide: 25 };
const netOf = (s, c) => ((s - (s * 30) / 130 - c) / s) * 100;

const groups = {};
for (const r of rows) {
  if (!r.id || !r.inputs) continue;
  const g = (groups[r.id] ??= {});
  const k = r.vk || "_";
  const x = (g[k] ??= { t: new Set(), nets: [], parts: null });
  if (r.target != null) x.t.add(r.target);
  if (r.targetParts && !x.parts) x.parts = r.targetParts;   // เป้า ของ/ผลิต/ติดตั้ง จากหัวตาราง ("ตั้ง 63/65/62%") ไว้โชว์เทียบ
  if (!r.small) x.nets.push(netOf(r.pdf.sT, r.pdf.cT));
}
const net = {}, partsOut = {};
const log = [];
for (const [id, g] of Object.entries(groups)) {
  const out = {};
  const po = {};
  for (const [k, x] of Object.entries(g)) if (x.parts) po[k] = x.parts;
  if (Object.keys(po).length) partsOut[id] = Object.keys(po).length === 1 && po._ ? po._ : po;
  for (const [k, x] of Object.entries(g)) {
    let v, how;
    if (OVERRIDE[id] != null) { v = OVERRIDE[id]; how = "ตัวหลังคา (มอเตอร์ขายฟิกแยก)"; }
    else if (x.t.size === 1) { v = [...x.t][0]; how = "PDF"; }
    else if (x.nets.length) { v = Math.round(x.nets.reduce((a, b) => a + b, 0) / x.nets.length); how = "เฉลี่ยแถว"; }
    else continue;
    out[k] = v;
    log.push(`${id}${k === "_" ? "" : " · " + k}: ${v}% (${how})`);
  }
  const ks = Object.keys(out);
  net[id] = ks.length === 1 && ks[0] === "_" ? out._ : out;
}
console.log(log.join("\n"));
if (process.argv.includes("--dry")) process.exit(0);
const PB = JSON.parse(fs.readFileSync(PB_PATH, "utf8"));
PB.R41.net = net;
PB.R41.parts = partsOut;   // เป้ากำไรแยก ของ/ผลิต/ติดตั้ง (หัวตาราง) — โชว์เทียบเท่านั้น ไม่ใช้คิดราคา
PB.R41.net_NOTE = "กำไรสุทธิตาม ★ ตารางราคาขาย R4.1 (เจ้าของเคาะ 13 ต.ค.69) — ขายรวม = ทุนรวม ÷ (1 − 30/130 − %) ปัดร้อย · ค่าผลิต/ติดตั้งขาย = ตาราง · ค่าของ = ส่วนที่เหลือ · สร้างด้วย scripts/set-r41-net.mjs";
fs.writeFileSync(PB_PATH, JSON.stringify(PB, null, 2) + "\n");
console.log("เขียน PB.R41.net แล้ว · " + Object.keys(net).length + " รุ่น");
