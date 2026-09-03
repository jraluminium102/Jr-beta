/**
 * audit-handoff — เทียบ "คิดราคา 4.0" กับชุดข้อมูลที่ AI อีกตัวส่งมาใน โฟลเดอร์ ส่งต่อ-เว็บ
 * ─────────────────────────────────────────────────────────────────────────────
 * ไฟล์ tests.json ในนั้นคือค่าที่ดึงจากไฟล์ Excel จริง (198 เคส) — ใช้เป็นด่านวัดว่าเว็บห่างแค่ไหน
 *   expected.costMaterial = ทุนวัสดุ (D28 ฯลฯ)
 *   expected.costMake / costInstall = ค่าแรงผลิต / ติดตั้ง
 *   expected.sellPrice = ราคาขายในไฟล์ (สูตรกำไรเป้าหมาย + ค่าดำเนินการ 30% — เว็บยังไม่ได้ใช้สูตรนี้)
 *
 * ⚠ อ่านอย่างเดียว ไม่แก้อะไร · ใช้ดูว่าจุดไหนตรง จุดไหนต้องไล่ต่อ
 *   node scripts/audit-handoff.mjs            → สรุปรายรุ่น
 *   node scripts/audit-handoff.mjs --all      → รายเคส
 */
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";

const DIR = "ส่งต่อ-เว็บ/ส่งต่อ-เว็บ";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const T = JSON.parse(fs.readFileSync(`${DIR}/tests.json`, "utf8"));
const ALL = process.argv.includes("--all");

const BAKE = { "สีอบขาว/ดำ": "white", "อบขาว/ดำ/เทา": "white", "ขาว/ดำ": "white", "เทาซาฮาร่า": "sahara", "สีอบพิเศษ": "special" };
const col = (v) => BAKE[String(v ?? "").trim()] ?? "white";

/** แปลง input ของชีต (อ้างตามเซลล์) → ตัวเลือกฝั่งเว็บ · null = ยังแมปไม่ได้ */
const MAP = {
  "Sliding door — SMS": (i) => ({ id: "sms_slide", o: { form: i.B5, glassType: i.B9, color: col(i.F9), colorKey: col(i.F9) } }),
  "Sliding door — Euro": (i) => ({ id: "euro_slide", o: { form: i.B5, glassType: i.B9, color: col(i.F9), colorKey: col(i.F9) } }),
  "Sliding door — SlimLux": (i) => ({ id: "slimlux", o: { form: i.B2, glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Sliding door — E-series": (i) => ({ id: "eseries", o: { form: i.B5, glassType: i.B7, color: col(i.B6), colorKey: col(i.B6) } }),
  "Sliding door — top hung (Hafele)": (i) => ({ id: "topslide", o: { form: "เลื่อนซ้อน", glassType: i.B6, color: col(i.B5), colorKey: col(i.B5) } }),
  "Sliding louvre panel": (i) => ({ id: "bar_slide", o: { form: i.F7 || "ภายนอก", color: col(i.F9), colorKey: col(i.F9) } }),
  "Casement — Velora": (i) => ({ id: "velora", o: { glassType: i.B8, color: col(i.B5), colorKey: col(i.B5) } }),
  "Casement — standard": (i) => ({ id: "open_door", o: { form: i.B6 === "มี" ? "มีธรณี" : "ไม่มีธรณี", glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Pivot door": (i) => ({ id: "pivot", o: { form: i.B6 === "มี" ? "มีธรณี" : "ไม่มีธรณี", glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Solid panel door": (i) => ({ id: "bansolid", o: { form: i.B6 === "มี" ? "มีธรณี" : "ไม่มีธรณี", material: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "PC Door": (i) => ({ id: "pcdoor", o: { form: i.B5, glassType: i.B7, color: col(i.B6), colorKey: col(i.B6) } }),
  "Awning window": (i) => ({ id: "awning", o: { form: "เปิดล่าง", glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Lift-up window": (i) => ({ id: "banyok", o: { form: i.B6 === "ถ่วง" ? "ถ่วง" : "เดี่ยว", glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Glass louvre": (i) => ({ id: "banklet", o: { form: "นอน", glassType: i.B7, color: col(i.B8), colorKey: col(i.B8), spec: { barmat: i.B6 } } }),
  "Bi-fold": (i) => ({ id: "folding", o: { form: i.B5, glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Bi-fold — Euro": (i) => ({ id: "fold_euro", o: { form: i.B5, glassType: i.B10, color: col(i.F10), colorKey: col(i.F10) } }),
  "Bi-fold — lift up": () => ({ id: "fold_lift", o: { form: "มาตรฐาน" } }),
  "Fixed lite": (i) => ({ id: "fixed", o: { form: "กระจกล้วน", glassType: i.B6, color: col(i.B5), colorKey: col(i.B5) } }),
  "Fixed — curved": (i) => ({ id: "curve_fixed", o: { form: "กระจกล้วน", glassType: i.B4 } }),
  "Casement — curved": (i) => ({ id: "curve_open", o: { form: "ดัดโค้ง", glassType: i.B7, color: col(i.B6), colorKey: col(i.B6) } }),
  "Louvre screen": (i) => ({ id: "louver", o: { form: i.B7, spec: { rnBox: i.B2, rnFace: i.B3, rnFrame: i.B5 === "รวม" ? "รวมโครง" : "ไม่รวมโครง" } } }),
  "Louvre screen — rotating": (i) => ({ id: "louver_rotate", o: { form: i.B7, spec: { rnMotor: i.B13 } } }),
  "Sliding gate": (i) => ({ id: "gate", o: { form: i.B6, material: "1.6x4" } }),
  "Shower enclosure": (i) => ({ id: "shower", o: { form: i.B10, glassType: i.B12, material: i.B9, color: col(i.B13), colorKey: col(i.B13) } }),
  "Balustrade": (i) => ({ id: "handrail", o: { form: "มาตรฐาน", glassType: i.B7 } }),
  "Cabinet door — Futuretech": (i) => ({ id: "cabinet_face", o: { form: "บานเลื่อน", glassType: i.B12 } }),
  "Roof / canopy": (i) => {
    const hasSliding = String(i.hasSliding) === "ใช่";
    const id = hasSliding ? "roof_slide" : (i.shape === "หลังคาจั่ว" ? "roof_gable" : "roof");
    const o = { material: i.material, form: PRODUCTS[id].defForm, spec: { batten: i.purlin } };
    if (hasSliding) Object.assign(o.spec, { slidew: String(i.slidingWidth_cm), slideh: String(i.slidingProjection_cm) });
    return { id, o, w: i.width_cm, h: i.projection_cm, p: hasSliding ? (i.slidingLeaves || 2) : 1 };
  },
};

const pct = (got, want) => (want ? ((got - want) / want) * 100 : got ? 100 : 0);
const f0 = (n) => Math.round(n).toLocaleString();
const rows = [];
const skipped = new Map();

for (const c of T.cases) {
  const m = MAP[c.product];
  if (!m) { skipped.set(c.product, (skipped.get(c.product) ?? 0) + 1); continue; }
  const mapped = m(c.inputs);
  const prod = PRODUCTS[mapped.id];
  if (!prod) { skipped.set(c.product + " (ไม่มีรุ่นในเว็บ)", 1); continue; }
  const w = mapped.w ?? c.inputs.width_cm, h = mapped.h ?? c.inputs.height_cm;
  const p = mapped.p ?? c.inputs.panels ?? 1;
  const opt = {
    w, h, p, form: prod.defForm, color: "white", colorKey: "white",
    glassType: prod.defGlass ?? undefined, material: prod.defMaterial ?? undefined,
    spec: {}, addons: {}, ...mapped.o,
  };
  if (!(prod.forms || []).includes(opt.form)) opt.form = prod.defForm;
  let r;
  try { r = computeCost(PB, prod, opt); } catch (e) { skipped.set(c.product + " (error: " + String(e.message).slice(0, 40) + ")", 1); continue; }
  rows.push({
    product: c.product, id: mapped.id, size: `${w}×${h}/${p}`,
    mat: [r.cost.total, c.expected.costMaterial],
    mk: [r.labor.prod, c.expected.costMake],
    inst: [r.labor.install, c.expected.costInstall],
    sell: [r.sell.withInstall, c.expected.sellPrice],
  });
}

// ── สรุปรายรุ่น ──
const by = new Map();
for (const r of rows) {
  const g = by.get(r.product) ?? { n: 0, id: r.id, mat: [], mk: [], inst: [], sell: [] };
  g.n++; g.mat.push(pct(...r.mat)); g.mk.push(pct(...r.mk)); g.inst.push(pct(...r.inst)); g.sell.push(pct(...r.sell));
  by.set(r.product, g);
}
const worst = (a) => a.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
const tag = (x) => (Math.abs(x) < 0.5 ? "✅" : Math.abs(x) < 5 ? "🟡" : "❌");
const sp = (s, n) => String(s).padEnd(n).slice(0, n);

console.log("\n═══ เทียบ \"คิดราคา 4.0\" กับไฟล์ Excel (ชุด ส่งต่อ-เว็บ · tests.json) ═══");
console.log("   % = เว็บสูง/ต่ำกว่าไฟล์ · เอาค่าที่ห่างสุดของแต่ละรุ่น\n");
console.log(sp("รุ่น (ในไฟล์)", 34), sp("รุ่นเว็บ", 15), "เคส  ทุนวัสดุ    ค่าแรงผลิต  ค่าแรงติดตั้ง  ราคาขาย");
for (const [name, g] of by) {
  const c = [worst(g.mat), worst(g.mk), worst(g.inst), worst(g.sell)];
  console.log(sp(name, 34), sp(g.id, 15), String(g.n).padStart(3),
    ...c.map((x) => `${tag(x)}${(x >= 0 ? "+" : "") + x.toFixed(1)}%`.padStart(12)));
}

if (ALL) {
  console.log("\n═══ รายเคส ═══");
  for (const r of rows) {
    const bad = [pct(...r.mat), pct(...r.mk), pct(...r.inst)].some((x) => Math.abs(x) >= 0.5);
    if (!bad) continue;
    console.log(` ${sp(r.product, 30)} ${sp(r.size, 12)} ทุน ${f0(r.mat[0])}/${f0(r.mat[1])} · ผลิต ${f0(r.mk[0])}/${f0(r.mk[1])} · ติดตั้ง ${f0(r.inst[0])}/${f0(r.inst[1])} · ขาย ${f0(r.sell[0])}/${f0(r.sell[1])}`);
  }
}

if (skipped.size) {
  console.log("\n── ยังไม่ได้เทียบ (แมปช่องกรอกไม่ได้) ──");
  for (const [k, v] of skipped) console.log(`   ${k} ×${v}`);
}
const okMat = rows.filter((r) => Math.abs(pct(...r.mat)) < 0.5).length;
console.log(`\n═══ เทียบได้ ${rows.length} เคส · ทุนวัสดุตรงไฟล์ (คลาด <0.5%) ${okMat} เคส ═══`);
