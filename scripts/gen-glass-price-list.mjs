// สร้างตารางราคากระจกที่ระบบมี (HTML พิมพ์ได้) — เจ้าของขอดูเทียบกับลิสต์ชื่อ 4 พ.ย.69
// node scripts/gen-glass-price-list.mjs > docs/ราคากระจก-ในระบบ.html
import fs from "node:fs";
import { GLASS_NAMED, GLASS_NO_PRICE } from "../src/lib/calculator40/glass-catalog.mjs";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const G = PB.GLASS;
const cat = (n) => /ลามิเนต/.test(n) ? "ลามิเนต" : /เทมเปอร์/.test(n) ? "เทมเปอร์" : /อินซูเลท/.test(n) ? "อินซูเลท" : /ดัดโค้ง/.test(n) ? "ดัดโค้ง" : "กระจกธรรมดา";
const keyToName = new Map(); for (const [n, k] of GLASS_NAMED) if (!keyToName.has(k)) keyToName.set(k, n);
const fmt = (v) => Number(v).toLocaleString("th-TH");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const groups = {};
for (const k of Object.keys(G)) (groups[cat(k)] ||= []).push(k);
const order = ["กระจกธรรมดา", "เทมเปอร์", "ลามิเนต", "ดัดโค้ง", "อินซูเลท"];
let rows = "", i = 0;
for (const c of order) {
  if (!groups[c]) continue;
  rows += `<tr class="cat"><td colspan="4">${c} (${groups[c].length} รายการ)</td></tr>`;
  for (const k of groups[c]) {
    i++;
    const nm = keyToName.get(k);
    rows += `<tr><td class="n">${i}</td><td>${esc(k)}</td><td class="${nm ? "ok" : "dim"}">${nm ? esc(nm) : "— (ต่อท้ายดรอปดาวน์)"}</td><td class="num">${fmt(G[k])}</td></tr>`;
  }
}
// 14 ตัวที่ไม่มี + ตัวใกล้เคียง
const NEAR = {
  "ยูโรบรอนซ์ หนา 10 มม.": ["ยูโรบรอนซ์ 6มม.", "เทมเปอร์ยูโรบรอนซ์ 10มม."],
  "เทมเปอร์เขียว หนา 15 มม.": ["เทมเปอร์ 15มม."],
  "ลามิเนตใส ฟิล์มเขียว 0.38 หนา 5+5 มม.": ["ลามิเนต 5+5 ฟิล์ม 0.38", "ลามิเนตใส 4+4 ฟิล์มสี 0.38"],
  "ลามิเนตใส ฟิล์มสีต่างๆ 0.76 หนา 4+4 มม.": ["ลามิเนตใส 4+4 ฟิล์มสี 0.38", "ลามิเนตฟิล์มสีทั่วไป 4+4"],
  "ลามิเนตใส ฟิล์มกันเสียง 0.76 หนา 4+4 มม.": ["ลามิเนตใส 5+5 กันเสียง 0.76"],
  "ลามิเนตเขียว ฟิล์มกันเสียง 0.76 หนา 4+4 มม.": ["ลามิเนตเขียว 5+5 กันเสียง 0.76"],
  "ลามิเนตเขียว ฟิล์ม Solar Max กันร้อน 0.76 หนา 4+4 มม.": ["ลามิเนต 4+4 Solar Max 0.76"],
  "ลามิเนตใส ฟิล์มกันขโมย STG 1.52 หนา 4+4 มม.": ["ลามิเนตใส 5+5 STG 1.52"],
  "ลามิเนตเขียว ฟิล์มกันขโมย STG 1.52 หนา 4+4 มม.": ["ลามิเนตเขียว 5+5 STG 1.52"],
  "ลามิเนตใส ฟิล์มเขียว 0.76 หนา 5+5 มม.": ["ลามิเนต ใส5+5 0.76", "ลามิเนต เขียว4+4 0.76"],
  "ลามิเนตใส ฟิล์มเขียว 0.76 หนา 6+6 มม.": ["ลามิเนต 6+6 สูง>2.5ม. 0.76"],
  "ใสดัดโค้ง หนา 6 มม.": ["กระจกดัดโค้ง 10มม."],
  "เทมเปอร์ลามิเนต หนา 4+4 มม.": ["เทมเปอร์ลามิเนต 6+6 PVB 1.52"],
  "เทมเปอร์ลามิเนต หนา 5+5 มม.": ["เทมเปอร์ลามิเนต 6+6 PVB 1.52"],
};
let miss = "";
GLASS_NO_PRICE.forEach((n, j) => {
  const near = (NEAR[n] || []).map((k) => `${esc(k)} = ${G[k] != null ? fmt(G[k]) : "?"}`).join("<br>");
  miss += `<tr><td class="n">${j + 1}</td><td>${esc(n)}</td><td>${near || "—"}</td><td class="fill"></td></tr>`;
});
const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ราคากระจกในระบบ</title>
<style>
body{font-family:Tahoma,Arial,sans-serif;font-size:13px;margin:16px;color:#111}
h1{font-size:18px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 6px} p{margin:4px 0 10px;color:#444}
table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:4px 6px;vertical-align:top}
th{background:#eee;text-align:left} td.n,td.num{text-align:right;white-space:nowrap} td.num{font-weight:bold}
tr.cat td{background:#dde8f5;font-weight:bold} td.ok{color:#15803d} td.dim{color:#888} td.fill{min-width:110px}
@media print{body{margin:8mm} tr{page-break-inside:avoid}}
</style></head><body>
<h1>ราคากระจกที่ระบบมีตอนนี้ — ${Object.keys(G).length} รายการ (บาท/ตร.ม. ราคาทุน)</h1>
<p>คอลัมน์ "ชื่อที่ขึ้นใบเสนอ" = ชื่อตามลิสต์ 4 พ.ย.69 ที่ผูกไว้แล้ว · ขีด = ยังไม่ได้ตั้งชื่อ (อยู่ท้ายดรอปดาวน์ กลุ่ม "อื่น ๆ")</p>
<table><thead><tr><th>#</th><th>ชื่อในไฟล์ราคา</th><th>ชื่อที่ขึ้นใบเสนอ</th><th>ทุน/ตร.ม.</th></tr></thead><tbody>${rows}</tbody></table>
<h2>14 ชื่อในลิสต์ที่ยังไม่มีราคา</h2>
<p>คอลัมน์ "ตัวใกล้เคียงที่มี" = ราคาที่ใกล้ที่สุดในระบบ · ช่องขวาเว้นไว้เขียนราคาจริง หรือเขียนว่าใช้ตัวไหนแทน</p>
<table><thead><tr><th>#</th><th>ชื่อในลิสต์</th><th>ตัวใกล้เคียงที่มี (ทุน/ตร.ม.)</th><th>ราคาจริง / ใช้ตัวไหนแทน</th></tr></thead><tbody>${miss}</tbody></table>
</body></html>`;
process.stdout.write(html);
