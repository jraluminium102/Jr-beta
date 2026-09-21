#!/usr/bin/env node
/**
 * gen-r41-split-pdf — เทียบราคาขายแบบ "แยกก้อน" (ค่าของ · ค่าผลิต · ค่าติดตั้ง) เว็บ ↔ ตาราง R4.1
 *   node scripts/gen-r41-split-pdf.mjs
 *   ออก: docs/เทียบราคาขายแยกก้อน-R4.1.pdf + docs/เทียบราคาขายแยกก้อน-R4.1.xlsx
 *
 * เจ้าของสั่ง 21 ก.ย.69
 *   ① "แยกราคาต้นทุนค่าของ ค่าผลิต ติดตั้ง + กำไรเอาอัตราส่วน 60% (ไม่ใช่ 160%)"
 *   ② "ไม่มีสีหน่อยหรอ ตาลายหมดแล้ว แบบแยกช่อง ตัวแดงบอกราคาต่าง"
 * → 3 ก้อนแยกด้วยแถบสีคนละสี · ช่อง "ต่าง" ตัวแดง/เขียวตัวหนา · 1 รุ่นเต็มความกว้างหน้า
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
const gain = (cost, sell) => (cost > 0 && sell > 0 ? Math.round(((sell / cost) - 1) * 100) : null);
const gp = (v) => (v == null ? "—" : v + "%");
/** ช่องส่วนต่าง: +เว็บแพงกว่า (แดง) · −เว็บถูกกว่า (เขียว) · ใกล้เคียง (เทา) */
const diff = (web, tab) => {
  if (!(tab > 0)) return { txt: "—", cls: "z" };
  const d = Math.round(web - tab), p = Math.abs(d / tab) * 100;
  const cls = p <= 2 ? "z" : d > 0 ? "up" : "dn";
  return { txt: (d > 0 ? "+" : d < 0 ? "−" : "") + Math.abs(d).toLocaleString("en-US"), cls };
};

const byProd = new Map();
for (const r of rows) {
  const p = PRODUCTS[r.id];
  if (!p) continue;
  let c;
  try { c = computeCost(PB, p, { ...(r.inputs || {}), spec: r.inputs?.spec || {}, addons: {} }); } catch { continue; }
  const T = r.pdf || {};
  const web = { cM: c.cost?.total || 0, sM: c.sell?.parts?.mat || 0, cP: c.labor?.prod || 0, sP: c.sell?.parts?.prod || 0,
    cI: c.labor?.install || 0, sI: c.sell?.parts?.inst || 0, sT: c.sell?.withInstall || 0 };
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

/** 1 ขนาด = 1 แถว · ในแต่ละก้อนโชว์ ตาราง → เว็บ → ต่าง */
const line = (l) => {
  const g = (o) => [gain(o.cM, o.sM), gain(o.cP, o.sP), gain(o.cI, o.sI), gain(o.cT, o.sT)];
  const [tM, tP, tI, tT] = g(l.tab), [wM, wP, wI, wT] = g(l.web);
  const dM = diff(l.web.sM, l.tab.sM), dP = diff(l.web.sP, l.tab.sP), dI = diff(l.web.sI, l.tab.sI), dT = diff(l.web.sT, l.tab.sT);
  const gcls = (a, b) => (a == null || b == null ? "z" : Math.abs(a - b) <= 3 ? "z" : Math.abs(a - b) <= 10 ? "up sm" : "up");
  return `<tr>
    <td class="l sz">${esc(l.size)}<span class="sm"> · ${l.panels} บาน${l.vk ? " · " + esc(l.vk) : ""}</span></td>
    <td class="g1">${baht(l.tab.cM)}</td><td class="g1">${baht(l.tab.sM)}</td><td class="g1 b">${baht(l.web.sM)}</td><td class="g1 ${dM.cls}">${dM.txt}</td><td class="g1 pc">${gp(tM)}→<b class="${gcls(tM, wM)}">${gp(wM)}</b></td>
    <td class="g2">${baht(l.tab.cP)}</td><td class="g2">${baht(l.tab.sP)}</td><td class="g2 b">${baht(l.web.sP)}</td><td class="g2 ${dP.cls}">${dP.txt}</td><td class="g2 pc">${gp(tP)}→<b class="${gcls(tP, wP)}">${gp(wP)}</b></td>
    <td class="g3">${baht(l.tab.cI)}</td><td class="g3">${baht(l.tab.sI)}</td><td class="g3 b">${baht(l.web.sI)}</td><td class="g3 ${dI.cls}">${dI.txt}</td><td class="g3 pc">${gp(tI)}→<b class="${gcls(tI, wI)}">${gp(wI)}</b></td>
    <td class="g4">${baht(l.tab.sT)}</td><td class="g4 big">${baht(l.web.sT)}</td><td class="g4 ${dT.cls} big">${dT.txt}</td><td class="g4 ${l.dp == null ? "z" : Math.abs(l.dp) <= 5 ? "z" : l.dp > 0 ? "up" : "dn"}">${l.dp == null ? "—" : (l.dp > 0 ? "+" : "") + l.dp + "%"}</td>
    <td class="chk"><i></i></td></tr>`;
};
const card = (b) => `<div class="card">
  <div class="hd"><b>${esc(b.name)}</b><span>${esc(b.id)} · ${b.lines.length} ขนาด${b.off ? ` · <u class="up">ต่างเกิน 5% : ${b.off} ขนาด</u>` : ` · <span class="dn">ตรงทุกขนาด</span>`}</span></div>
  <table>
    <tr class="h1"><th class="l" rowspan="2">ขนาด</th>
      <th class="g1" colspan="5">ค่าของ (วัสดุ)</th><th class="g2" colspan="5">ค่าผลิต</th><th class="g3" colspan="5">ค่าติดตั้ง</th><th class="g4" colspan="4">รวมทั้งชุด</th><th class="chk" rowspan="2">✓</th></tr>
    <tr class="h2">
      <th class="g1">ทุน</th><th class="g1">ขาย<br>ตาราง</th><th class="g1">ขาย<br>เว็บ</th><th class="g1">ต่าง</th><th class="g1">กำไร ตาราง→เว็บ</th>
      <th class="g2">ทุน</th><th class="g2">ขาย<br>ตาราง</th><th class="g2">ขาย<br>เว็บ</th><th class="g2">ต่าง</th><th class="g2">กำไร ตาราง→เว็บ</th>
      <th class="g3">ทุน</th><th class="g3">ขาย<br>ตาราง</th><th class="g3">ขาย<br>เว็บ</th><th class="g3">ต่าง</th><th class="g3">กำไร ตาราง→เว็บ</th>
      <th class="g4">ขาย<br>ตาราง</th><th class="g4">ขาย<br>เว็บ</th><th class="g4">ต่าง</th><th class="g4">ต่าง %</th></tr>
    ${b.lines.map(line).join("")}
  </table>
</div>`;

const nAll = blocks.reduce((s, b) => s + b.lines.length, 0);
const nOff = blocks.reduce((s, b) => s + b.off, 0);
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เทียบราคาขายแยกก้อน R4.1</title>
<style>
  @page { size: A4 landscape; margin: 8mm 6mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Leelawadee UI","Tahoma",sans-serif; color:#111; margin:0; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { font-size: 9.5pt; color:#555; margin-bottom: 2.5mm; }
  .card { border: 1.2pt solid #333; border-radius: 1.5mm; padding: 2mm 2.4mm; break-inside: avoid; margin-bottom: 3.5mm; }
  .hd { display:flex; justify-content:space-between; align-items:baseline; border-bottom: 1.2pt solid #333; padding-bottom:1mm; margin-bottom:1.5mm; gap:3mm; }
  .hd b { font-size: 14pt; }
  .hd span { font-size: 10pt; color:#333; text-align:right; }
  table { width:100%; border-collapse:collapse; font-size: 10pt; }
  th { font-weight:700; padding:0.8mm; white-space:nowrap; font-size:8.5pt; text-align:right; line-height:1.15; border-bottom:1pt solid #999; }
  th.l, td.l { text-align:left; }
  tr.h1 th { text-align:center; font-size:10pt; padding:1mm; border-bottom:0.8pt solid #666; }
  td { padding:1.1mm 0.9mm; text-align:right; white-space:nowrap; border-bottom:0.5pt solid #ddd; }
  td.sz { font-weight:700; font-size:10.5pt; }
  td.b { font-weight:700; }
  td.big { font-size:11.5pt; font-weight:700; }
  .sm { font-size:8pt; color:#555; font-weight:400; }
  td.pc, th .pc { font-size:8.5pt; color:#333; }
  /* แถบสีแยกก้อน */
  .g1 { background:#eaf2fd; }  th.g1 { background:#cfe0f7; }
  .g2 { background:#eaf7ed; }  th.g2 { background:#cbeacf; }
  .g3 { background:#fdf3e3; }  th.g3 { background:#f8e0b5; }
  .g4 { background:#f2eefb; }  th.g4 { background:#ded3f3; }
  /* ส่วนต่าง */
  .up { color:#c5221f; font-weight:700; }   /* เว็บแพงกว่าตาราง */
  .dn { color:#0b7a37; font-weight:700; }   /* เว็บถูกกว่าตาราง */
  .z  { color:#777; }
  .chk { width:8mm; text-align:center; }
  .chk i { display:inline-block; width:4.5mm; height:4.5mm; border:1pt solid #666; border-radius:0.6mm; background:#fff; }
  .note { font-size:9pt; color:#333; margin-top:2mm; border-top:1pt solid #666; padding-top:1.5mm; line-height:1.6; }
  .key { display:inline-block; padding:0.4mm 1.5mm; border-radius:1mm; margin-right:1mm; }
</style></head><body>
<h1>เทียบราคาขายแยกก้อน — ค่าของ · ค่าผลิต · ค่าติดตั้ง (เว็บ เทียบ ★ ตารางราคาขาย R4.1)</h1>
<div class="sub">${nAll} ขนาด · ${blocks.length} รุ่น · สีขาว ไม่มีของเสริม · ต่างเกิน 5% = ${nOff} ขนาด · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}</div>
${blocks.map(card).join("")}
<div class="note">
<span class="key g1">ค่าของ</span><span class="key g2">ค่าผลิต</span><span class="key g3">ค่าติดตั้ง</span><span class="key g4">รวมทั้งชุด</span>
&nbsp;·&nbsp; ช่อง <b>ต่าง</b> = ขายเว็บ − ขายตาราง : <span class="up">แดง = เว็บแพงกว่า</span> &nbsp; <span class="dn">เขียว = เว็บถูกกว่า</span> &nbsp; <span class="z">เทา = ต่างไม่ถึง 2%</span><br>
<b>กำไร ตาราง→เว็บ</b> = (ขาย ÷ ทุน − 1) × 100 — ทุน 100 ขาย 160 คือ <b>60%</b> (ไม่ใช่ 160%) · ตัวหลังลูกศรคือของเว็บ <span class="up">แดง = ต่างจากตารางเกิน 3 จุด%</span>
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

// ── Excel ฉบับเดียวกัน ──
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
