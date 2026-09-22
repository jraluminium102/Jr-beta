#!/usr/bin/env node
/**
 * gen-color-panel-pdf — เทียบค่าสี "บานสำเร็จ" เลย์เอาท์ตามไฟล์ เทียบค่าอบสี.xlsx ของเจ้าของ
 *   node scripts/gen-color-panel-pdf.mjs ["C:/.../เทียบค่าอบสี.xlsx"]
 *   ออก: docs/เทียบค่าสี-บานสำเร็จ.pdf   (A4 แนวนอน · ตารางยาวตารางเดียว · มีช่อง ✓ ให้ติ๊ก)
 *
 * เจ้าของสั่ง 22 ก.ย.69 "ออกแบบเลย์เอาท์คล้ายไฟล์ เทียบค่าอบสี.xlsx"
 *   คอลัมน์ตามไฟล์ : สินค้า · ขนาด · บาน · น้ำหนักอลู · อลูที่ใช้ · ประเภทสี · สี · เรต บาท/กก.
 *                   · ทุนสีที่เพิ่ม · ค่าสีที่บวกในราคาขาย (เว็บ|ไฟล์|ต่าง) · ราคาขายรวม (เว็บ|ไฟล์|ต่าง)
 *   ต่างจากไฟล์ตรงที่คู่เทียบเป็น "เว็บตอนนี้ ↔ เลข R4.0 ในไฟล์" (ไฟล์เดิมเทียบ R4.0 ↔ R3.9)
 */
import fs from "node:fs";
import { chromium } from "playwright";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const SRC = process.argv.find((a) => a.endsWith(".xlsx")) || "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
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
/** ชื่อสีในไฟล์ → [คีย์ราคาสี, กองค่าอบ, ชื่อสีที่พิมพ์, ประเภทสี] */
const COLOF = (s) => {
  const t = String(s).replace(/\s+/g, "");
  if (/มะฮอกกานี/.test(t)) return ["wood_maho", "woodStock", "มะฮอกกานี", "ลายไม้สต็อก"];
  if (/ไวท์โอ/.test(t)) return ["wood_whiteoak", "woodStock", "ไวท์โอ็ค", "ลายไม้สต็อก"];
  if (/ลายไม้อบพิเศษ|สีลายไม้อบพิเศษ/.test(t)) return ["special", "woodSpecial", "สีลายไม้อบพิเศษ", "ลายไม้อบพิเศษ"];
  if (/อบพิเศษ|สีพิเศษ/.test(t)) return ["special", "special", "สีอบพิเศษ", "อบสีพิเศษ"];
  if (/ลายไม้/.test(t)) return ["wood_teak", "woodStock", "สักทอง", "ลายไม้สต็อก"];
  return null;
};

const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) {
    cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), kgFile: num(cell(r, "D")), spec: cell(r, "E"), rows: [] };
    items.push(cur); continue;
  }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ type: f, color: cell(r, "G"), rate: num(cell(r, "H")),
    costAdd: num(cell(r, "I")), sellAdd: num(cell(r, "J")), total: num(cell(r, "M")) });
}

const baht = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pct = (web, file) => (typeof file === "number" && Math.abs(file) > 0.5 && typeof web === "number"
  ? Math.round(((web - file) / file) * 1000) / 10 : null);
const pTxt = (p) => (p == null ? "—" : (p > 0 ? "+" : "") + p + "%");
const pCls = (p) => (p == null ? "z" : Math.abs(p) <= 2 ? "z" : Math.abs(p) <= 5 ? (p > 0 ? "up s" : "dn s") : (p > 0 ? "up" : "dn"));

const blocks = []; let nOff = 0, nRow = 0;
for (const it of items) {
  const id = IDOF[it.name], p = id && PRODUCTS[id];
  if (!p) continue;
  const [w, h] = String(it.size).split(/\s*x\s*/i).map(Number);
  const pn = Number(it.panels) || 1;
  const base = { w, h, p: pn, form: p.defForm, material: id === "roof" ? "ไวนิล" : p.defMaterial, glassType: p.defGlass, spec: {}, addons: {} };
  let wh; try { wh = computeCost(PB, p, { ...base, color: "white", colorKey: "white" }); } catch { continue; }
  const baseSell = wh.sell?.withInstall || 0;
  const lines = [{ first: true, type: "มาตรฐาน", color: "อบขาว / ดำ", totalWeb: baseSell }];
  for (const cr of it.rows) {
    const m = COLOF(cr.color);
    if (!m) { lines.push({ na: true, type: cr.type, color: cr.color }); continue; }
    const [ck, bake, label, kind] = m;
    let c; try { c = computeCost(PB, p, { ...base, color: bake, colorKey: ck }); } catch { continue; }
    const totalWeb = c.sell?.withInstall || 0;
    const sellAddWeb = totalWeb - baseSell;
    const pTotal = pct(totalWeb, cr.total);
    if (pTotal != null && Math.abs(pTotal) > 5) nOff++;
    nRow++;
    lines.push({
      type: kind, color: label,
      rate: PB.BAKE?.[bake] ?? null, kgBake: Math.round((c.aluKg || 0) * 10) / 10,
      costAddWeb: c.cost.total - wh.cost.total, costAddFile: cr.costAdd,
      sellAddWeb, sellAddFile: cr.sellAdd, pSell: pct(sellAddWeb, cr.sellAdd),
      totalWeb, totalFile: cr.total, pTotal,
    });
  }
  // ฐานของไฟล์ = ราคาขายรวม − ค่าสีที่บวก (ไฟล์ไม่มีแถวฐานให้ตรง ๆ) → ใช้เช็คว่าที่ต่างเป็นเพราะฐานหรือเพราะค่าสี
  const ref = lines.find((l) => !l.first && !l.na && typeof l.totalFile === "number" && typeof l.sellAddFile === "number");
  const fileBase = ref ? ref.totalFile - ref.sellAddFile : null;
  lines[0].totalFile = fileBase;
  lines[0].pTotal = pct(baseSell, fileBase);
  blocks.push({ ...it, id, kgWeb: Math.round((wh.weight?.alu || wh.aluKg || 0) * 10) / 10, fileBase, lines });
}

const rowHtml = (b, l, i) => {
  const head = i === 0
    ? `<td class="l pname" rowspan="${b.lines.length}"><b>${esc(b.name)}</b>
        <div class="sm">${esc(b.size)} ซม. · ${esc(b.panels)} บาน</div>
        <div class="sm">น้ำหนักอลู <b>${b.kgWeb || "—"}</b> กก.${
          b.kgFile && b.kgWeb && Math.abs(b.kgWeb - b.kgFile) / b.kgFile > 0.03
            ? ` <span class="up">(ไฟล์ ${b.kgFile})</span>` : ""}</div>
        ${b.spec ? `<div class="sm">${esc(b.spec)}</div>` : ""}</td>`
    : "";
  if (l.na)
    return `<tr class="na">${head}<td class="l">${esc(l.type)}</td><td class="l">${esc(l.color)}</td>
      <td colspan="9" class="l">— ไฟล์ระบุว่ารุ่นนี้ไม่มีสีนี้ขาย —</td><td class="chk"><i></i></td></tr>`;
  if (l.first)
    return `<tr class="base">${head}<td class="l">${esc(l.type)}</td><td class="l">${esc(l.color)}</td><td>—</td>
      <td class="c1">—</td><td class="c1">—</td>
      <td class="c2" colspan="3">ฐาน (ไม่มีค่าสีบวกเพิ่ม)</td>
      <td class="c3 b big">${baht(l.totalWeb)}</td><td class="c3">${baht(l.totalFile)}</td><td class="c3 ${pCls(l.pTotal)}">${pTxt(l.pTotal)}</td>
      <td class="chk"><i></i></td></tr>`;
  return `<tr>${head}
    <td class="l">${esc(l.type)}</td><td class="l nm">${esc(l.color)}</td><td>${l.rate ?? "—"}</td>
    <td class="c1">${l.kgBake || "—"}</td><td class="c1">${baht(l.costAddWeb)}</td>
    <td class="c2 b">${baht(l.sellAddWeb)}</td><td class="c2">${baht(l.sellAddFile)}</td><td class="c2 ${pCls(l.pSell)}">${pTxt(l.pSell)}</td>
    <td class="c3 b big">${baht(l.totalWeb)}</td><td class="c3">${baht(l.totalFile)}</td><td class="c3 ${pCls(l.pTotal)}">${pTxt(l.pTotal)}</td>
    <td class="chk"><i></i></td></tr>`;
};

const baseOff = blocks.filter((b) => b.lines[0].pTotal != null && Math.abs(b.lines[0].pTotal) > 5);
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เทียบค่าสี บานสำเร็จ</title>
<style>
  @page { size: A4 landscape; margin: 8mm 7mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Leelawadee UI","Tahoma",sans-serif; color:#111; margin:0; }
  h1 { font-size: 15pt; margin: 0 0 1mm; }
  .sub { font-size: 9.5pt; color:#555; margin-bottom: 2mm; }
  .sum { font-size:9.5pt; background:#eef4fd; border:0.9pt solid #9dbde8; border-radius:1mm; padding:1.4mm 2.6mm; margin-bottom:2mm; line-height:1.55; }
  .def { font-size:9.5pt; background:#fffbe6; border:0.9pt solid #d9bf6a; border-radius:1mm; padding:1.6mm 2.6mm; margin-bottom:2.5mm; line-height:1.65; }
  table { width:100%; border-collapse:collapse; font-size: 10.5pt; }
  thead { display: table-header-group; }
  th { font-weight:700; padding:1.1mm 1mm; font-size:9pt; text-align:right; white-space:nowrap; line-height:1.2; border-bottom:1pt solid #555; }
  tr.g th { text-align:center; font-size:9.5pt; border-bottom:0.8pt solid #999; }
  th.l, td.l { text-align:left; }
  td { padding:1.2mm 1mm; text-align:right; white-space:nowrap; border-bottom:0.5pt solid #ddd; }
  tr { break-inside: avoid; }
  td.pname { border-top:1.3pt solid #222; border-bottom:1.3pt solid #222; background:#f6f6f6;
             font-size:11.5pt; padding:1.5mm 2.5mm 1.5mm 1mm; vertical-align:top; width:52mm; }
  tr.base td { background:#efefef; }
  tr.base td.c1, tr.base td.c2, tr.base td.c3 { background:#e8e8e8; color:#555; }
  tr.na td { color:#888; font-style:italic; background:#fafafa; }
  td.b { font-weight:700; }
  td.big { font-size:11.5pt; font-weight:700; }
  td.nm { font-weight:600; }
  .sm { font-size:8.5pt; color:#555; font-weight:400; white-space:normal; line-height:1.35; }
  td.c1, th.c1 { background:#eaf2fd; }  tr.g th.c1 { background:#c6dcf7; }
  td.c2, th.c2 { background:#eaf7ee; }  tr.g th.c2 { background:#c4e8cd; }
  td.c3, th.c3 { background:#f4eefc; }  tr.g th.c3 { background:#dccff2; }
  .up { color:#c5221f; font-weight:700; }
  .dn { color:#0b7a37; font-weight:700; }
  .up.s, .dn.s { font-weight:600; }
  .z  { color:#888; }
  .chk { width:8mm; text-align:center; }
  .chk i { display:inline-block; width:4.6mm; height:4.6mm; border:1pt solid #666; border-radius:0.6mm; background:#fff; }
  .note { font-size:9pt; color:#333; margin-top:2.5mm; border-top:1pt solid #666; padding-top:1.5mm; line-height:1.6; }
</style></head><body>
<h1>เทียบค่าสี — บานสำเร็จ &nbsp;<span style="font-size:11pt;font-weight:400;color:#555">เว็บตอนนี้ เทียบ ไฟล์ เทียบค่าอบสี.xlsx</span></h1>
<div class="sub">${blocks.length} สินค้า · ${nRow} แถวสี · ขนาด / จำนวนบาน / ราคาอ้างอิง = ตามไฟล์ของเจ้าของทุกตัว · ทุกราคาคือ “ราคาขายรวมติดตั้ง” · ต่างเกิน 5% = ${nOff} แถว · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}</div>
<div class="sum"><b>ราคาฐาน (อบขาว/ดำ) ตรงกับไฟล์ ${blocks.length - baseOff.length}/${blocks.length} รุ่น</b> — ที่เหลือฐานเองก็ต่าง จึงต้องดูฐานก่อนค่าสี : ${baseOff.map((b) => esc(b.name) + " " + pTxt(b.lines[0].pTotal)).join(" · ") || "ไม่มี"}</div>
<div class="def">
<b>แถวแรกของทุกสินค้า = สีอบขาว/ดำ</b> (ราคามาตรฐาน) — ค่าสีของแถวอื่นคิดจาก “ราคาขายสีนั้น − ราคาขายแถวแรก”<br>
<b>ทุนสีที่เพิ่ม</b> = เงินที่เราจ่ายร้านเพิ่ม (ค่าอบ × กก. + ค่าเปิดตู้อบ หรือส่วนต่างเส้นสีสำเร็จที่แพงกว่า) &nbsp;·&nbsp;
<b>กก. ที่คิดค่าอบ</b> = น้ำหนักที่เข้ากองค่าอบจริง (ลายไม้สต็อก = 0 เพราะซื้อเส้นสีสำเร็จมาแล้ว) &nbsp;·&nbsp;
<b>ช่อง “ไฟล์”</b> = คอลัมน์ R4.0 ในไฟล์เจ้าของ<br>
<b>ต่าง</b> : <span class="up">แดง = เว็บแพงกว่าไฟล์</span> &nbsp; <span class="dn">เขียว = เว็บถูกกว่าไฟล์</span> &nbsp; <span class="z">เทา = ต่างไม่เกิน 2% (ถือว่าตรง)</span> &nbsp; ตัวเข้ม = ต่างเกิน 5%
</div>
<table><thead>
  <tr class="g">
    <th class="l" rowspan="2">สินค้า · ขนาด · น้ำหนักอลู</th>
    <th class="l" rowspan="2">ประเภทสี</th><th class="l" rowspan="2">สี</th><th rowspan="2">เรต<br>บาท/กก.</th>
    <th class="c1" colspan="2">ทุนสีที่เพิ่ม (เราจ่ายร้าน)</th>
    <th class="c2" colspan="3">ค่าสีที่บวกในราคาขาย = ลูกค้าจ่ายเพิ่ม</th>
    <th class="c3" colspan="3">★ ราคาขายรวมทั้งชุด</th>
    <th class="chk" rowspan="2">✓</th></tr>
  <tr>
    <th class="c1">กก.ที่คิดค่าอบ</th><th class="c1">ทุนเพิ่ม</th>
    <th class="c2">เว็บ</th><th class="c2">ไฟล์</th><th class="c2">ต่าง</th>
    <th class="c3">เว็บ</th><th class="c3">ไฟล์</th><th class="c3">ต่าง</th></tr>
</thead><tbody>
${blocks.map((b) => b.lines.map((l, i) => rowHtml(b, l, i)).join("")).join("")}
</tbody></table>
<div class="note">เลขช่อง “ไฟล์” มาจากไฟล์ เทียบค่าอบสี.xlsx ซึ่งทำไว้ก่อนพอร์ตราคาไฟล์รวม v1 (16 ก.ย.69) และก่อนจูน % กำไรค่าของให้ชนตาราง R4.1 (21 ก.ย.69) — แถวที่ต่างจึงคือของที่เปลี่ยนไปตั้งแต่ตอนนั้น ไม่ใช่เว็บคิดผิด</div>
</body></html>`;

fs.mkdirSync("docs", { recursive: true });
const tmp = "docs/_color-panel.html";
fs.writeFileSync(tmp, html, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file:///" + process.cwd().replace(/\\/g, "/") + "/" + tmp, { waitUntil: "load" });
await page.pdf({
  path: OUT, format: "A4", landscape: true, printBackground: true,
  margin: { top: "8mm", bottom: "10mm", left: "7mm", right: "7mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8pt;color:#666;width:100%;text-align:center;font-family:Tahoma">เทียบค่าสี — บานสำเร็จ · หน้า <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
if (!process.argv.includes("--keep-html")) fs.unlinkSync(tmp);
console.log(OUT, "· สินค้า", blocks.length, "· แถวสี", nRow, "· ต่างเกิน 5%", nOff);
