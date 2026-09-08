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
// ฝ้า/ผนัง — ชุดข้อมูลให้ "ทุนรวม" (costTotal) ไม่ได้แยกค่าของ
const AREA2ID = {
  "Gypsum ceiling": "ceil_gypsum", "Fibre-cement ceiling": "ceil_wood",
  "Smartboard wall": "wall_smartboard", "Isowall wall": "wall_isowall",
};
const NO_PRODUCT = {
  "Gypsum ceiling + rockwool": "เว็บยังไม่มีตัวเลือกใส่ฉนวนร็อควูลในฝ้ายิปซัม",
  "Smartboard floor": "เว็บยังไม่มีรุ่นพื้นสมาร์ทบอร์ด",
};

const COLOR_BY_LABEL = {
  "สีอบขาว/ดำ": "white", "อบขาว/ดำ": "white", "เทาซาฮาร่า": "sahara", "สีดำซาฮาร่า": "sahara",
  "แอทแทคเกรย์": "sahara", "ลายไม้สักทอง": "woodStock", "ลายไม้มะฮอกกานี": "woodStock", "ลายไม้ไวท์โอ๊ค": "woodStock",
};
const glassNames = new Set(Object.keys(PB.GLASS || {}));

/** ชื่อวัสดุในไฟล์สั้นกว่าในเว็บ ("ชินโคร์ Shade" ↔ "ชินโคร์ Shade 4มม") → จับแบบขึ้นต้นตรงกัน */
const matchMat = (prod, name) => {
  const ms = prod.materials || [];
  return ms.find((m) => m === name) || ms.find((m) => m.startsWith(name)) || ms.find((m) => name.startsWith(m)) || prod.defMaterial;
};

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
const skipped = new Map();
const note = (k, why) => skipped.set(k, { n: (skipped.get(k)?.n ?? 0) + 1, why });

const push = (label, id, size, p, r, e, matFile) => rows.push({
  product: label, id, size, p,
  matWeb: r.cost.total, matFile,
  prodWeb: r.labor.prod, prodFile: e.costMake ?? 0,
  instWeb: r.labor.install, instFile: e.costInstall ?? 0,
  sellWeb: r.sell.withInstall, sellFile: e.sellPrice ?? 0,
  matSell: r.sell.beforeLabor,
});

for (const c of T.cases) {
  const e = c.expected, i = c.inputs;

  if (NO_PRODUCT[c.product]) { note(c.product, NO_PRODUCT[c.product]); continue; }

  // ── หลังคา / กันสาด ──
  if (c.product === "Roof / canopy") {
    const sliding = i.hasSliding === "ใช่";
    const id = sliding ? "roof_slide" : (i.shape === "หลังคาจั่ว" ? "roof_gable" : "roof");
    const prod = PRODUCTS[id];
    const spec = { batten: i.purlin, ridge: i.ridgeHeight_cm };
    spec.roofend = id === "roof_gable" ? (i.edge === "ยื่นปลาย" ? "ปล่อยปลาย" : "รางน้ำ") : i.edge;
    // ⚠ ไฟล์ให้ "ขนาดรวมทั้งหลังคา" + "ส่วนที่เลื่อน" (เลื่อนอยู่ในผืนเดียวกัน)
    //   เว็บรับ W×H = ส่วนติดตาย แล้วบวกบานเลื่อนต่างหาก · slidew = กว้างต่อบาน (ไม่ใช่รวม)
    const leaves = sliding ? Math.max(1, i.slidingLeaves || 2) : 1;
    if (sliding) { spec.slidew = Math.round((i.slidingWidth_cm || 0) / leaves); spec.slideh = i.slidingProjection_cm; }
    const kw = String(i.motor || "").replace(/\D/g, "") || "80";
    let r;
    try {
      r = computeCost(PB, prod, {
        w: sliding ? Math.max(0, (i.width_cm || 0) - (i.slidingWidth_cm || 0)) : i.width_cm, h: i.projection_cm, p: leaves,
        form: prod.defForm, material: matchMat(prod, i.material), color: "white", spec,
        addons: sliding ? { slide_motor: { kw } } : {},
      });
    } catch { note(c.product, "คิดไม่ผ่าน"); continue; }
    if (!r || r.error) { note(c.product, "คิดไม่ผ่าน"); continue; }
    const label = "หลังคา " + (sliding ? "เลื่อน" : i.shape === "หลังคาจั่ว" ? "จั่ว" : "เพิง");
    push(label, id, `${i.width_cm}×${i.projection_cm} · ${i.material}`, leaves, r, e, e.costMaterial);
    continue;
  }

  // ── ฝ้า / ผนัง (ชุดข้อมูลให้ทุนรวม costTotal) ──
  if (AREA2ID[c.product]) {
    const prod = PRODUCTS[AREA2ID[c.product]];
    let r;
    try { r = computeCost(PB, prod, { w: (i.width_m || 0) * 100, h: (i.length_m || 0) * 100, p: 1, form: prod.defForm, color: "white" }); }
    catch { note(c.product, "คิดไม่ผ่าน"); continue; }
    if (!r || r.error) { note(c.product, "คิดไม่ผ่าน"); continue; }
    push(c.product, prod.id, `${i.width_m}×${i.length_m} ม.`, 1, r, e, e.costTotal ?? e.costMaterial);
    continue;
  }

  // ── บาน/ประตู/หน้าต่าง ──
  const id = NAME2ID[c.product];
  const prod = id && PRODUCTS[id];
  if (!prod) { note(c.product, "ยังไม่ได้แมปเข้ารุ่นในเว็บ"); continue; }
  if (!(e.costMaterial > 0)) { note(c.product, "ชุดข้อมูลไม่มีทุน"); continue; }
  let r;
  try { r = computeCost(PB, prod, argsFor(prod, i)); } catch { note(c.product, "คิดไม่ผ่าน"); continue; }
  if (!r || r.error) { note(c.product, "คิดไม่ผ่าน"); continue; }
  push(c.product, id, `${i.width_cm}×${i.height_cm}`, i.panels ?? 1, r, e, e.costMaterial);
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
  const g = by.get(r.product) ?? { n: 0, matBad: 0, labBad: 0, labNoData: 0, worstMat: 0, worstMatPct: 0, worstLab: 0, matSell: 0, needMatSell: 0, noSell: 0 };
  g.n++;
  const dm = r.matWeb - r.matFile;
  const noLab = !(r.prodFile > 0) && !(r.instFile > 0);
  const dl = Math.abs(r.prodWeb - r.prodFile) > Math.abs(r.instWeb - r.instFile) ? r.prodWeb - r.prodFile : r.instWeb - r.instFile;
  if (Math.abs(dm) > TOL_MAT) g.matBad++;
  if (noLab) g.labNoData++;
  else if (Math.abs(r.prodWeb - r.prodFile) > TOL_LAB || Math.abs(r.instWeb - r.instFile) > TOL_LAB) g.labBad++;
  if (Math.abs(dm) > Math.abs(g.worstMat)) { g.worstMat = dm; g.worstMatPct = r.matFile > 0 ? (dm / r.matFile) * 100 : 0; }
  if (!noLab && Math.abs(dl) > Math.abs(g.worstLab)) g.worstLab = dl;
  if (!(r.sellFile > 0)) g.noSell++;
  else { g.matSell += r.matSell; g.needMatSell += Math.max(0, r.sellFile - (r.sellWeb - r.matSell)); }
  by.set(r.product, g);
}

const line = (a, b, c, d, e2, f2, g2) =>
  a.padEnd(34) + String(b).padStart(4) + String(c).padStart(9) + String(d).padStart(9) + e2.padStart(15) + f2.padStart(13) + "   " + g2;

console.log("═══ เทียบเว็บ ↔ ★ ตารางราคาขาย R4.1 · เกณฑ์ ค่าของ ±3,000 · ค่าแรง ±5 ═══");
console.log("");
console.log(line("รุ่น", "เคส", "ของหลุด", "แรงหลุด", "ต่างของสุด", "ต่างแรงสุด", "สิ่งที่ต้องทำ"));
for (const [name, g] of [...by.entries()].sort((a, b) => (b[1].matBad + b[1].labBad) - (a[1].matBad + a[1].labBad) || a[0].localeCompare(b[0], "th"))) {
  const adj = g.matSell > 0 ? (g.needMatSell / g.matSell - 1) * 100 : 0;
  let todo;
  if (g.matBad) todo = "⛔ แก้ทุนค่าของก่อน (ต่าง " + (g.worstMatPct >= 0 ? "+" : "") + g.worstMatPct.toFixed(0) + "%)";
  else if (g.labBad) todo = "⛔ แก้ค่าแรงก่อน";
  else if (g.noSell === g.n) todo = "— ชุดข้อมูลไม่มีราคาขาย (เทียบได้แค่ทุน)";
  else if (g.labNoData === g.n) todo = "— ไฟล์ไม่มีค่าแรง เทียบไม่ได้";
  else if (Math.abs(adj) < 1) todo = "✅ ตรงแล้ว";
  else todo = "ปรับกำไรค่าของ " + (adj > 0 ? "+" : "") + adj.toFixed(0) + "%";
  console.log(line(name, g.n, g.matBad, g.labBad + (g.labNoData ? "*" : ""), n(g.worstMat), n(g.worstLab), todo));
}
if (skipped.size) {
  console.log("\n── เทียบไม่ได้ ──");
  for (const [k, v] of skipped) console.log("   " + k.padEnd(32) + "(" + v.n + " เคส) " + v.why);
}
const tot = rows.length;
const matOk = rows.filter((r) => Math.abs(r.matWeb - r.matFile) <= TOL_MAT).length;
const labOk = rows.filter((r) => (!(r.prodFile > 0) && !(r.instFile > 0)) || (Math.abs(r.prodWeb - r.prodFile) <= TOL_LAB && Math.abs(r.instWeb - r.instFile) <= TOL_LAB)).length;
console.log(`\n═══ รวม ${tot} เคส (จากทั้งหมด ${T.cases.length}) · ค่าของผ่าน ${matOk} · ค่าแรงผ่าน ${labOk} (* = ไฟล์ไม่มีค่าแรง) ═══`);
