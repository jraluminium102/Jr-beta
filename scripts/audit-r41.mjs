#!/usr/bin/env node
/**
 * audit-r41 — เทียบ "คิดราคา 4.0 บนเว็บ" กับ ★ ตารางราคาขาย R4.1 (ชุดข้อมูล ส่งต่อ-เว็บ/tests.json)
 *   node scripts/audit-r41.mjs [--rows]
 *
 * เจ้าของสั่ง 5 ก.ย.69:
 *   · ค่าของ (ทุนวัสดุ)  ต่างได้ไม่เกิน ±3,000
 *   · ค่าแรงผลิต/ติดตั้ง ต่างได้ไม่เกิน ±5
 *   · ถ้าทุนใกล้แล้วแต่ราคาขายยังไม่ใกล้ → ปรับ % กำไรค่าของ (ค่าแรงล็อกตามตาราง)
 *
 * ป้อนอินพุตเข้าเอนจินจริง (computeCost) ไม่ได้ป้อนทุนสำเร็จรูป — คนละเรื่องกับ verify-sell
 *   verify-sell = "สูตรราคาขายถูกไหม" (ป้อนทุนจากไฟล์)
 *   ไฟล์นี้     = "เว็บคิดทุนเองแล้วได้ใกล้ของจริงไหม" (ป้อนแค่ขนาด/รูปแบบ)
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const DIR = "ส่งต่อ-เว็บ/ส่งต่อ-เว็บ";
if (!fs.existsSync(`${DIR}/tests.json`)) { console.log("ข้าม — ไม่มีโฟลเดอร์ ส่งต่อ-เว็บ"); process.exit(0); }
const T = JSON.parse(fs.readFileSync(`${DIR}/tests.json`, "utf8"));
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));

const NAME2ID = {
  "Sliding door — SMS": "sms_slide", "Sliding door — Euro": "euro_slide", "Sliding door — SlimLux": "slimlux",
  "Sliding door — E-series": "eseries", "Sliding door — top hung (Hafele)": "topslide", "Sliding louvre panel": "bar_slide",
  "Casement — Velora": "velora", "Casement — standard": "open_door", "Pivot door": "pivot",
  "Solid panel door": "bansolid", "PC Door": "pcdoor", "Awning window": "awning", "Lift-up window": "banyok",
  "Glass louvre": "banklet", "Bi-fold": "folding", "Bi-fold — Euro": "fold_euro", "Bi-fold — lift up": "fold_lift",
  "Fixed lite": "fixed", "Fixed — curved": "curve_fixed", "Casement — curved": "curve_open",
  "Louvre screen": "louver", "Louvre screen — alternating": "louver_slip", "Louvre screen — rotating": "louver_rotate",
  "Sliding gate": "gate", "Shower enclosure": "shower", "Balustrade": "handrail", "Cabinet door — Futuretech": "cabinet_face",
};

const COLOR_BY_LABEL = {
  "สีอบขาว/ดำ": "white", "อบขาว/ดำ": "white", "เทาซาฮาร่า": "sahara", "สีดำซาฮาร่า": "sahara",
  "แอทแทคเกรย์": "sahara", "ลายไม้สักทอง": "woodStock", "ลายไม้มะฮอกกานี": "woodStock", "ลายไม้ไวท์โอ๊ค": "woodStock",
};
const glassNames = new Set(Object.keys(PB.GLASS || {}));

/** เดาอินพุตจาก "ค่าที่อยู่ในเซลล์" — ค่าไหนตรงกับตัวเลือกของรุ่นก็ยัดช่องนั้น */
function argsFor(prod, inputs) {
  const out = { w: inputs.width_cm, h: inputs.height_cm, p: Math.max(1, Number(inputs.panels) || prod.defaults?.p || 1) };
  const forms = prod.forms || [], mats = prod.materials || [];
  for (const v of Object.values(inputs)) {
    if (typeof v !== "string") continue;
    if (!out.form && forms.includes(v)) out.form = v;
    if (!out.material && mats.includes(v)) out.material = v;
    if (!out.glassType && glassNames.has(v)) out.glassType = v;
    if (!out.color && COLOR_BY_LABEL[v]) out.color = COLOR_BY_LABEL[v];
  }
  out.form ??= prod.defForm ?? forms[0] ?? "";
  out.glassType ??= prod.defGlass ?? undefined;
  out.color ??= "white";
  out.material ??= prod.defMaterial;
  return out;
}

const TOL_MAT = 3000, TOL_LAB = 5;
const rows = [];
for (const c of T.cases) {
  const id = NAME2ID[c.product];
  const prod = id && PRODUCTS[id];
  if (!prod) continue;                       // หลังคา/ฝ้า/ผนัง — คนละโครงอินพุต ไว้รอบหน้า
  const e = c.expected;
  if (!(e.costMaterial > 0)) continue;       // ชุดข้อมูลไม่มีทุน = เทียบไม่ได้
  let r;
  try { r = computeCost(PB, prod, argsFor(prod, c.inputs)); } catch { continue; }
  if (!r || r.error) continue;
  rows.push({
    product: c.product, id,
    size: `${c.inputs.width_cm}×${c.inputs.height_cm}`, p: c.inputs.panels ?? 1,
    matWeb: r.cost.total, matFile: e.costMaterial,
    prodWeb: r.labor.prod, prodFile: e.costMake,
    instWeb: r.labor.install, instFile: e.costInstall,
    sellWeb: r.sell.withInstall, sellFile: e.sellPrice,
    matSell: r.sell.beforeLabor,   // ราคาขายเฉพาะค่าของ — ใช้คำนวณว่าต้องปรับกำไรค่าของเท่าไร
  });
}

const n = (x) => Math.round(x).toLocaleString("th-TH");

if (process.argv.includes("--rows")) {
  console.log("รุ่น | ขนาด | บาน | ค่าของ เว็บ/ไฟล์ | ผลิต เว็บ/ไฟล์ | ติดตั้ง เว็บ/ไฟล์ | ขาย เว็บ/ไฟล์");
  for (const r of rows)
    console.log(`${r.product} | ${r.size} | ${r.p} | ${n(r.matWeb)}/${n(r.matFile)} | ${n(r.prodWeb)}/${n(r.prodFile)} | ${n(r.instWeb)}/${n(r.instFile)} | ${n(r.sellWeb)}/${n(r.sellFile)}`);
  process.exit(0);
}

const by = new Map();
for (const r of rows) {
  const g = by.get(r.product) ?? { n: 0, matBad: 0, labBad: 0, labNoData: 0, worstMat: 0, worstMatPct: 0, worstLab: 0, matSell: 0, needMatSell: 0 };
  g.n++;
  const dm = r.matWeb - r.matFile;
  const noLab = !(r.prodFile > 0) && !(r.instFile > 0);
  const dl = Math.abs(r.prodWeb - r.prodFile) > Math.abs(r.instWeb - r.instFile) ? r.prodWeb - r.prodFile : r.instWeb - r.instFile;
  if (Math.abs(dm) > TOL_MAT) g.matBad++;
  if (noLab) g.labNoData++;
  else if (Math.abs(r.prodWeb - r.prodFile) > TOL_LAB || Math.abs(r.instWeb - r.instFile) > TOL_LAB) g.labBad++;
  if (Math.abs(dm) > Math.abs(g.worstMat)) { g.worstMat = dm; g.worstMatPct = r.matFile > 0 ? (dm / r.matFile) * 100 : 0; }
  if (!noLab && Math.abs(dl) > Math.abs(g.worstLab)) g.worstLab = dl;
  // ปรับ "กำไรค่าของ" เท่าไรราคาขายรวมถึงจะเท่าไฟล์ (ค่าแรงคิดตามที่เว็บคิดอยู่)
  g.matSell += r.matSell;
  g.needMatSell += Math.max(0, r.sellFile - (r.sellWeb - r.matSell));
  by.set(r.product, g);
}

const line = (a, b, c, d, e2, f2, g2) =>
  a.padEnd(32) + String(b).padStart(4) + String(c).padStart(10) + String(d).padStart(10) + e2.padStart(16) + f2.padStart(14) + "   " + g2;

console.log("═══ เทียบเว็บ ↔ ★ ตารางราคาขาย R4.1 · เกณฑ์ ค่าของ ±3,000 · ค่าแรง ±5 ═══");
console.log("");
console.log(line("รุ่น", "เคส", "ของหลุด", "แรงหลุด", "ต่างของสุด", "ต่างแรงสุด", "สิ่งที่ต้องทำ"));
const grp = [...by.entries()].sort((a, b) => (b[1].matBad + b[1].labBad) - (a[1].matBad + a[1].labBad));
for (const [name, g] of grp) {
  const adj = g.matSell > 0 ? (g.needMatSell / g.matSell - 1) * 100 : 0;
  let todo;
  if (g.matBad) todo = "⛔ แก้ทุนค่าของก่อน (ต่าง " + (g.worstMatPct >= 0 ? "+" : "") + g.worstMatPct.toFixed(0) + "%)";
  else if (g.labBad) todo = "⛔ แก้ค่าแรงก่อน";
  else if (g.labNoData === g.n) todo = "— ไฟล์ไม่มีค่าแรง เทียบไม่ได้";
  else if (Math.abs(adj) < 1) todo = "✅ ตรงแล้ว";
  else todo = "ปรับกำไรค่าของ " + (adj > 0 ? "+" : "") + adj.toFixed(0) + "%";
  console.log(line(name, g.n, g.matBad, g.labBad + (g.labNoData ? "*" : ""), n(g.worstMat), n(g.worstLab), todo));
}
const tot = rows.length;
const matOk = rows.filter((r) => Math.abs(r.matWeb - r.matFile) <= TOL_MAT).length;
const labOk = rows.filter((r) => (!(r.prodFile > 0) && !(r.instFile > 0)) || (Math.abs(r.prodWeb - r.prodFile) <= TOL_LAB && Math.abs(r.instWeb - r.instFile) <= TOL_LAB)).length;
console.log(`
═══ รวม ${tot} เคส · ค่าของผ่าน ${matOk} · ค่าแรงผ่าน ${labOk} (* = ไฟล์ไม่มีค่าแรง) ═══`);
