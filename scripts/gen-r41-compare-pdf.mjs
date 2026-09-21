#!/usr/bin/env node
/**
 * gen-r41-compare-pdf — ตารางเทียบ "ราคาขายเว็บ ↔ ★ ตารางราคาขาย R4.1" เป็น PDF สำหรับปริ้นมาตรวจ
 *   node scripts/gen-r41-compare-pdf.mjs
 *   ออก: docs/เทียบราคาขาย-R4.1.pdf   (A4 แนวนอน · 1 รุ่น = 1 การ์ด · มีช่อง ✓ ให้ติ๊ก)
 *
 * ข้อมูลตาราง R4.1 = scripts/fixtures/r41-rows.json (ถอดจาก PDF ด้วย gen-r41-table.mjs)
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const OUT = "docs/เทียบราคาขาย-R4.1.pdf";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8"));
const rows = FX.rows || FX;

const baht = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// จัดกลุ่มตามรุ่น
const byProd = new Map();
for (const r of rows) {
  const p = PRODUCTS[r.id];
  if (!p) continue;
  let c;
  try { c = computeCost(PB, p, { ...(r.inputs || {}), spec: r.inputs?.spec || {}, addons: {} }); } catch { continue; }
  const file = r.pdf?.sT || 0, web = c.sell?.withInstall || 0;
  const dp = file > 0 ? Math.round(((web - file) / file) * 1000) / 10 : null;
  const dP = Math.abs((c.labor?.prod || 0) - (r.pdf?.cP || 0)), dI = Math.abs((c.labor?.install || 0) - (r.pdf?.cI || 0));
  const labOk = (r.pdf?.cP == null && r.pdf?.cI == null) ? null : (dP <= 2 && dI <= 2);
  const key = r.id;
  const e = byProd.get(key) || { name: r.head, id: key, lines: [] };
  e.name = r.head || e.name;
  e.lines.push({ size: `${r.w}×${r.h}`, panels: r.p || 1, vk: r.vk || "", file, web, dp, labOk });
  byProd.set(key, e);
}
// เรียง: รุ่นที่มีแถวต่างเกิน 5% เยอะสุดขึ้นก่อน
const blocks = [...byProd.values()].map((b) => {
  b.off = b.lines.filter((l) => l.dp != null && Math.abs(l.dp) > 5).length;
  b.lab = b.lines.filter((l) => l.labOk === false).length;
  return b;
}).sort((a, b) => (b.off - a.off) || (b.lines.length - a.lines.length));

const tone = (dp) => (dp == null ? "" : Math.abs(dp) <= 1 ? "ok" : Math.abs(dp) <= 5 ? "warn" : "bad");
const tbl = (ls) => `<table>
    <tr><th class="l">ขนาด (ซม.)</th><th>บาน</th><th class="l">แบบ</th><th>ขายรวม<br>ตาราง R4.1</th><th>ขายรวม<br>เว็บ</th><th>ต่าง (บาท)</th><th>ต่าง</th><th>ค่าแรง</th><th class="chk">✓</th></tr>
    ${ls.map((l) => `<tr>
      <td class="l">${esc(l.size)}</td><td>${l.panels}</td><td class="l sm">${esc(l.vk)}</td>
      <td>${baht(l.file)}</td><td class="big">${baht(l.web)}</td>
      <td>${l.file ? ((l.web - l.file) > 0 ? "+" : "") + baht(l.web - l.file) : "—"}</td>
      <td class="${tone(l.dp)}">${l.dp == null ? "—" : (l.dp > 0 ? "+" : "") + l.dp + "%"}</td>
      <td class="${l.labOk === false ? "bad" : "ok"} sm">${l.labOk == null ? "—" : l.labOk ? "ตรง" : "ไม่ตรง"}</td>
      <td class="chk"><i></i></td></tr>`).join("")}
  </table>`;
const card = (b) => `<div class="card${b.lines.length > 14 ? " wide" : ""}">
  <div class="hd">
    <b>${esc(b.name)}</b>
    <span>${esc(b.id)} · ${b.lines.length} ขนาด${b.off ? ` · <u>ต่างเกิน 5% : ${b.off}</u>` : " · ตรงทุกขนาด"}${b.lab ? ` · ค่าแรงไม่ตรงตาราง ${b.lab}` : ""}</span>
  </div>
  ${b.lines.length > 14
    ? `<div class="two">${tbl(b.lines.slice(0, Math.ceil(b.lines.length / 2)))}${tbl(b.lines.slice(Math.ceil(b.lines.length / 2)))}</div>`
    : tbl(b.lines)}
</div>`;

const nOff = blocks.reduce((s, b) => s + b.off, 0), nAll = blocks.reduce((s, b) => s + b.lines.length, 0);
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เทียบราคาขาย R4.1</title>
<style>
  @page { size: A4 landscape; margin: 9mm 7mm 11mm; }
  * { box-sizing: border-box; }
  body { font-family: "Leelawadee UI","Tahoma",sans-serif; color:#111; margin:0; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { font-size: 9.5pt; color:#555; margin-bottom: 3mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm 4mm; }
  .card.wide { grid-column: span 2; }
  .two { display:grid; grid-template-columns: 1fr 1fr; gap: 0 4mm; }
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
  td.sm { font-size:9pt; color:#444; }
  .ok { color:#137333; font-weight:700; }
  .warn { color:#a06000; font-weight:700; }
  .bad { color:#c5221f; font-weight:700; }
  .chk { width:9mm; }
  .chk i { display:inline-block; width:5mm; height:5mm; border:1pt solid #666; border-radius:0.6mm; }
  .note { font-size:8.5pt; color:#444; margin-top:3mm; border-top:0.8pt solid #888; padding-top:1.2mm; line-height:1.5; }
</style></head><body>
<h1>เทียบราคาขาย — เว็บตอนนี้ เทียบ ★ ตารางราคาขาย R4.1</h1>
<div class="sub">ทุกแถวในตาราง R4.1 (${nAll} ขนาด · ${blocks.length} รุ่น) · ราคาทั้งหมดคือ "ราคาขายรวมติดตั้ง" สีขาว ไม่มีของเสริม · ต่างเกิน 5% = ${nOff} แถว · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}</div>
<div class="grid">${blocks.map(card).join("")}</div>
<div class="note">
<b>ต่าง</b> : <span class="ok">เขียว ≤1%</span> &nbsp; <span class="warn">เหลือง ≤5%</span> &nbsp; <span class="bad">แดง เกิน 5%</span><br>
<b>ค่าแรง</b> = ทุนค่าแรง (ผลิต+ติดตั้ง) ของเว็บตรงกับตารางไหม — <span class="bad">ไม่ตรง</span> แปลว่าแก้ด้วย % กำไรค่าของไม่ได้ ต้องไปแก้สูตรค่าแรงของรุ่นนั้น<br>
% กำไรค่าของจูนล่าสุด 21 ก.ย.69 (audit-r41-pdf --fit) · รุ่นที่มีหลายขนาดในตาราง จูน % เดียวชนทุกขนาดไม่ได้ ต้องเลือกว่าจะให้ชนขนาดไหน
</div>
</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const tmp = "docs/_r41-compare.html";
fs.writeFileSync(tmp, html, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + process.cwd().replace(/\\/g, "/") + "/" + tmp, { waitUntil: "load" });
await page.pdf({
  path: OUT, format: "A4", landscape: true, printBackground: true,
  margin: { top: "9mm", bottom: "11mm", left: "7mm", right: "7mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8pt;color:#666;width:100%;text-align:center;font-family:Tahoma">เทียบราคาขาย — เว็บ เทียบ ตาราง R4.1 · หน้า <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
if (!process.argv.includes("--keep-html")) fs.unlinkSync(tmp);
console.log(OUT, "· รุ่น", blocks.length, "· แถว", nAll, "· ต่างเกิน 5%", nOff);
