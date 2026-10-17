#!/usr/bin/env node
/**
 * gen-audit-worksheet — ใบตรวจราคาให้คนตรวจมือ (พิมพ์แล้วเขียนในช่องว่าง) + ฉบับเฉลยจากเว็บ ฟอร์มเดียวกัน
 *   เจ้าของ 17 ต.ค.69: "เอาขนาดกลาง และขนาดใหญ่ (2 ขนาด) ของทุกบาน ยกเว้นหลังคา เอามาแค่หลังคาไวนิล
 *     ตรวจ 1. ถอดของว่าจำนวนเส้นถูกไหม 2. ราคาต้นทุนวัสดุ เส้น อุปกรณ์ 3. ราคาขายสรุป
 *     ทำ pdf ปริ้นให้เขาตรวจ โดยไม่ใส่ข้อมูลตัวเองเข้าไป 1 ชุด · ฟอร์มเดียวกันแต่เป็นเฉลยเวอร์ชั่นเว็บ อีก 1 ชุด"
 *   รอบ 2 (17 ต.ค.69): "1 แผ่นคืองาน 1 ชุด เปลืองกระดาษมาก อันไหนฝืนอยู่หน้าเดียวกันได้ก็เอาหน้าเดียวกัน · ไม่เอา shower"
 *     → 1 บาน = 1 ตาราง (ขนาดกลาง + ขนาดใหญ่ คู่กันในตารางเดียว) · ต่อกันหลายบานในหน้าเดียว · บานไม่ถูกตัดข้ามหน้าถ้าไม่จำเป็น
 *     → ความสูงแถวเท่ากันทั้ง 2 ฉบับ (วิธีนับเส้นของฉบับเฉลยบรรทัดเดียว ตัดท้าย) = หน้าตรงกัน วางเทียบได้
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
const SKIP = new Set(["shower"]);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? "" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const money = (v) => (v == null ? "" : Math.abs(v - Math.round(v)) < 0.005 ? num(v) : num(v, 2));
// วิธีนับเส้นแบบย่อ (ฉบับเฉลย · ช่องแคบ) — "2 ชิ้น × 2.8 ม. = 5.6 ม. ÷ เส้น 6.4 ม. = 0.87 × เผื่อเศษ 1.3 = 1.14 เส้น" → "2×2.8=5.6 ÷6.4×1.3 = 1.14"
const shortHow = (h) => String(h)
  .replace(/(\d+) ชิ้น × ([\d.]+) ม\. = ([\d.]+) ม\./g, "$1×$2=$3").replace(/ยาว ([\d.]+) ม\./g, "$1")
  .replace(/ ÷ เส้น ([\d.]+) ม\. = [\d.]+ × เผื่อเศษ ([\d.]+) = ([\d.]+) เส้น/g, " ÷$1×$2 = $3")
  .replace(/ · ตัดได้ (\d+) ชิ้น\/เส้น [\d.]+ ม\. → ซื้อเต็ม (\d+) เส้น/g, " · $1 ชิ้น/เส้น → $2 เส้น")
  .replace(/ ยาวกว่าเส้น ([\d.]+) ม\. → (\d+) เส้น/g, " > $1 → $2 เส้น")
  .replace(/ · รวมกับบรรทัดรหัสเดียวกันแล้วแบ่งเส้น = ([\d.]+) เส้น/g, " · รวมรหัสเดียวกัน = $1 เส้น");
const pct = (s, c) => (s > 0 ? Math.round(((s - c) / s) * 1000) / 10 + "%" : "");

// ── เลือกชุด: ทุกบาน (มีรุ่นในเว็บ + มีรายการของ) · ไม่เอาขนาดเล็กพิเศษ · หลังคาเอาเฉพาะไวนิล · ไม่เอา shower ──
const groups = new Map();
for (const r of DATA.rows) {
  if (!r.id || SKIP.has(r.id) || !Array.isArray(r.bom) || !r.bom.length || r.small || !r.web) continue;
  if (/^roof/.test(r.id) && r.vk !== "ไวนิล") continue;
  const k = r.id + "|" + (r.vk || "");
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const jobs = [];
for (const rows of groups.values()) {
  const s = [...rows].sort((a, b) => a.w * a.h * (a.p || 1) - b.w * b.h * (b.p || 1));
  const mid = s[Math.floor((s.length - 1) / 2)], big = s[s.length - 1];
  jobs.push({ mid, big: big !== mid ? big : null });
}

// สเปกที่ใช้คิด — อินพุตตาราง + ค่าตั้งต้นของรุ่น (ให้คนตรวจถอดของจากสเปกเดียวกับเว็บ)
const specOf = (r) => {
  const p = PRODUCTS[r.id];
  const fx = FX.find((x) => x.id === r.id && (x.vk || "") === (r.vk || "") && x.w === r.w && x.h === r.h && (x.p ?? null) === (r.p ?? null));
  const inp = withSpecDefaults(p, fx?.inputs || { w: r.w, h: r.h, p: r.p || 1 });
  const out = new Map();
  if (inp.form) out.set("รูปแบบ", inp.form);
  const glass = inp.glassType || p.defGlass;
  if (p.glass && glass) out.set("กระจก", glass);
  if (inp.material) out.set(p.materialLabel || "วัสดุ", inp.material);
  for (const o of p.specOpts || []) {
    const v = inp.spec?.[o.key];
    if (v == null || v === "" || !o.label) continue;
    out.set(o.label.replace(/\s*\(.*$/, ""), String(v));
  }
  return out;
};
const sizeTxt = (r) => `${r.w}×${r.h} ซม.${r.p ? " " + r.p + " บาน" : ""}`;

const CAT = { alu: "อลูมิเนียม (เส้น)", glass: "กระจก / แผ่น", hardware: "อุปกรณ์", consum: "โครง / วัสดุอื่น", bake: "ค่าอบสี", addon: "ของเสริม" };
const ORDER = ["alu", "glass", "hardware", "consum", "bake", "addon"];
const cleanName = (n) => String(n).replace(/\s*\((อบขาว\/ดำ|อบขาว|ดำ)\)\s*$/, "");

// รวมรายการ 2 ขนาด — จับคู่ด้วย หมวด+ชื่อ+รหัส (ขนาดใหญ่มีของที่กลางไม่มี ต่อท้ายหมวด)
const mergeBom = (a, b) => {
  const out = [], idx = new Map();
  const add = (row, side) => {
    const [cat, name, code] = row;
    const key = cat + "|" + cleanName(name) + "|" + code;
    let e = idx.get(key);
    if (!e) { e = { cat, name: cleanName(name), code, unit: row[4], m: null, b: null }; idx.set(key, e); out.push(e); }
    e[side] = { qty: row[3], price: row[5], amt: row[6], how: row[7] || "" };
  };
  for (const r of a.bom) add(r, "m");
  if (b) for (const r of b.bom) add(r, "b");
  return ORDER.flatMap((c) => out.filter((e) => e.cat === c));
};

function jobHtml({ mid, big }, i, n, answer) {
  const p = PRODUCTS[mid.id];
  const title = (p?.name || mid.name) + (mid.vk && !String(p?.name || "").includes(mid.vk) ? " · " + mid.vk : "");
  const sm = specOf(mid), sb = big ? specOf(big) : null;
  const spec = [...sm].map(([k, v]) => { const v2 = sb?.get(k); return `<span class="sp"><b>${esc(k)}</b> ${esc(v)}${v2 != null && v2 !== v ? " / " + esc(v2) : ""}</span>`; }).join("");
  const tgt = mid.target != null ? `${mid.target}%` + (mid.targetParts ? ` (ของ/ผลิต/ติดตั้ง ${mid.targetParts.join("/")}%)` : "") : "";
  const A = (v) => (answer ? v : "");
  const items = mergeBom(mid, big);
  let rows = "", k = 0, lastCat = "";
  for (const e of items) {
    if (e.cat !== lastCat) { rows += `<tr class="gh"><td colspan="9">${CAT[e.cat] || e.cat}</td></tr>`; lastCat = e.cat; }
    k++;
    const price = e.m && e.b && Math.abs(e.m.price - e.b.price) > 0.005 ? money(e.m.price) + " / " + money(e.b.price) : money((e.m || e.b).price);
    const isAlu = e.cat === "alu";
    const how = answer && isAlu ? `<div class="how">${e.m?.how ? "กลาง " + esc(shortHow(e.m.how)) : ""}</div><div class="how">${e.b?.how ? "ใหญ่ " + esc(shortHow(e.b.how)) : ""}</div>`
      : isAlu ? `<div class="how"></div><div class="how"></div>` : "";
    // ฉบับตรวจ: ขนาดที่ไม่มีรายการนี้ก็ปล่อยว่าง (ไม่บอกใบ้ว่าเว็บใช้/ไม่ใช้ของชิ้นไหน)
    const dash = answer ? `<span class="na">—</span>` : "";
    const q = (s) => (s ? A(money(s.qty)) : dash), t = (s) => (s ? A(money(s.amt)) : dash);
    rows += `<tr class="${isAlu ? "alu" : ""}"><td class="c">${k}</td><td class="nm">${esc(e.name)}${how}</td><td class="code">${esc(e.code)}</td><td class="c">${esc(e.unit)}</td>
      <td class="n">${A(price)}</td><td class="n m">${q(e.m)}</td><td class="n m">${t(e.m)}</td><td class="n b">${big ? q(e.b) : `<span class="na">—</span>`}</td><td class="n b">${big ? t(e.b) : `<span class="na">—</span>`}</td></tr>`;
  }
  const W = mid.web, B = big?.web;
  rows += `<tr class="tot"><td colspan="6">รวมทุนวัสดุ</td><td class="n m">${A(money(W.cM))}</td><td class="b"></td><td class="n b">${B ? A(money(B.cM)) : ""}</td></tr>`;

  const sRow = (lbl, cKey, sKey, cls = "") => `<tr class="${cls}"><td>${lbl}</td>
    <td class="n m">${A(money(W[cKey]))}</td><td class="n m">${A(money(W[sKey]))}</td><td class="n m">${A(pct(W[sKey], W[cKey]))}</td>
    <td class="n b">${B ? A(money(B[cKey])) : `<span class="na">—</span>`}</td><td class="n b">${B ? A(money(B[sKey])) : `<span class="na">—</span>`}</td><td class="n b">${B ? A(pct(B[sKey], B[cKey])) : `<span class="na">—</span>`}</td></tr>`;

  return `<section class="job">
  <div class="jh"><h2><span class="no">${i + 1}/${n}</span> ${esc(title)}</h2>
    <div class="meta"><span class="sp"><b>กลาง</b> ${esc(sizeTxt(mid))}</span>${big ? `<span class="sp"><b>ใหญ่</b> ${esc(sizeTxt(big))}</span>` : `<span class="sp"><b>ใหญ่</b> — (ตารางมีขนาดเดียว)</span>`}<span class="sp"><b>สี</b> อบขาว</span>${spec}${tgt ? `<span class="sp"><b>กำไรสุทธิเป้า</b> ${esc(tgt)}</span>` : ""}</div></div>
  <div class="bw"><table class="bom"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"><col class="c7"><col class="c6"><col class="c7"></colgroup>
  <thead><tr><th rowspan="2" class="c">#</th><th rowspan="2">รายการ</th><th rowspan="2">รหัส</th><th rowspan="2" class="c">หน่วย</th><th rowspan="2" class="n">ราคา/หน่วย</th><th colspan="2" class="c m">ขนาดกลาง ${esc(sizeTxt(mid))}</th><th colspan="2" class="c b">ขนาดใหญ่ ${big ? esc(sizeTxt(big)) : "—"}</th></tr>
  <tr><th class="n m">จำนวน</th><th class="n m">รวม (บาท)</th><th class="n b">จำนวน</th><th class="n b">รวม (บาท)</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="side"><div class="sh">รายการที่ขาด / เกิน (เขียนเพิ่ม)</div><div class="sc"><span>รายการ / รหัส</span><span>กลาง</span><span>ใหญ่</span></div><div class="ln"></div></div></div>
  <table class="sum"><colgroup><col class="s1"><col class="s2"><col class="s2"><col class="s3"><col class="s2"><col class="s2"><col class="s3"></colgroup>
  <thead><tr><th rowspan="2">ราคาขายสรุป</th><th colspan="3" class="c m">ขนาดกลาง</th><th colspan="3" class="c b">ขนาดใหญ่</th></tr>
  <tr><th class="n m">ทุน</th><th class="n m">ราคาขาย</th><th class="n m">กำไร %</th><th class="n b">ทุน</th><th class="n b">ราคาขาย</th><th class="n b">กำไร %</th></tr></thead>
  <tbody>${sRow("ค่าของ (วัสดุ)", "cM", "sM")}${sRow("ค่าแรงผลิต", "cP", "sP")}${sRow("ค่าแรงติดตั้ง", "cI", "sI")}${sRow("รวมทั้งชุด (กำไรสุทธิ)", "cT", "sT", "tot")}</tbody></table>
  <div class="note">หมายเหตุผู้ตรวจ ...................................................................................................................................................................................</div>
</section>`;
}

const css = `
@page { size: A4 portrait; margin: 8mm 8mm 9mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #15202e; background: #fff; font: 8.2pt/1.25 "Leelawadee UI", "IBM Plex Sans Thai", Tahoma, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cover { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #15202e; padding-bottom: 2px; margin-bottom: 4px; }
.cover h1 { font-size: 12.5pt; margin: 0; } .cover .who { font-size: 8.4pt; }
.cover .ed { font-size: 8pt; font-weight: 700; color: #fff; background: #3b5b8c; border-radius: 3px; padding: 1px 6px; margin-left: 6px; }
.lead { margin: 0 0 6px; font-size: 7.6pt; color: #4b5869; }
.job { break-inside: avoid; margin: 0 0 7px; padding-top: 4px; border-top: 1.5px solid #15202e; }
.jh h2 { font-size: 10.5pt; margin: 0 0 1px; } .no { font-size: 7.6pt; color: #fff; background: #15202e; border-radius: 3px; padding: 0 4px; vertical-align: 1px; }
.meta { display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 7.5pt; margin-bottom: 2px; }
.sp b { color: #4b5869; font-weight: 600; margin-right: 2px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; table-layout: fixed; }
thead { display: table-header-group; }
th, td { border: 1px solid #b9c3d1; padding: 0 3px; vertical-align: middle; overflow: hidden; }
th { background: #e9eef5; font-size: 7.3pt; text-align: left; line-height: 1.15; }
th.m, td.m { background-color: rgba(59, 91, 140, .045); } th.b, td.b { background-color: rgba(176, 112, 20, .05); }
.bom td { height: 5.6mm; } .bom tr.alu td { height: 7.4mm; }
/* คอลัมน์แคบ + ช่องเขียนเพิ่มด้านขวา (เจ้าของ 17 ต.ค.69 "ออกแบบคอลัมน์ให้แคบลง เผื่อมีรายการนอกเหนือ จะได้มีที่เขียนเพิ่ม") */
.bw { display: grid; grid-template-columns: 1fr 46mm; gap: 2mm; align-items: stretch; }
col.c1 { width: 5.5mm; } col.c2 { width: auto; } col.c3 { width: 15mm; } col.c4 { width: 8mm; } col.c5 { width: 15mm; } col.c6 { width: 11mm; } col.c7 { width: 15mm; }
.side { display: flex; flex-direction: column; border: 1px solid #b9c3d1; }
.side .sh { background: #e9eef5; font-size: 7.3pt; font-weight: 700; padding: 1px 3px; }
.side .sc { display: grid; grid-template-columns: 1fr 9mm 9mm; font-size: 6.6pt; color: #4b5869; border-bottom: 1px solid #b9c3d1; padding: 0 3px; }
.side .ln { flex: 1; min-height: 20mm; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(6.2mm - 1px), #cfd6e0 calc(6.2mm - 1px), #cfd6e0 6.2mm), linear-gradient(to right, transparent calc(100% - 18mm - 1px), #cfd6e0 calc(100% - 18mm - 1px), #cfd6e0 calc(100% - 18mm), transparent calc(100% - 18mm), transparent calc(100% - 9mm - 1px), #cfd6e0 calc(100% - 9mm - 1px), #cfd6e0 calc(100% - 9mm), transparent calc(100% - 9mm)); }
col.s1 { width: auto; } col.s2 { width: 22mm; } col.s3 { width: 15mm; }
td.c, th.c { text-align: center; } td.n, th.n { text-align: right; white-space: nowrap; }
td.nm { line-height: 1.15; }
td.code { font-size: 6.6pt; line-height: 1.1; color: #34425a; word-break: break-all; }
.how { font-size: 5.9pt; color: #5b6778; line-height: 1.1; height: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.na { color: #a3acb9; }
tr { break-inside: avoid; }
tr.gh td { background: #f1f4f9; font-weight: 700; height: 4.4mm; font-size: 7.4pt; }
td.hint { font-size: 6.8pt; color: #8a95a5; }
tr.tot td { font-weight: 700; background-color: #eef1f6; }
.sum { margin-top: 2px; } .sum td { height: 6mm; }
.note { font-size: 7.4pt; color: #4b5869; margin-top: 3px; white-space: nowrap; overflow: hidden; }
`;

for (const answer of [false, true]) {
  const name = answer ? "ใบตรวจราคา-ฉบับเฉลยเว็บ" : "ใบตรวจราคา-ฉบับตรวจ";
  const head = `<div class="cover"><h1>ใบตรวจราคา คิดราคา 4.0<span class="ed">${answer ? "ฉบับเฉลย (ตัวเลขจากเว็บ)" : "ฉบับตรวจ"}</span></h1><div class="who">ผู้ตรวจ ................................ วันที่ ....................</div></div>
  <p class="lead">${jobs.length} บาน · แต่ละบานมีขนาดกลางและขนาดใหญ่คู่กัน · สีอบขาว · ${answer ? "บรรทัดเส้นอลูมีวิธีนับเส้นเขียนใต้ชื่อ" : "เขียนจำนวน ราคาต่อหน่วย รวมเงิน และราคาขายสรุป · ถ้าเว็บขาดหรือเกินรายการไหน เขียนในช่องด้านขวา"}</p>`;
  const body = jobs.map((j, i) => jobHtml(j, i, jobs.length, answer)).join("\n");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>${css}</style></head><body>${head}${body}</body></html>`;
  fs.writeFileSync(`${OUTDIR}/${name}.html`, html);
  console.log(`${OUTDIR}/${name}.html · ${jobs.length} บาน`);
}
