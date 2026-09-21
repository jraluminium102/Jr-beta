#!/usr/bin/env node
/**
 * gen-r41-split-pdf — เทียบราคาขายแบบ "แยกก้อน" (ค่าของ · ค่าผลิต · ค่าติดตั้ง) เว็บ ↔ ตาราง R4.1
 *   node scripts/gen-r41-split-pdf.mjs
 *   ออก: docs/เทียบราคาขายแยกก้อน-R4.1.pdf + docs/เทียบราคาขายแยกก้อน-R4.1.xlsx
 *
 * เจ้าของสั่ง 21 ก.ย.69: "อยากได้แบบแยกราคาต้นทุนค่าของ ค่าผลิต ติดตั้ง + แสดงความต่างกำไรที่คูณด้วย
 *   ในไฟล์ที่แนบมันคิดแบบ กำไร 60% คือ 160% — เอาอัตราส่วน 60%"
 * → ทุกช่อง "กำไร %" ในไฟล์นี้ = (ขาย ÷ ทุน − 1) × 100  เช่น ทุน 100 ขาย 160 → 60%
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { writeXlsx, S } from "./xlsxwrite.mjs";

const PDF_OUT = "docs/เทียบราคาขายแยกก้อน-R4.1.pdf";
const XLS_OUT = "docs/เทียบราคาขายแยกก้อน-R4.1.xlsx";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8"));
const rows = FX.rows || FX;

const baht = (v) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? Math.round(v).toLocaleString("en-US") : v === 0 ? "0" : "—");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
/** กำไร % แบบที่เจ้าของใช้: ขาย 160 จากทุน 100 = 60% */
const gain = (cost, sell) => (cost > 0 && sell > 0 ? Math.round(((sell / cost) - 1) * 1000) / 10 : null);
const pct = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + v + "%");

const byProd = new Map();
for (const r of rows) {
  const p = PRODUCTS[r.id];
  if (!p) continue;
  let c;
  try { c = computeCost(PB, p, { ...(r.inputs || {}), spec: r.inputs?.spec || {}, addons: {} }); } catch { continue; }
  const T = r.pdf || {};
  const web = {
    cM: c.cost?.total || 0, sM: c.sell?.parts?.mat || 0,
    cP: c.labor?.prod || 0, sP: c.sell?.parts?.prod || 0,
    cI: c.labor?.install || 0, sI: c.sell?.parts?.inst || 0,
    sT: c.sell?.withInstall || 0,
  };
  web.cT = web.cM + web.cP + web.cI;
  const tab = { cM: T.cM || 0, sM: T.sM || 0, cP: T.cP || 0, sP: T.sP || 0, cI: T.cI || 0, sI: T.sI || 0, sT: T.sT || 0 };
  tab.cT = tab.cM + tab.cP + tab.cI;
  const e = byProd.get(r.id) || { name: r.head, id: r.id, lines: [] };
  e.name = r.head || e.name;
  e.lines.push({ size: `${r.w}×${r.h}`, panels: r.p || 1, vk: r.vk || "", tab, web,
    dp: tab.sT > 0 ? Math.round(((web.sT - tab.sT) / tab.sT) * 1000) / 10 : null });
  byProd.set(r.id, e);
}
const blocks = [...byProd.values()].map((b) => {
  b.off = b.lines.filter((l) => l.dp != null && Math.abs(l.dp) > 5).length;
  return b;
}).sort((a, b) => (b.off - a.off) || (b.lines.length - a.lines.length));

const tone = (dp) => (dp == null ? "" : Math.abs(dp) <= 1 ? "ok" : Math.abs(dp) <= 5 ? "warn" : "bad");
// เทียบกำไร: ต่างเกิน 5 จุด % = แดง
const gTone = (a, b) => (a == null || b == null ? "" : Math.abs(a - b) <= 2 ? "ok" : Math.abs(a - b) <= 5 ? "warn" : "bad");

const lineRows = (l) => {
  const g = (o) => [gain(o.cM, o.sM), gain(o.cP, o.sP), gain(o.cI, o.sI), gain(o.cT, o.sT)];
  const [tM, tP, tI, tT] = g(l.tab), [wM, wP, wI, wT] = g(l.web);
  return `
  <tr class="sz"><td class="l" rowspan="2">${esc(l.size)}<br><span class="sm">${l.panels} บาน${l.vk ? " · " + esc(l.vk) : ""}</span></td>
    <td class="l sm">ตาราง</td>
    <td>${baht(l.tab.cM)}</td><td>${baht(l.tab.sM)}</td><td class="g">${pct(tM)}</td>
    <td>${baht(l.tab.cP)}</td><td>${baht(l.tab.sP)}</td><td class="g">${pct(tP)}</td>
    <td>${baht(l.tab.cI)}</td><td>${baht(l.tab.sI)}</td><td class="g">${pct(tI)}</td>
    <td>${baht(l.tab.sT)}</td><td class="g">${pct(tT)}</td><td class="chk" rowspan="2"><i></i></td></tr>
  <tr class="web"><td class="l sm">เว็บ</td>
    <td>${baht(l.web.cM)}</td><td>${baht(l.web.sM)}</td><td class="g ${gTone(tM, wM)}">${pct(wM)}</td>
    <td>${baht(l.web.cP)}</td><td>${baht(l.web.sP)}</td><td class="g ${gTone(tP, wP)}">${pct(wP)}</td>
    <td>${baht(l.web.cI)}</td><td>${baht(l.web.sI)}</td><td class="g ${gTone(tI, wI)}">${pct(wI)}</td>
    <td class="big">${baht(l.web.sT)}</td><td class="g ${gTone(tT, wT)}">${pct(wT)}</td></tr>`;
};
const tbl = (ls) => `<table>
  <tr><th class="l" rowspan="2">ขนาด</th><th class="l" rowspan="2"></th>
      <th colspan="3">ค่าของ (วัสดุ)</th><th colspan="3">ค่าผลิต</th><th colspan="3">ค่าติดตั้ง</th><th colspan="2">รวม</th><th class="chk" rowspan="2">✓</th></tr>
  <tr><th>ทุน</th><th>ขาย</th><th>กำไร</th><th>ทุน</th><th>ขาย</th><th>กำไร</th><th>ทุน</th><th>ขาย</th><th>กำไร</th><th>ขาย</th><th>กำไร</th></tr>
  ${ls.map(lineRows).join("")}
</table>`;
const card = (b) => `<div class="card${b.lines.length > 6 ? " wide" : ""}">
  <div class="hd"><b>${esc(b.name)}</b><span>${esc(b.id)} · ${b.lines.length} ขนาด${b.off ? ` · <u>ขายรวมต่างเกิน 5% : ${b.off}</u>` : " · ขายรวมตรงทุกขนาด"}</span></div>
  ${b.lines.length > 12
    ? `<div class="two">${tbl(b.lines.slice(0, Math.ceil(b.lines.length / 2)))}${tbl(b.lines.slice(Math.ceil(b.lines.length / 2)))}</div>`
    : tbl(b.lines)}
</div>`;

const nAll = blocks.reduce((s, b) => s + b.lines.length, 0);
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เทียบราคาขายแยกก้อน R4.1</title>
<style>
  @page { size: A4 landscape; margin: 8mm 6mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Leelawadee UI","Tahoma",sans-serif; color:#111; margin:0; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { font-size: 9.5pt; color:#555; margin-bottom: 3mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm 4mm; }
  .card { border: 1.1pt solid #222; border-radius: 1.5mm; padding: 2mm 2.4mm; break-inside: avoid; }
  .card.wide { grid-column: span 2; }
  .two { display:grid; grid-template-columns: 1fr 1fr; gap: 0 4mm; }
  .hd { display:flex; justify-content:space-between; align-items:baseline; border-bottom: 1pt solid #222; padding-bottom:1mm; margin-bottom:1.2mm; gap:2mm; }
  .hd b { font-size: 13pt; }
  .hd span { font-size: 9pt; color:#333; text-align:right; }
  table { width:100%; border-collapse:collapse; font-size: 9.5pt; }
  th { text-align:right; font-weight:600; padding:0.6mm 0.8mm; border-bottom:0.8pt solid #888; white-space:nowrap; font-size:8.5pt; }
  th[colspan] { text-align:center; border-left:0.5pt solid #ccc; border-right:0.5pt solid #ccc; background:#eee; }
  th.l, td.l { text-align:left; }
  td { padding:0.9mm 0.8mm; text-align:right; white-space:nowrap; }
  tr.sz td { border-top:0.6pt solid #999; }
  tr.sz td.l:first-child { font-weight:700; }
  tr.web td { color:#000; background:#f6f6f6; }
  td.g { font-weight:600; }
  td.big { font-size:11pt; font-weight:700; }
  td.sm, .sm { font-size:8pt; color:#555; }
  .ok { color:#137333; }
  .warn { color:#a06000; }
  .bad { color:#c5221f; }
  .chk { width:8mm; text-align:center; }
  .chk i { display:inline-block; width:4.5mm; height:4.5mm; border:1pt solid #666; border-radius:0.6mm; }
  .note { font-size:8.5pt; color:#444; margin-top:3mm; border-top:0.8pt solid #888; padding-top:1.2mm; line-height:1.5; }
</style></head><body>
<h1>เทียบราคาขายแยกก้อน — ค่าของ · ค่าผลิต · ค่าติดตั้ง (เว็บ เทียบ ★ ตารางราคาขาย R4.1)</h1>
<div class="sub">${nAll} ขนาด · ${blocks.length} รุ่น · สีขาว ไม่มีของเสริม · แถวบน = ตาราง R4.1 · แถวล่าง (พื้นเทา) = เว็บตอนนี้ · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}</div>
<div class="grid">${blocks.map(card).join("")}</div>
<div class="note">
<b>กำไร %</b> = (ขาย ÷ ทุน − 1) × 100 — คิดเป็น "ส่วนที่บวกเพิ่ม" เช่น ทุน 100 ขาย 160 = <b>60%</b> (ไม่ใช่ 160%)<br>
สีที่ช่องกำไรของแถวเว็บ = เทียบกับกำไรของตาราง : <span class="ok">เขียว ต่างไม่เกิน 2 จุด%</span> &nbsp; <span class="warn">เหลือง ≤5 จุด%</span> &nbsp; <span class="bad">แดง เกิน 5 จุด%</span><br>
ทุนค่าผลิต/ค่าติดตั้งของเว็บมาจากสูตรค่าแรงของรุ่นนั้น — ถ้าทุนค่าแรงไม่ตรงตาราง กำไรก้อนนั้นจะต่างตามไปด้วย แก้ด้วย % กำไรค่าของไม่ได้
</div>
</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const tmp = "docs/_r41-split.html";
fs.writeFileSync(tmp, html, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + process.cwd().replace(/\\/g, "/") + "/" + tmp, { waitUntil: "load" });
await page.pdf({
  path: PDF_OUT, format: "A4", landscape: true, printBackground: true,
  margin: { top: "8mm", bottom: "10mm", left: "6mm", right: "6mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8pt;color:#666;width:100%;text-align:center;font-family:Tahoma">เทียบราคาขายแยกก้อน · หน้า <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
if (!process.argv.includes("--keep-html")) fs.unlinkSync(tmp);

// ── Excel ฉบับเดียวกัน (ไว้กรอง/เรียงเอง) ──
const HEAD = ["รุ่น", "รหัส", "ขนาด", "บาน", "แบบ", "ที่มา",
  "ค่าของ ทุน", "ค่าของ ขาย", "ค่าของ กำไร%", "ค่าผลิต ทุน", "ค่าผลิต ขาย", "ค่าผลิต กำไร%",
  "ค่าติดตั้ง ทุน", "ค่าติดตั้ง ขาย", "ค่าติดตั้ง กำไร%", "รวม ขาย", "รวม กำไร%"];
const xr = [];
for (const b of blocks) for (const l of b.lines) {
  for (const [src, o] of [["ตาราง R4.1", l.tab], ["เว็บ", l.web]])
    xr.push([b.name, b.id, l.size, l.panels, l.vk, src,
      Math.round(o.cM), Math.round(o.sM), gain(o.cM, o.sM),
      Math.round(o.cP), Math.round(o.sP), gain(o.cP, o.sP),
      Math.round(o.cI), Math.round(o.sI), gain(o.cI, o.sI),
      Math.round(o.sT), gain(o.cT, o.sT)]);
}
const howto = [["ช่อง", "แปลว่าอะไร"],
  ["กำไร %", "(ขาย ÷ ทุน − 1) × 100 — ทุน 100 ขาย 160 = 60% (ไม่ใช่ 160%)"],
  ["ที่มา = ตาราง R4.1", "ตัวเลขในไฟล์ ★ ตารางราคาขาย R4.1"],
  ["ที่มา = เว็บ", "คิดราคา 4.0 บนเว็บตอนนี้ ด้วยขนาด/จำนวนบานเดียวกัน"],
  ["ค่าของ ทุน", "ทุนค่าวัสดุทั้งหมด (อลู+กระจก+อุปกรณ์+ค่าอบสี)"],
  ["ค่าผลิต / ค่าติดตั้ง ทุน", "ทุนค่าแรงจากสูตรของรุ่นนั้น"]];
writeXlsx(XLS_OUT, [
  { name: "อ่านยังไง", rows: howto, widths: [26, 86] },
  { name: "แยกก้อน", rows: [HEAD, ...xr], widths: [26, 13, 11, 5, 18, 12, 11, 11, 12, 11, 11, 12, 12, 12, 13, 11, 11],
    rowStyles: [0, ...xr.map((r) => (r[5] === "เว็บ" ? S.BLUE : 0))] },
]);
console.log(PDF_OUT, "·", XLS_OUT, "· รุ่น", blocks.length, "· ขนาด", nAll);
