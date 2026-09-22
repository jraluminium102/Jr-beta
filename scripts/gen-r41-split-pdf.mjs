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
const OVERHEAD = 30;                       // ค่าดำเนินการ % ตามหัวไฟล์ R4.1
/** กำไรขั้นต้นของก้อน = (ขาย − ทุน) ÷ ขาย × 100 — เลขชุด "ของ/ผลิต/ติดตั้ง 63/65/62%" ในไฟล์ */
const gross = (cost, sell) => (sell > 0 && cost > 0 ? Math.round((1 - cost / sell) * 1000) / 10 : null);
/** กำไรสุทธิ = 100/(100+ค่าดำเนินการ) − ทุน/ขาย — ตรวจแล้วตรงกับ "กำไรสุทธิ 40%" ของ SMS ในไฟล์ */
const net = (cost, sell) => (sell > 0 && cost > 0 ? Math.round((100 / (100 + OVERHEAD) - cost / sell) * 1000) / 10 : null);
/** ส่วนต่างเป็น "จุด %" */
const dPt = (a, b) => (a == null || b == null ? null : Math.round((b - a) * 10) / 10);
const dTxt = (d) => (d == null ? "" : ` <b class="${Math.abs(d) <= 2 ? "z" : d > 0 ? "dn" : "up"}">(${d > 0 ? "+" : ""}${d} จุด)</b>`);
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
  const e = byProd.get(r.id) || { name: p.name || r.head, id: r.id, lines: [] };
  e.lines.push({ size: `${r.w}×${r.h}`, panels: r.p || 1, vk: r.vk || "", tab, web,
    dp: tab.sT > 0 ? Math.round(((web.sT - tab.sT) / tab.sT) * 1000) / 10 : null });
  byProd.set(r.id, e);
}
const blocks = [...byProd.values()].map((b) => {
  const S = (src, k) => b.lines.reduce((s, l) => s + (l[src][k] || 0), 0);
  b.m = {
    tab: { mat: gross(S("tab", "cM"), S("tab", "sM")), prod: gross(S("tab", "cP"), S("tab", "sP")),
           inst: gross(S("tab", "cI"), S("tab", "sI")), net: net(S("tab", "cT"), S("tab", "sT")) },
    web: { mat: gross(S("web", "cM"), S("web", "sM")), prod: gross(S("web", "cP"), S("web", "sP")),
           inst: gross(S("web", "cI"), S("web", "sI")), net: net(S("web", "cT"), S("web", "sT")) },
  };
  b.off = b.lines.filter((l) => l.dp != null && Math.abs(l.dp) > 5).length;
  return b;
}).sort((a, b) => (b.off - a.off) || (b.lines.length - a.lines.length));

/** ฟอร์มเดียวกับ ★ ตารางราคาขาย R4.1 — ตารางเดียว คอลัมน์เรียงเหมือนไฟล์
 *  ค่าของ (ทุน|ขาย) · ค่าแรงผลิต (ทุน|ขาย) · ค่าแรงติดตั้ง (ทุน|ขาย) · รวมทุน · กำไรสุทธิ(บาท) · ★ ราคาขายรวมทั้งชุด · กำไรสุทธิ %
 *  แต่ละขนาดมี 2 บรรทัด: ตาราง R4.1 / เว็บ (บรรทัดเว็บตัวหนา + ช่องที่ต่างเป็นสีแดง-เขียว)
 */
const netBaht = (cost, sell) => (sell > 0 ? Math.round(sell / (1 + OVERHEAD / 100) - cost) : null);
const cell = (val, t, g, bold) => {
  const d = diff(val, t);
  const cls = bold && d.cls !== "z" ? d.cls : "";
  return `<td class="${g} ${bold ? "b" : ""} ${cls}">${baht(val)}</td>`;
};
const pair = (l, ck, sk, g) => `${cell(l.tab[ck], l.tab[ck], g, false)}${cell(l.tab[sk], l.tab[sk], g, false)}`;
const rowFor = (l, src) => {
  const o = l[src], t = l.tab, isW = src === "web";
  const C = (k, g) => cell(o[k], t[k], g, isW);
  const cT = o.cM + o.cP + o.cI;
  const nb = netBaht(cT, o.sT), np = o.sT > 0 ? Math.round((100 / (100 + OVERHEAD) - cT / o.sT) * 1000) / 10 : null;
  const tnb = netBaht(t.cM + t.cP + t.cI, t.sT);
  const tnp = t.sT > 0 ? Math.round((100 / (100 + OVERHEAD) - (t.cM + t.cP + t.cI) / t.sT) * 1000) / 10 : null;
  const dNb = diff(nb, tnb), dSell = diff(o.sT, t.sT);
  const dNp = isW && tnp != null && np != null ? Math.round((np - tnp) * 10) / 10 : null;
  return `<tr class="${isW ? "web" : "tab"}">
    ${src === "tab" ? `<td class="l sz" rowspan="2">${esc(l.size)}<span class="sm"> · ${l.panels} บาน${l.vk ? " · " + esc(l.vk) : ""}</span></td>` : ""}
    <td class="l src">${isW ? "เว็บ" : "ตาราง"}</td>
    ${C("cM", "g1")}${C("sM", "g1")}${C("cP", "g2")}${C("sP", "g2")}${C("cI", "g3")}${C("sI", "g3")}
    <td class="g4 ${isW && diff(cT, t.cM + t.cP + t.cI).cls !== "z" ? diff(cT, t.cM + t.cP + t.cI).cls : ""} ${isW ? "b" : ""}">${baht(cT)}</td>
    <td class="g4 ${isW && dNb.cls !== "z" ? dNb.cls : ""} ${isW ? "b" : ""}">${baht(nb)}</td>
    <td class="g5 ${isW && dSell.cls !== "z" ? dSell.cls : ""} ${isW ? "b big" : ""}">${baht(o.sT)}</td>
    <td class="g5 ${isW ? "b" : ""}">${np == null ? "—" : np + "%"}${isW && dNp != null && Math.abs(dNp) > 2 ? ` <b class="${dNp > 0 ? "dn" : "up"}">(${dNp > 0 ? "+" : ""}${dNp})</b>` : ""}</td>
    ${src === "tab" ? `<td class="chk" rowspan="2"><i></i></td>` : ""}</tr>`;
};
const tbl = (b) => `<table><thead>
  <tr class="h1"><th class="l" rowspan="2">ขนาด (ซม.)</th><th class="l" rowspan="2"></th>
    <th class="g1" colspan="2">ค่าของ (อลู+กระจก+อุปกรณ์)</th><th class="g2" colspan="2">ค่าแรงผลิต</th><th class="g3" colspan="2">ค่าแรงติดตั้ง</th>
    <th class="g4" rowspan="2">รวมทุน</th><th class="g4" rowspan="2">กำไรสุทธิ<br>(บาท)</th>
    <th class="g5" rowspan="2">★ ราคาขาย<br>รวมทั้งชุด</th><th class="g5" rowspan="2">กำไร<br>สุทธิ %</th><th class="chk" rowspan="2">✓</th></tr>
  <tr class="h2"><th class="g1">ทุน</th><th class="g1">ขาย</th><th class="g2">ทุน</th><th class="g2">ขาย</th><th class="g3">ทุน</th><th class="g3">ขาย</th></tr>
</thead>${b.lines.map((l) => rowFor(l, "tab") + rowFor(l, "web")).join("")}</table>`;
const card = (b) => `<div class="card">
  <div class="hd"><b>${esc(b.name)}</b><span>${esc(b.id)} · ${b.lines.length} ขนาด${b.off ? ` · <u class="up">ขายรวมต่างเกิน 5% : ${b.off} ขนาด</u>` : ` · <span class="dn">ตรงทุกขนาด</span>`}</span></div>
  <div class="mg">
    <div><span class="tag t1">ตาราง R4.1</span> กำไรสุทธิ <b>${gp(b.m.tab.net)}</b> · ของ/ผลิต/ติดตั้ง <b>${gp(b.m.tab.mat)} / ${gp(b.m.tab.prod)} / ${gp(b.m.tab.inst)}</b></div>
    <div><span class="tag t2">เว็บตอนนี้</span> กำไรสุทธิ <b>${gp(b.m.web.net)}</b>${dTxt(dPt(b.m.tab.net, b.m.web.net))} · ของ/ผลิต/ติดตั้ง <b>${gp(b.m.web.mat)}</b>${dTxt(dPt(b.m.tab.mat, b.m.web.mat))} / <b>${gp(b.m.web.prod)}</b>${dTxt(dPt(b.m.tab.prod, b.m.web.prod))} / <b>${gp(b.m.web.inst)}</b>${dTxt(dPt(b.m.tab.inst, b.m.web.inst))}</div>
  </div>
  ${tbl(b)}
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
  .card { border: 1.2pt solid #333; border-radius: 1.5mm; padding: 2mm 2.4mm; margin-bottom: 3.5mm; break-inside: auto; }
  tr, .ttl { break-inside: avoid; }
  .ttl { break-after: avoid; }
  .hd { break-after: avoid; }
  .hd { display:flex; justify-content:space-between; align-items:baseline; border-bottom: 1.2pt solid #333; padding-bottom:1mm; margin-bottom:1.5mm; gap:3mm; }
  .hd b { font-size: 14pt; }
  .hd span { font-size: 10pt; color:#333; text-align:right; }
  table { width:100%; border-collapse:collapse; font-size: 10pt; }
  thead { display: table-header-group; }
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
  .g4 { background:#f5f5f5; }  th.g4 { background:#e0e0e0; }
  .g5 { background:#f2eefb; }  th.g5 { background:#ded3f3; }
  tr.web td { border-bottom:1pt solid #999; }
  tr.tab td { border-bottom:0.3pt dotted #ccc; }
  td.src { font-size:8.5pt; color:#444; font-weight:700; width:11mm; }
  tr.web td.src { color:#0b57d0; }
  /* ส่วนต่าง */
  .up { color:#c5221f; font-weight:700; }   /* เว็บแพงกว่าตาราง */
  .dn { color:#0b7a37; font-weight:700; }   /* เว็บถูกกว่าตาราง */
  .z  { color:#777; }
  .chk { width:8mm; text-align:center; }
  .chk i { display:inline-block; width:4.5mm; height:4.5mm; border:1pt solid #666; border-radius:0.6mm; background:#fff; }
  .ttl { font-size:10.5pt; font-weight:700; margin:2mm 0 1mm; padding:1mm 2mm; border-radius:1mm; display:block; }
  .ttl.cost { background:#3c4043; color:#fff; }
  .ttl.sell { background:#b06000; color:#fff; }
  .mg { font-size:10pt; line-height:1.7; background:#fafafa; border:0.8pt solid #ccc; border-radius:1mm; padding:1.2mm 2mm; margin-bottom:0.5mm; }
  .tag { display:inline-block; min-width:22mm; text-align:center; font-size:8.5pt; font-weight:700; padding:0.3mm 1.5mm; border-radius:1mm; margin-right:1.5mm; }
  .tag.t1 { background:#ded3f3; }
  .tag.t2 { background:#cfe0f7; }
  .def { font-size:9.5pt; background:#fffbe6; border:0.8pt solid #e0c97a; border-radius:1mm; padding:1.5mm 2.5mm; margin-bottom:3mm; line-height:1.6; }
  .wb { color:#0b57d0; }
  .note { font-size:9pt; color:#333; margin-top:2mm; border-top:1pt solid #666; padding-top:1.5mm; line-height:1.6; }
  .key { display:inline-block; padding:0.4mm 1.5mm; border-radius:1mm; margin-right:1mm; }
</style></head><body>
<h1>เทียบราคาขายแยกก้อน — ค่าของ · ค่าผลิต · ค่าติดตั้ง (เว็บ เทียบ ★ ตารางราคาขาย R4.1)</h1>
<div class="sub">${nAll} ขนาด · ${blocks.length} รุ่น · สีขาว ไม่มีของเสริม · คอลัมน์เรียงเหมือน ★ ตารางราคาขาย R4.1 · แต่ละขนาด 2 บรรทัด: <b>ตาราง</b> = เลขในไฟล์ · <b class="wb">เว็บ</b> = เครื่องคิดราคาตอนนี้ (<span class="up">แดง = เว็บสูงกว่า</span> · <span class="dn">เขียว = เว็บต่ำกว่า</span>) · ต่างเกิน 5% = ${nOff} ขนาด · ออกเมื่อ ${new Date().toLocaleDateString("th-TH")}</div>
<div class="def"><b>กำไรสุทธิ (บาท)</b> = ★ ราคาขายรวมทั้งชุด ÷ 1.3 − รวมทุน &nbsp;(หักค่าดำเนินการ 30% ออกจากราคาขายก่อน แล้วค่อยลบทุน — ช่องเดียวกับ "หักค่าดำเนินการแล้ว" ในไฟล์) &nbsp;·&nbsp; <b>กำไรสุทธิ %</b> = กำไรสุทธิ (บาท) ÷ ราคาขายรวมทั้งชุด &nbsp;·&nbsp; <b>ของ / ผลิต / ติดตั้ง %</b> = (ขาย − ทุน) ÷ ขาย ของก้อนนั้น รวมทุกขนาดของรุ่น</div>
<div class="card sum">
  <div class="hd"><b>สรุปต่อรุ่น</b><span>ดูก่อนว่าต้องเปิดหน้าไหน · เรียงรุ่นที่ต่างเยอะขึ้นก่อน</span></div>
  <table><thead><tr class="h1"><th class="l">รุ่น</th><th>ขนาด</th><th class="g1">ทุนค่าของ<br>เว็บ − ตาราง</th><th class="g2">ทุนค่าผลิต<br>เว็บ − ตาราง</th><th class="g3">ทุนค่าติดตั้ง<br>เว็บ − ตาราง</th><th class="g4">ขายรวม<br>เว็บ − ตาราง</th><th class="g4">กำไรสุทธิ<br>ตาราง → เว็บ</th><th class="g4">ขายรวมต่าง<br>เกิน 5%</th></tr></thead>
  ${blocks.map((b) => {
    const avg = (k) => { const v = b.lines.filter((l) => (l.tab[k] || 0) > 0).map((l) => ((l.web[k] || 0) - l.tab[k]) / l.tab[k] * 100); return v.length ? Math.round(v.reduce((a, c) => a + c, 0) / v.length * 10) / 10 : null; };
    const cell = (v, g) => `<td class="${g} ${v == null ? "z" : Math.abs(v) <= 2 ? "z" : v > 0 ? "up" : "dn"}">${v == null ? "—" : (v > 0 ? "+" : "") + v + "%"}</td>`;
    return `<tr><td class="l sz">${esc(b.name)}<span class="sm"> · ${esc(b.id)}</span></td><td>${b.lines.length}</td>${cell(avg("cM"), "g1")}${cell(avg("cP"), "g2")}${cell(avg("cI"), "g3")}${cell(avg("sT"), "g4")}<td class="g4">${gp(b.m.tab.net)} → <b class="${(() => { const d = dPt(b.m.tab.net, b.m.web.net); return d == null || Math.abs(d) <= 2 ? "z" : d > 0 ? "dn" : "up"; })()}">${gp(b.m.web.net)}</b></td><td class="g4 ${b.off ? "up" : "z"}">${b.off || "—"}</td></tr>`;
  }).join("")}</table>
</div>
${blocks.map(card).join("")}
<div class="note">
<span class="key g1">ค่าของ</span><span class="key g2">ค่าผลิต</span><span class="key g3">ค่าติดตั้ง</span><span class="key g4">รวมทั้งชุด</span>
&nbsp;·&nbsp; ช่อง <b>ต่าง</b> = ขายเว็บ − ขายตาราง : <span class="up">แดง = เว็บแพงกว่า</span> &nbsp; <span class="dn">เขียว = เว็บถูกกว่า</span> &nbsp; <span class="z">เทา = ต่างไม่ถึง 2%</span><br>
<b>กำไรสุทธิ</b> = 100 ÷ (100 + ค่าดำเนินการ 30) − ทุน ÷ ขาย · <b>ของ/ผลิต/ติดตั้ง</b> = กำไรขั้นต้นของก้อนนั้น = (ขาย − ทุน) ÷ ขาย — ชุดเลขเดียวกับที่ไฟล์ R4.1 เขียนไว้หัวรุ่น (เช่น SMS 40% · 63/65/62%)<br><b>(+n จุด)</b> = เว็บกำไรมากกว่าตาราง n จุด% · <span class="up">แดง = เว็บกำไรน้อยกว่า</span><br><b>กำไร ตาราง→เว็บ</b> = (ขาย ÷ ทุน − 1) × 100 — ทุน 100 ขาย 160 คือ <b>60%</b> (ไม่ใช่ 160%) · ตัวหลังลูกศรคือของเว็บ <span class="up">แดง = ต่างจากตารางเกิน 3 จุด%</span>
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
