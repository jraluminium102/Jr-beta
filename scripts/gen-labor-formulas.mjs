#!/usr/bin/env node
/**
 * gen-labor-formulas — หน้าสรุป "สูตรค่าแรงทุกรุ่น" ให้เจ้าของอ่าน (เจ้าของ 23 ต.ค.69 "ขอสูตรคิดค่าแรงทั้งหมดหน่อย")
 *   ชั่วโมง/คน มาจากชีต "ค่าแรง" ในไฟล์ถอดทุน (ตารางเดียวกับ LABOR_SRC ใน verify-r40) · บาท = ชม. × คน × 87.5
 *   ตัวอย่างตัวเลข = เอนจินคิดราคา 4.0 จริง ที่ขนาดกลางของตาราง R4.1
 *   node scripts/gen-labor-formulas.mjs docs/สูตรค่าแรง.html
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { withSpecDefaults } from "./color-compare-config.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows;
// ดึงตารางชั่วโมง/คน จาก verify-r40 (แหล่งเดียวกับด่านตรวจ — ไม่ก๊อปตัวเลขซ้ำ)
const vsrc = fs.readFileSync("scripts/verify-r40.mjs", "utf8");
const block = vsrc.slice(vsrc.indexOf("const LABOR_SRC = {") + "const LABOR_SRC = ".length, vsrc.indexOf("};", vsrc.indexOf("const LABOR_SRC = {")) + 1);
const SRC = Function("return " + block)();

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const n0 = (v) => Math.round(v).toLocaleString("en-US");
const n2 = (v) => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const hrs = (h) => (Math.round(h * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });

const GROUP = { 1: "ประตู-หน้าต่าง", 2: "ระแนง / ประตูรั้ว / ราวกันตก", 3: "หลังคา / ฝ้า / ผนัง", 4: "ตู้", 5: "มุ้ง", 6: "ห้องกระจก", 7: "ม่านซิป" };
const rows = [];
for (const [id, p] of Object.entries(PRODUCTS)) {
  if (p.pickerHide || p.composite) continue;
  const S = SRC[p.laborKey], L = PB.LABOR[p.laborKey];
  // ตัวอย่าง: ขนาดกลางของตาราง R4.1 (ไม่มีในตาราง = ขนาดตั้งต้นของรุ่น)
  const fx = FX.filter((r) => r.id === id && r.inputs && !r.small).sort((a, b) => a.w * a.h * (a.p || 1) - b.w * b.h * (b.p || 1));
  const mid = fx.length ? fx[Math.floor((fx.length - 1) / 2)] : null;
  let ex = null;
  try {
    const inp = withSpecDefaults(p, mid ? mid.inputs : { w: p.defaults?.w || 200, h: p.defaults?.h || 200, p: p.defaults?.p || 1, form: p.defForm, material: p.defMaterial, glassType: p.defGlass });
    const c = computeCost(PB, p, inp);
    const P = c.sell?.parts || {};
    ex = { size: `${inp.w}×${inp.h}${(inp.p || 1) > 1 ? " · " + inp.p + " บาน" : ""}`, area: c.laborCalc?.area, panels: c.laborCalc?.panels, lp: c.labor?.prod || 0, li: c.labor?.install || 0, sp: P.prod, si: P.inst, show: c.laborCalc, r41: !!c.sellModel?.r41 };
  } catch (e) { ex = null; }
  let kind = "rate";
  if (p.sellR39) kind = "r39"; else if (p.sellCabinet || p.sellZip || p.sellDirect) kind = "direct";
  else if (!L) kind = "direct";
  else if ((L.pBase === 0 && L.pRate === 0 && L.iBase === 0 && L.iRate === 0 && /เหมารวม/.test(p.laborKey || ""))) kind = "inmat";
  else if (p.laborPerLeaf) kind = "leaf"; else if (p.laborNoRate) kind = "base";
  rows.push({ id, g: p.group, name: p.name, key: p.laborKey || "", S, L, kind, perPanel: !!p.laborPerPanel, extra: p.laborInstExtra || "", leaves: p.laborLeaves || "", ex });
}

const formulaTxt = (r, side) => {
  const S = r.S; if (!S) return "";
  const h = side === "p" ? S.hp : S.hi, j = side === "p" ? S.jp : S.ki, n = side === "p" ? S.np : S.ni;
  const base = h * n * S.rate, per = j * n * S.rate;
  if (r.kind === "base") return `${hrs(h)} ชม. × ${hrs(n)} คน × 87.5 = <b>${n2(base)}</b>${r.perPanel ? " × จำนวนบาน" : ""}`;
  const a = h > 0 ? `${hrs(h)} ชม.` : "", b = j > 0 ? `${hrs(j)} ชม. × ตร.ม.` : "";
  const hh = [a, b].filter(Boolean).join(" + ") || "0";
  const money = [base > 0 ? n2(base) : "", per > 0 ? `${n2(per)} × ตร.ม.` : ""].filter(Boolean).join(" + ") || "0";
  return `(${hh}) × ${hrs(n)} คน × 87.5<br><b>= ${money}</b>${r.kind === "leaf" ? " (ฐาน × จำนวนใบ)" : ""}${r.perPanel ? " × จำนวนบาน" : ""}`;
};
const exTxt = (r) => {
  const e = r.ex; if (!e || !(e.lp + e.li > 0)) return "";
  return `${e.size} ซม. · ${n2(e.area)} ตร.ม.<br>ทุน ผลิต <b>${n0(e.lp)}</b> · ติดตั้ง <b>${n0(e.li)}</b>${e.r41 && e.sp ? `<br><span class="sell">ขาย ผลิต ${n0(e.sp)} · ติดตั้ง ${n0(e.si)}</span>` : ""}`;
};
const NOTE = {
  base: "คิดเป็นก้อนคงที่ ไม่บวกตามพื้นที่",
  leaf: "ฐานคิดต่อใบมุ้ง + เรตตามพื้นที่รวม",
  inmat: "ค่าแรงรวมอยู่ในรายการวัสดุแล้ว (เป็นบาท/ตร.ม. ในรายการ)",
  r39: "ราคาเหมาต่อ ตร.ม. จาก R3.9 (รวมค่าแรงแล้ว)",
  direct: "ราคาขายตรง / ซื้อมาขายไป ไม่แยกค่าแรง",
};

const sections = Object.keys(GROUP).map(Number).map((g) => {
  const R = rows.filter((r) => r.g === g);
  if (!R.length) return "";
  const body = R.map((r) => {
    const special = [r.kind !== "rate" ? NOTE[r.kind] : "", r.extra ? "ติดตั้ง +87.5 เมื่อมีบานเปิด/บานเลื่อน" : "", r.perPanel && r.kind !== "base" ? "× จำนวนบาน" : ""].filter(Boolean).join(" · ");
    const formula = r.S && (r.kind === "rate" || r.kind === "base" || r.kind === "leaf");
    return `<tr><td class="nm">${esc(r.name)}<span class="key">ตารางค่าแรง: ${esc(r.key || "—")}</span></td>
      <td>${formula ? formulaTxt(r, "p") : `<span class="mut">${esc(NOTE[r.kind] || "—")}</span>`}</td>
      <td>${formula ? formulaTxt(r, "i") : ""}</td>
      <td class="ex">${exTxt(r)}${special && formula ? `<span class="sp">${esc(special)}</span>` : ""}</td></tr>`;
  }).join("");
  return `<section><h2>${GROUP[g]}</h2><div class="tw"><table><thead><tr><th>รุ่น</th><th>ค่าแรงผลิต (ทุน)</th><th>ค่าแรงติดตั้ง (ทุน)</th><th>ตัวอย่าง ขนาดกลาง</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}).join("");

const html = `<title>สูตรค่าแรงทุกรุ่น</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&display=swap">
<style>
/* ผังหน้า: หลักคิด 3 ข้อด้านบน → ตารางแยกหมวด (รุ่น · สูตรผลิต · สูตรติดตั้ง · ตัวอย่าง) */
:root{--bg:#f5f6f8;--paper:#fff;--ink:#17202b;--muted:#5a6572;--line:#d9dee5;--acc:#1f5fa6;--accbg:#e8f0fa;--sell:#0f6b5c;--f:"IBM Plex Sans Thai",Tahoma,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--paper:#1a212a;--ink:#e5eaf0;--muted:#9aa5b2;--line:#2d3743;--acc:#8ab4ec;--accbg:#1d2c40;--sell:#5ec7b2;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12171d;--paper:#1a212a;--ink:#e5eaf0;--muted:#9aa5b2;--line:#2d3743;--acc:#8ab4ec;--accbg:#1d2c40;--sell:#5ec7b2;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--f)}
.w{max-width:1150px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 50px}
h1{font-size:26px;margin:0 0 4px} h2{font-size:19px;margin:22px 0 8px;border-bottom:2px solid var(--ink);padding-bottom:4px}
.lead{color:var(--muted);margin:0 0 14px;max-width:72ch}
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:6px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px 14px;min-width:0}
.card h3{margin:0 0 4px;font-size:15px;color:var(--acc)} .card p{margin:0;font-size:14px}
.eq{background:var(--accbg);border-radius:6px;padding:6px 8px;margin-top:6px;font-size:14px}
.tw{overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{font-size:13px;color:var(--muted);font-weight:600;background:var(--bg)}
td.nm{font-weight:600;min-width:150px} .key{display:block;font-weight:400;font-size:12px;color:var(--muted)}
td.ex{font-size:13px;min-width:190px} .sell{color:var(--sell)} .sp{display:block;font-size:12px;color:var(--muted);margin-top:3px} .mut{color:var(--muted)}
</style>
<div class="w">
<h1>สูตรค่าแรงทุกรุ่น</h1>
<p class="lead">ค่าแรงผลิตกับค่าแรงติดตั้งของคิดราคา 4.0 คิดจากชั่วโมงทำงาน × จำนวนคน × ค่าแรงชั่วโมงละ 87.5 บาท · ชั่วโมงและจำนวนคนมาจากชีต "ค่าแรง" ในไฟล์ถอดทุน · ตัวอย่างทุกแถวคิดจากเว็บจริงที่ขนาดกลางของตาราง R4.1</p>
<div class="rules">
<div class="card"><h3>1. ทุนค่าแรง (สูตรหลัก)</h3><p>ค่าแรง = (ชม.ฐาน + ชม.ต่อ ตร.ม. × พื้นที่) × จำนวนคน × 87.5</p><div class="eq">เช่น บานเลื่อน SMS ผลิต = (6 ชม. + 0.33 ชม. × ตร.ม.) × 1.5 คน × 87.5<br>= 787.5 + 43.31 × ตร.ม.</div></div>
<div class="card"><h3>2. ราคาขายค่าแรง</h3><p>รุ่นที่อยู่ในตาราง R4.1 ขายค่าแรงตามตาราง R4.1 ขนาดที่ตารางไม่มี ใช้สัดส่วนขาย÷ทุนของขนาดในตารางที่ใกล้ที่สุด</p><div class="eq">เช่น SMS 250×240 ทุนผลิต 1,047 → ขาย 2,900 ตามตาราง</div></div>
<div class="card"><h3>3. แบบพิเศษ</h3><p>บานเฟี้ยม = ก้อนคงที่ × จำนวนบาน · มุ้ง = ฐานต่อใบ · ฝ้า/ผนัง = ค่าแรงอยู่ในรายการวัสดุ · Shower ติดตั้ง +87.5 เมื่อมีบานเปิด/เลื่อน</p></div>
</div>
${sections}
</div>`;
fs.writeFileSync(process.argv[2] || "docs/สูตรค่าแรง.html", html);
console.log("ok", rows.length, "รุ่น");
