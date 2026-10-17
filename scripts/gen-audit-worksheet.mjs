#!/usr/bin/env node
/**
 * gen-audit-worksheet — ใบตรวจราคาให้คนตรวจมือ (พิมพ์แล้วเขียนในช่องว่าง) + ฉบับเฉลยจากเว็บ ฟอร์มเดียวกัน
 *   เจ้าของ 17 ต.ค.69: "เอาขนาดกลาง และขนาดใหญ่ (2 ขนาด) ของทุกบาน ยกเว้นหลังคา เอามาแค่หลังคาไวนิล
 *     ตรวจ 1. ถอดของว่าจำนวนเส้นถูกไหม 2. ราคาต้นทุนวัสดุ เส้น อุปกรณ์ 3. ราคาขายสรุป
 *     ทำ pdf ปริ้นให้เขาตรวจ โดยไม่ใส่ข้อมูลตัวเองเข้าไป 1 ชุด · ฟอร์มเดียวกันแต่เป็นเฉลยเวอร์ชั่นเว็บ อีก 1 ชุด"
 *   node scripts/gen-audit-worksheet.mjs --data cmp-net.json [--outdir docs]
 *     --data = ผลของ gen-r41-compare-data.mjs --stock ... (ทุน/ขาย/รายการของ ของเว็บ ราคาสโตร์จริง)
 *   ออก 2 ไฟล์: ใบตรวจราคา-ฉบับตรวจ.html (ช่องว่าง) · ใบตรวจราคา-ฉบับเฉลยเว็บ.html (ตัวเลขเว็บ) → พิมพ์เป็น PDF ด้วย Chrome
 */
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { withSpecDefaults } from "./color-compare-config.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DATA = JSON.parse(fs.readFileSync(arg("--data"), "utf8"));
const OUTDIR = arg("--outdir") || "docs";
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const money = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? num(v) : num(v, 2));
const qtyTxt = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? num(v) : num(v, 2));

// ── เลือกชุด: ทุกบาน (มีรุ่นในเว็บ + มีรายการของ) · ไม่เอาขนาดเล็กพิเศษ · หลังคาเอาเฉพาะไวนิล ──
const groups = new Map();
for (const r of DATA.rows) {
  if (!r.id || !Array.isArray(r.bom) || !r.bom.length || r.small || !r.web) continue;
  if (/^roof/.test(r.id) && r.vk !== "ไวนิล") continue;
  const k = r.id + "|" + (r.vk || "");
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const sheets = [];
for (const rows of groups.values()) {
  const s = [...rows].sort((a, b) => a.w * a.h * (a.p || 1) - b.w * b.h * (b.p || 1));
  const mid = s[Math.floor((s.length - 1) / 2)], big = s[s.length - 1];
  sheets.push({ r: mid, tag: "ขนาดกลาง" });
  if (big !== mid) sheets.push({ r: big, tag: "ขนาดใหญ่" });
}

// สเปกที่ใช้คิด — อ่านจากอินพุตตาราง + ค่าตั้งต้นของรุ่น (ให้คนตรวจถอดของจากสเปกเดียวกับเว็บ)
const specOf = (r) => {
  const p = PRODUCTS[r.id];
  const fx = FX.find((x) => x.id === r.id && (x.vk || "") === (r.vk || "") && x.w === r.w && x.h === r.h && (x.p ?? null) === (r.p ?? null));
  const inp = withSpecDefaults(p, fx?.inputs || { w: r.w, h: r.h, p: r.p || 1 });
  const out = [];
  if (inp.form) out.push(["รูปแบบ", inp.form]);
  const glass = inp.glassType || p.defGlass;
  if (p.glass && glass) out.push(["กระจก", glass]);
  if (inp.material) out.push([p.materialLabel || "วัสดุ", inp.material]);
  for (const o of p.specOpts || []) {
    const v = inp.spec?.[o.key];
    if (v == null || v === "" || !o.label) continue;
    out.push([o.label.replace(/\s*\(.*$/, ""), String(v)]);
  }
  return out;
};

const CAT = { alu: "อลูมิเนียม (เส้น)", glass: "กระจก / แผ่น", hardware: "อุปกรณ์", consum: "โครง / วัสดุอื่น", bake: "ค่าอบสี", addon: "ของเสริม" };
const ORDER = ["alu", "glass", "hardware", "consum", "bake", "addon"];
const cleanName = (n) => String(n).replace(/\s*\((อบขาว\/ดำ|อบขาว|ดำ)\)\s*$/, "");
const pct = (s, c) => (s > 0 ? Math.round(((s - c) / s) * 1000) / 10 : null);

function sheetHtml({ r, tag }, i, n, answer) {
  const p = PRODUCTS[r.id];
  const title = (p?.name || r.name) + (r.vk && !String(p?.name || "").includes(r.vk) ? " · " + r.vk : "");
  const size = `${r.w} × ${r.h} ซม.${r.p ? " · " + r.p + " บาน" : ""}`;
  const spec = specOf(r).map(([k, v]) => `<span class="sp"><b>${esc(k)}</b> ${esc(v)}</span>`).join("");
  const tgt = r.target != null ? `กำไรสุทธิเป้า ${r.target}%` + (r.targetParts ? ` (ของ/ผลิต/ติดตั้ง ${r.targetParts.join("/")}%)` : "") : "";
  const W = r.web;
  const cell = (v) => (answer ? v : "");
  let rows = "", k = 0;
  for (const cat of ORDER) {
    const L = r.bom.filter((b) => b[0] === cat);
    if (!L.length) continue;
    rows += `<tr class="gh"><td colspan="8">${CAT[cat] || cat}</td></tr>`;
    for (const [, name, code, qty, unit, unitPrice, amount, how] of L) {
      k++;
      rows += `<tr><td class="c">${k}</td><td>${esc(cleanName(name))}${answer && how ? `<div class="how">${esc(how)}</div>` : ""}</td><td class="code">${esc(code)}</td><td class="c">${esc(unit)}</td>
        <td class="n w">${cell(qtyTxt(qty))}</td><td class="n w">${cell(money(unitPrice))}</td><td class="n w">${cell(money(amount))}</td><td class="chk"></td></tr>`;
    }
  }
  // แถวว่าง ให้เขียนรายการที่เว็บขาด/เกิน
  for (let j = 0; j < 3; j++) rows += `<tr class="extra"><td class="c">+</td><td class="hint">${j === 0 ? "รายการที่ขาด / เกิน (เขียนเพิ่ม)" : ""}</td><td></td><td></td><td></td><td></td><td></td><td class="chk"></td></tr>`;
  rows += `<tr class="tot"><td colspan="6">รวมทุนวัสดุ (เส้น + กระจก + อุปกรณ์ + โครง + อบสี)</td><td class="n w">${cell(money(W.cM))}</td><td class="chk"></td></tr>`;

  const sumRow = (lbl, c, s) => `<tr><td>${lbl}</td><td class="n w">${cell(money(c))}</td><td class="n w">${cell(money(s))}</td><td class="n w">${cell(pct(s, c) != null ? pct(s, c) + "%" : "")}</td><td class="chk"></td></tr>`;
  const summary = `<table class="sum"><thead><tr><th>ก้อน</th><th class="n">ทุน (บาท)</th><th class="n">ราคาขาย (บาท)</th><th class="n">กำไร % (ขาย−ทุน)÷ขาย</th><th class="chk">✓ / ✗ หมายเหตุ</th></tr></thead><tbody>
    ${sumRow("ค่าของ (วัสดุ)", W.cM, W.sM)}${sumRow("ค่าแรงผลิต", W.cP, W.sP)}${sumRow("ค่าแรงติดตั้ง", W.cI, W.sI)}
    <tr class="tot">${sumRow("รวมทั้งชุด (กำไรสุทธิ)", W.cT, W.sT).slice(4)}</tbody></table>`;

  return `<section class="sheet">
  <header><div class="top"><span class="doc">ใบตรวจราคา คิดราคา 4.0 · ${answer ? "ฉบับเฉลย (ตัวเลขจากเว็บ)" : "ฉบับตรวจ"}</span><span class="no">ชุดที่ ${i + 1} / ${n}</span></div>
    <h1>${esc(title)} <span class="tag">${tag}</span></h1>
    <div class="meta"><span class="sp"><b>ขนาด</b> ${esc(size)}</span><span class="sp"><b>สี</b> อบขาว</span>${spec}${tgt ? `<span class="sp"><b>เป้า</b> ${esc(tgt)}</span>` : ""}</div>
    <div class="who">ผู้ตรวจ ...................................... วันที่ ........................</div></header>
  <h2>1–2 · ถอดของ (จำนวน) และทุนวัสดุ</h2>
  <p class="note">${answer ? "ตัวเลขจากเว็บ · บรรทัดเส้นอลูมีวิธีนับเส้นเขียนไว้ใต้ชื่อ" : "เขียนจำนวนเส้น/ชิ้น ราคาต่อหน่วย และรวมเงิน · ถ้าเว็บขาดหรือเกินรายการไหน เขียนในแถว +"}</p>
  <table class="bom"><thead><tr><th class="c">#</th><th>รายการ</th><th>รหัส</th><th class="c">หน่วย</th><th class="n">จำนวน</th><th class="n">ราคา/หน่วย</th><th class="n">รวม (บาท)</th><th class="chk">✓ / ✗ หมายเหตุ</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <h2>3 · ราคาขายสรุป</h2>
  ${summary}
</section>`;
}

const css = `
@page { size: A4 portrait; margin: 9mm 9mm 10mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #15202e; background: #fff; font: 8.8pt/1.35 "Leelawadee UI", "IBM Plex Sans Thai", Tahoma, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { break-after: page; }
.sheet:last-child { break-after: auto; }
header .top { display: flex; justify-content: space-between; font-size: 8pt; color: #4b5869; border-bottom: 1px solid #c9d1dd; padding-bottom: 2px; }
.doc { font-weight: 700; letter-spacing: .02em; }
h1 { font-size: 14pt; margin: 4px 0 3px; }
.tag { font-size: 9pt; font-weight: 600; color: #fff; background: #3b5b8c; border-radius: 3px; padding: 1px 6px; vertical-align: middle; }
.meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 8.4pt; }
.sp b { color: #4b5869; font-weight: 600; margin-right: 2px; }
.who { margin-top: 4px; font-size: 8.6pt; }
h2 { font-size: 10.5pt; margin: 8px 0 2px; padding-bottom: 1px; border-bottom: 2px solid #15202e; break-after: avoid; }
.note { margin: 0 0 3px; font-size: 7.8pt; color: #4b5869; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
thead { display: table-header-group; }
th, td { border: 1px solid #b9c3d1; padding: 1px 4px; vertical-align: top; }
th { background: #e9eef5; font-size: 7.9pt; text-align: left; }
.bom td { height: 6.8mm; line-height: 1.2; }   /* สูงเท่ากันทั้ง 2 ฉบับ → หน้าตรงกัน */
td.c, th.c { text-align: center; } td.n, th.n { text-align: right; white-space: nowrap; }
td.w { min-width: 19mm; } th.chk, td.chk { width: 30mm; }
td.code { font-size: 7.8pt; white-space: nowrap; color: #34425a; }
.how { font-size: 6.4pt; color: #5b6778; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 92mm; }
tr { break-inside: avoid; }
tr.gh td { background: #f1f4f9; font-weight: 700; height: auto; font-size: 8.2pt; }
tr.extra td { background: #fcfcfd; } td.hint { font-size: 7.4pt; color: #8a95a5; }
tr.tot td { font-weight: 700; background: #f1f4f9; }
.sum td { height: 7.5mm; } .sum { break-inside: avoid; }
`;

for (const answer of [false, true]) {
  const name = answer ? "ใบตรวจราคา-ฉบับเฉลยเว็บ" : "ใบตรวจราคา-ฉบับตรวจ";
  const body = sheets.map((s, i) => sheetHtml(s, i, sheets.length, answer)).join("\n");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${css}</style></head><body>${body}</body></html>`;
  fs.writeFileSync(`${OUTDIR}/${name}.html`, html);
  console.log(`${OUTDIR}/${name}.html · ${sheets.length} ชุด`);
}
