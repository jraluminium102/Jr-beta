#!/usr/bin/env node
/**
 * gen-color-panel-pdf — ตารางเทียบค่าสี "บานสำเร็จ" เป็น PDF สำหรับปริ้นมาตรวจ
 *   node scripts/gen-color-panel-pdf.mjs
 *   ออก: docs/เทียบค่าสี-บานสำเร็จ.pdf   (A4 แนวนอน · 2 สินค้า/แถว · มีช่อง ✓ ให้ติ๊กตอนตรวจ)
 *
 * ข้อมูลชุดเดียวกับ scripts/gen-color-panel-xlsx.mjs (อ่านไฟล์ เทียบค่าอบสี.xlsx ของเจ้าของ)
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const SRC = process.argv[2] || "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
const OUT = "docs/เทียบค่าสี-บานสำเร็จ.pdf";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));

const IDOF = {
  "บานเลื่อน SMS": "sms_slide", "บานเลื่อน ยูโร": "euro_slide", "บานเลื่อน SlimLux": "slimlux",
  "บานเลื่อนรางบน": "topslide", "บานเลื่อน E-series": "eseries", "บานระแนงเลื่อน": "bar_slide",
  "บานเปิด": "open_door", "บานหมุน": "pivot", "บานกระทุ้ง": "awning", "เฟี้ยม": "folding",
  "เฟี้ยมยูโร": "fold_euro", "ติดตาย": "fixed", "PC Door": "pcdoor", "บานยก": "banyok",
  "เปิดดัดโค้ง": "curve_open", "บานเกล็ด": "banklet", "บานโซลิด": "bansolid", "Velora": "velora",
  "หลังคาเพิง ไวนิล": "roof", "ระแนง": "louver", "ระแนงหมุน": "louver_rotate", "ระแนงสลับ": "louver_slip",
  "ประตูรั้ว": "gate",
};
const COLOF = (s) => {
  const t = String(s).replace(/\s+/g, "");
  if (/มะฮอกกานี/.test(t)) return ["wood_maho", "woodStock", "ลายไม้ มะฮอกกานี"];
  if (/ไวท์โอ/.test(t)) return ["wood_whiteoak", "woodStock", "ลายไม้ ไวท์โอ็ค"];
  if (/ลายไม้อบพิเศษ|สีลายไม้อบพิเศษ/.test(t)) return ["special", "woodSpecial", "ลายไม้ อบพิเศษ"];
  if (/อบพิเศษ|สีพิเศษ/.test(t)) return ["special", "special", "สีอบพิเศษ"];
  if (/ลายไม้/.test(t)) return ["wood_teak", "woodStock", "ลายไม้ สักทอง (สต็อก)"];
  return null;
};

const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) { cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), rows: [] }; items.push(cur); continue; }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ color: cell(r, "G"), costAdd: num(cell(r, "I")), sellAdd: num(cell(r, "J")), total: num(cell(r, "M")) });
}

const baht = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const blocks = [];
for (const it of items) {
  const id = IDOF[it.name], p = id && PRODUCTS[id];
  if (!p) continue;
  const [w, h] = String(it.size).split(/\s*x\s*/i).map(Number);
  const pn = Number(it.panels) || 1;
  const base = { w, h, p: pn, form: p.defForm, material: id === "roof" ? "ไวนิล" : p.defMaterial, glassType: p.defGlass, spec: {}, addons: {} };
  let wh; try { wh = computeCost(PB, p, { ...base, color: "white", colorKey: "white" }); } catch { continue; }
  const lines = [];
  for (const cr of it.rows) {
    const m = COLOF(cr.color);
    if (!m) { lines.push({ label: esc(cr.color), na: true }); continue; }
    const [ck, bake, label] = m;
    let c; try { c = computeCost(PB, p, { ...base, color: bake, colorKey: ck }); } catch { continue; }
    const web = c.sell?.withInstall || 0, file = cr.total || 0;
    const dp = file > 0 ? Math.round(((web - file) / file) * 1000) / 10 : null;
    lines.push({ label, rate: PB.BAKE?.[bake] ?? 0, kg: Math.round((c.aluKg || 0) * 10) / 10,
      costAdd: c.cost.total - wh.cost.total, sellAdd: web - (wh.sell?.withInstall || 0), web, file, dp });
  }
  blocks.push({ name: it.name, size: it.size, panels: it.panels, base: wh.sell?.withInstall || 0, lines });
}

const tone = (dp) => (dp == null ? "" : Math.abs(dp) <= 1 ? "ok" : Math.abs(dp) <= 5 ? "warn" : "bad");
const card = (b) => `<div class="card">
  <div class="hd"><b>${esc(b.name)}</b><span>${esc(b.size)} ซม. · ${esc(b.panels)} บาน · ฐานอบขาว/ดำ <b>${baht(b.base)}</b></span></div>
  <table>
    <tr><th class="l">สี</th><th>เรต/กก.</th><th>กก.อบ</th><th>ทุนค่าสี</th><th>ค่าสี<br>ในราคาขาย</th><th>ขายรวม<br>เว็บ</th><th>ขายรวม<br>ไฟล์</th><th>ต่าง</th><th class="chk">✓</th></tr>
    ${b.lines.map((l) => (l.na
      ? `<tr><td class="l na">${l.label}</td><td class="na" colspan="7">ไฟล์บอกว่าไม่มีสีนี้ขาย</td><td class="chk"><i></i></td></tr>`
      : `<tr><td class="l">${esc(l.label)}</td><td>${l.rate || "—"}</td><td>${l.kg || "—"}</td><td>${baht(l.costAdd)}</td><td>${baht(l.sellAdd)}</td><td class="big">${baht(l.web)}</td><td>${baht(l.file)}</td><td class="${tone(l.dp)}">${l.dp == null ? "—" : (l.dp > 0 ? "+" : "") + l.dp + "%"}</td><td class="chk"><i></i></td></tr>`)).join("")}
  </table>
</div>`;

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เทียบค่าสี บานสำเร็จ</title>
<style>
  @page { size: A4 landscape; margin: 9mm 7mm 11mm; }
  * { box-sizing: border-box; }
  body { font-family: "Leelawadee UI","Tahoma",sans-serif; color:#111; margin:0; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { font-size: 9pt; color:#555; margin-bottom: 3mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm 4mm; }
  .card { border: 1.1pt solid #222; border-radius: 1.5mm; padding: 2mm 2.4mm; break-inside: avoid; }
  .hd { display:flex; justify-content:space-between; align-items:baseline; border-bottom: 1pt solid #222; padding-bottom:1mm; margin-bottom:1.2mm; gap:2mm; }
  .hd b { font-size: 13.5pt; }
  .hd span { font-size: 9.5pt; color:#333; text-align:right; }
  table { width:100%; border-collapse:collapse; font-size: 11pt; }
  tr:nth-child(even) td { background:#f7f7f7; }
  th { text-align:right; font-weight:600; padding:0.8mm 1mm; border-bottom:0.8pt solid #888; white-space:nowrap; font-size:9.5pt; line-height:1.15; }
  th.l, td.l { text-align:left; }
  td { padding:1.3mm 1mm; border-bottom:0.4pt dotted #bbb; text-align:right; white-space:nowrap; }
  td.big { font-size:12pt; font-weight:700; }
  .ok { color:#137333; font-weight:700; }
  .warn { color:#a06000; font-weight:700; }
  .bad { color:#c5221f; font-weight:700; }
  .na { color:#888; font-style:italic; }
  .chk { width:9mm; }
  .chk i { display:inline-block; width:5mm; height:5mm; border:1pt solid #666; border-radius:0.6mm; }
  .note { font-size:8.5pt; color:#444; margin-top:3mm; border-top:0.8pt solid #888; padding-top:1.2mm; line-height:1.5; }
</style></head><body>
<h1>เทียบค่าสี — บานสำเร็จ (เว็บตอนนี้ เทียบ ไฟล์ เทียบค่าอบสี.xlsx)</h1>
<div class="sub">ขนาด · จำนวนบาน · ราคาอ้างอิง = ตามไฟล์ของเจ้าของทุกตัว · ทุกราคาคือ "ราคาขายรวมติดตั้ง" · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}</div>
<div class="grid">${blocks.map(card).join("")}</div>
<div class="note">
<b>กก.อบ</b> = น้ำหนักที่เข้ากองค่าอบจริง (ลายไม้สต็อก = 0 เพราะซื้อเส้นสีสำเร็จ) &nbsp;·&nbsp; <b>ทุนค่าสี</b> = ทุนที่เพิ่มจากแถวฐาน &nbsp;·&nbsp; <b>ค่าสีในราคาขาย</b> = ขายรวมสีนั้น − ขายรวมฐาน<br>
<b>ต่าง</b> : <span class="ok">เขียว ≤1%</span> &nbsp; <span class="warn">เหลือง ≤5%</span> &nbsp; <span class="bad">แดง เกิน 5%</span> &nbsp;— ไฟล์เป็นสแนปช็อตก่อนพอร์ตราคาไฟล์ v1 และก่อนจูนกำไรค่าของ (21 ก.ย.69)
</div>
</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const tmp = "docs/_color-panel.html";
fs.writeFileSync(tmp, html, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + process.cwd().replace(/\\/g, "/") + "/" + tmp, { waitUntil: "load" });
await page.pdf({
  path: OUT, format: "A4", landscape: true, printBackground: true,
  margin: { top: "9mm", bottom: "11mm", left: "7mm", right: "7mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8pt;color:#666;width:100%;text-align:center;font-family:Tahoma">เทียบค่าสี — บานสำเร็จ · หน้า <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
if (!process.argv.includes("--keep-html")) fs.unlinkSync(tmp);
console.log(OUT, "· สินค้า", blocks.length, "· บรรทัดสี", blocks.reduce((s, b) => s + b.lines.length, 0));
