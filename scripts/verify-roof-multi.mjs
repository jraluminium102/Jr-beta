#!/usr/bin/env node
/**
 * verify-roof-multi — หลังคาหลายด้าน 3 ทรง คิดราคา 4.0 ต้องตรงใบตัด + ไม่มีของหายเงียบ
 * ─────────────────────────────────────────────────────────────────────────────
 * roof_multi → awning_multi · glasshouse_multi → glasshouse_multi · gable_multi → gable_multi
 *
 * ต่างจากรุ่นอื่น: คิดราคา "ไม่มี BOM ของตัวเอง" — เส้นอลู/แผ่นมุงดึงจากเอนจินใบตัดตรง ๆ
 * (src/lib/calculator40/alu-from-cutlist.ts) → ตรงกันโดยโครงสร้าง เทสนี้เลยเน้น
 *   ① ท่อส่งไม่ขาด  ② กับดักที่ทำให้ของหาย/ทุนติดลบ  ③ ตัวแก้ด้านในหน้าเว็บทำงานถูก
 *
 *   node scripts/verify-roof-multi.mjs
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutInputFromRecipe } from "../src/lib/cutlist/from-recipe.ts";
import { cutAluLines, cutRoofConsumLines, multiRoofArea, ALU_FROM_CUTLIST } from "../src/lib/calculator40/alu-from-cutlist.ts";
import { RM } from "../src/lib/calculator40/products.mjs";
import { compareCut } from "../src/lib/calculator40/compare-cut.ts";
import { normalizeSides, removeSide, flattenSides, parseSides } from "../src/lib/calculator40/roof-sides.ts";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`); };

const IDS = ["roof_multi", "glasshouse_multi", "gable_multi"];
const jointEndOf = (id) => (id === "gable_multi" ? "ติดบ้าน" : "ชนผนัง");
// เดินทางเดียวกับหน้าเว็บเป๊ะ (Calculator40Client) — อะไรที่หน้าเว็บส่ง เทสนี้ต้องส่งเหมือนกัน
const calcOf = (id, spec, w = 400, mat = "ไวนิล") => {
  const prod = PRODUCTS[id];
  const map = cutInputFromRecipe({ kind: "std", prodId: id, w, h: 200, p: 1, form: prod.defForm, material: mat, spec }, { rawCompare: true });
  const ci = map.input;
  const opt = { w, h: 200, p: 1, form: prod.defForm, material: mat, color: "white", colorKey: "white", spec, addons: {} };
  const ar = multiRoofArea(id, ci);
  const al = cutAluLines({ prodId: id, cutInput: ci });
  if (al?.length) opt.aluLines = al;
  const cl = cutRoofConsumLines({ prodId: id, cutInput: ci, material: mat, rm: RM, planArea: ar });
  if (cl?.length) opt.consumLines = cl;
  opt.areaOverride = ar;   // ส่งเสมอแม้ 0 (เหมือนหน้าเว็บ)
  return { calc: computeCost(PB, prod, opt), cut: computeCutList(CUT_SPEC_BY_ID[ALU_FROM_CUTLIST[id]], ci, 1), ci, area: ar };
};

// ── ① ท่อส่งจากใบตัดเข้าคิดราคา ──
console.log("\n═══ ① เส้นอลูมาจากใบตัดจริง ไม่ได้เขียนสูตรซ้ำ ═══");
for (const id of IDS) {
  const p = PRODUCTS[id];
  ok(`${id}: ไม่มี BOM ของตัวเอง (alu/consum ว่าง)`, p.alu.length === 0 && p.consum.length === 0);
  ok(`${id}: ผูกกับสูตรตัด ${ALU_FROM_CUTLIST[id]}`, !!CUT_SPEC_BY_ID[ALU_FROM_CUTLIST[id]]);
  const r = calcOf(id, {});
  ok(`${id}: engine รับบรรทัดจากใบตัดจริง (aluFromCutlist)`, r.calc.aluFromCutlist === true);
  ok(`${id}: ออกบรรทัดอลูมีรหัสกล่องครบทุกบรรทัด`,
    r.calc.lines.filter((l) => l.cat === "alu").every((l) => !!l.code),
    r.calc.lines.filter((l) => l.cat === "alu" && !l.code).map((l) => l.name).join(","));
}

// ── ② จำนวนชิ้นต่อรหัส ต้องเท่าใบตัดทุกคอมบิเนชัน ──
console.log("\n═══ ② กวาดทุกรูปแบบ — ชิ้นต่อรหัส ใบตัด = คิดราคา ═══");
{
  // ชุดทดสอบครอบคลุม: 2-6 ด้าน · นูน/เว้า/จบ · ด้านยาวมาก · ด้านที่ยื่นสั้น
  const SETS = [
    { name: "2 ด้าน นูน", n: 2, joints: ["นูน"] },
    { name: "3 ด้าน นูน-เว้า", n: 3, joints: ["นูน", "เว้า"] },
    { name: "4 ด้าน (ค่าตั้งต้นไฟล์)", n: 4, joints: ["นูน", "เว้า", "นูน"] },
    { name: "5 ด้าน เว้าล้วน", n: 5, joints: ["เว้า", "เว้า", "เว้า", "เว้า"] },
    { name: "6 ด้าน นูนล้วน", n: 6, joints: ["นูน", "นูน", "นูน", "นูน", "นูน"] },
    { name: "2 ด้าน จบทันที", n: 2, joints: [] },
  ];
  const SIZES = [[400, 150], [250, 250], [700, 120]];
  let cases = 0; const bad = [];
  for (const id of IDS)
    for (const set of SETS)
      for (const [w, p] of SIZES)
        for (const batten of ["แปเดี่ยว", "แปคู่"]) {
          cases++;
          const spec = { batten };
          for (let i = 1; i <= 6; i++) {
            const on = i <= set.n;
            if (id === "gable_multi") spec[`side${i}D`] = String(on ? w : 0);
            else { spec[`side${i}W`] = String(on ? w : 0); spec[`side${i}P`] = String(on ? p : 0); }
            if (i < 6) spec[`joint${i}`] = set.joints[i - 1] ?? jointEndOf(id);
          }
          const { calc, cut } = calcOf(id, spec);
          const A = new Map(), B = new Map();
          for (const l of calc.lines) if (l.cat === "alu" && l.code) A.set(l.code, (A.get(l.code) ?? 0) + (Number(l.pieces) || 0));
          for (const x of cut.rows) if (x.code && x.code !== "-" && x.qty > 0 && x.len > 0) B.set(x.code, (B.get(x.code) ?? 0) + x.qty);
          for (const [code, q] of B) {
            const got = Math.round(A.get(code) ?? 0);
            if (got !== q) bad.push(`${id}/${set.name}/${w}×${p}/${batten} ${code}: ${got} ≠ ${q}`);
          }
        }
  ok(`${cases} คอมบิเนชัน — ชิ้นตรงกันทุกเคส`, bad.length === 0, bad.slice(0, 4).join(" · "));
}

// ── ③ กับดัก: ของหายเงียบ / ทุนติดลบ ──
console.log("\n═══ ③ กับดัก — ห้ามคิดทุนติดลบ / ราคาหล่นเป็นศูนย์ ═══");
{
  // เว้าลึกเกินกว้างด้านข้างเคียง → ใบตัดได้ความยาวติดลบ ฝั่งคิดราคาต้องข้าม ไม่ใช่คูณราคาติดลบ
  const spec = { side1W: "100", side1P: "150", side2W: "300", side2P: "300", side3W: "0", side3P: "0",
    side4W: "0", side4P: "0", side5W: "0", side5P: "0", side6W: "0", side6P: "0", joint1: "เว้า", joint2: "ชนผนัง" };
  const { calc } = calcOf("roof_multi", spec);
  ok("เว้าลึกเกิน → ไม่มีบรรทัดไหนคิดเงินติดลบ", calc.lines.every((l) => (Number(l.amount) || 0) >= 0),
    calc.lines.filter((l) => (Number(l.amount) || 0) < 0).map((l) => `${l.name}=${l.amount}`).join(","));
  ok("เว้าลึกเกิน → ทุนรวมไม่ติดลบ", calc.cost.total >= 0, String(calc.cost.total));

  // ทุกด้าน 0 → ต้องไม่พัง และต้องไม่คิดเงิน
  const zero = Object.fromEntries([...Array(6)].flatMap((_, i) => [[`side${i + 1}W`, "0"], [`side${i + 1}P`, "0"]]));
  const z = calcOf("roof_multi", zero);
  ok("ไม่กรอกด้านเลย → ไม่ throw", !!z.calc);
  ok("ไม่กรอกด้านเลย → พื้นที่ 0 (ไม่ตกไปใช้ กว้าง×สูง)", z.area === 0, String(z.area));

  // ราคาสำรองต้องไม่หล่นเป็น 0 (สโตร์ยังไม่ตั้งราคากล่อง)
  const r = calcOf("roof_multi", {});
  ok("ทุกบรรทัดอลูมีราคาต่อเส้น > 0", r.calc.lines.filter((l) => l.cat === "alu").every((l) => (Number(l.unitPrice) || 0) > 0));
  ok("แผ่นมุง/เหล็ก มีราคาต่อหน่วย > 0", r.calc.lines.filter((l) => l.cat === "consum").every((l) => (Number(l.unitPrice) || 0) > 0),
    r.calc.lines.filter((l) => l.cat === "consum" && !(Number(l.unitPrice) > 0)).map((l) => l.name).join(","));
}

// ── ④ พื้นที่ = ผลรวมทุกด้าน (ไม่ใช่ กว้าง×สูง) ──
console.log("\n═══ ④ พื้นที่รวมทุกด้าน → ค่าแรงคิดจากตัวนี้ ═══");
{
  const two = calcOf("roof_multi", {});                        // ตั้งต้น 2 ด้าน 400×150 + 300×100 = 9 ตร.ม.
  ok("พื้นที่ตั้งต้น = 4×1.5 + 3×1 = 9 ตร.ม.", two.area === 9, String(two.area));
  ok("ค่าแรงคิดจากพื้นที่รวม ไม่ใช่ กว้าง×สูง (8 ตร.ม.)", two.calc.labor.prod > 0 && two.calc.labor.prod !== computeCost(PB, PRODUCTS.roof, { w: 400, h: 200, p: 1, form: "หลังคาเพิง", material: "ไวนิล", color: "white", colorKey: "white", spec: {}, addons: {} }).labor.prod);
  const spec = { ...Object.fromEntries([...Array(6)].flatMap((_, i) => [[`side${i + 1}W`, i < 4 ? "400" : "0"], [`side${i + 1}P`, i < 4 ? "150" : "0"]])), joint1: "นูน", joint2: "นูน", joint3: "นูน" };
  const four = calcOf("roof_multi", spec);
  ok("4 ด้าน พื้นที่ = 4 × 6 = 24 ตร.ม.", four.area === 24, String(four.area));
  ok("ด้านมากขึ้น = แพงขึ้น", four.calc.cost.total > two.calc.cost.total);
}

// ── ⑤ ตัวแก้ด้านในหน้าเว็บ ──
console.log("\n═══ ⑤ ตัวแก้ด้าน (RoofSidesEditor) — ลบด้านกลางแล้วรอยต่อต้องไม่เลื่อนผิด ═══");
{
  const v = { sides: [{ w: 400, p: 150 }, { w: 300, p: 100 }, { w: 350, p: 200 }, { w: 200, p: 150 }], joints: ["นูน", "เว้า", "นูน"] };
  ok("รอยต่อยาว = ด้าน − 1 เสมอ", normalizeSides(v, "ชนผนัง").joints.length === 3);
  const rm2 = removeSide(v, 1, "ชนผนัง");   // ลบด้าน 2
  ok("ลบด้านกลาง → เหลือ 3 ด้าน 2 รอยต่อ", rm2.sides.length === 3 && rm2.joints.length === 2);
  ok("ลบด้าน 2 → รอยต่อที่เหลือคือ เว้า/นูน (ไม่ใช่ นูน/เว้า)", rm2.joints.join(",") === "เว้า,นูน", rm2.joints.join(","));
  const rm0 = removeSide(v, 0, "ชนผนัง");   // ลบด้านแรก
  ok("ลบด้านแรก → รอยต่อแรกหายไปด้วย", rm0.joints.join(",") === "เว้า,นูน", rm0.joints.join(","));

  const flat = flattenSides(v, "wp", "ชนผนัง");
  ok("แบนเป็นคีย์ side1W..side6P + joint1..joint5 ครบ", flat.side1W === "400" && flat.side4P === "150" && flat.side5W === "0" && flat.joint5 === "ชนผนัง");
  ok("จั่วแบนเป็น side{i}D ไม่ใช่ W/P", flattenSides(v, "d", "ติดบ้าน").side1D === "400");
  const back = parseSides(flat, "wp", "ชนผนัง");
  ok("อ่านกลับได้เท่าเดิม (โหลดสูตรเก่ามาแก้)", back.sides.length === 4 && back.sides[2].w === 350 && back.joints.join(",") === "นูน,เว้า,นูน");
}

// ── ⑥ ค่าตั้งต้น 2 ฝั่งต้องตรงกัน (เคยพลาดมาแล้ว 2 รอบ) ──
console.log("\n═══ ⑥ ค่าตั้งต้น คิดราคา = ใบตัด (ผู้ใช้ยังไม่แตะอะไร ต้องไม่ขึ้นไม่ตรง) ═══");
for (const id of IDS) {
  const c = compareCut(PB, { prodId: id, w: 400, h: 200, p: 1, form: "", material: "ไวนิล", color: "white", spec: {} });
  const bad = [...(c.alu ?? []), ...(c.hardware ?? [])].filter((x) => ["จำนวนต่าง", "มีแต่ใบตัด", "มีแต่คิดราคา"].includes(x.status));
  ok(`${id}: หน้าเทียบเขียวตั้งแต่เปิดหน้า`, bad.length === 0, bad.map((x) => `${x.name}[${x.calcPieces ?? x.calcQty}/${x.cutPieces ?? x.cutQty}]`).join(" · "));
  const j = (PRODUCTS[id].specOpts ?? []).find((o) => o.key === "joint1");
  ok(`${id}: ตัวเลือกรอยต่อตรงกับสูตรตัด`,
    JSON.stringify(j?.opts) === JSON.stringify(CUT_SPEC_BY_ID[ALU_FROM_CUTLIST[id]].opts.find((o) => o.key === "joint1")?.choices),
    JSON.stringify(j?.opts));
}
// จั่วไม่ควรมีช่อง "ปลายหลังคา" (ไฟล์ตัดไม่ได้อ้างค่านี้ = ช่องหลอก)
ok("จั่วหลายด้าน ไม่มีช่องปลายหลังคา (ช่องหลอก)", !(PRODUCTS.gable_multi.specOpts ?? []).some((o) => o.key === "roofend"));

// ⚠ รุ่นใหม่ต้องมี %กำไรตั้งไว้ใน PROFIT — ไม่งั้นตกไปใช้ค่ากลาง (100/100/200) ราคาพุ่ง 2.5 เท่าเงียบ ๆ
//   เจอจริงตอนทำ: กันสาด 4 ด้าน ขายควร ฿183,500 แต่ออกมา ฿355,400 เพราะไม่ได้ตั้ง
console.log("\n═══ ⑦ %กำไร ต้องตั้งไว้ ไม่ตกไปใช้ค่ากลาง ═══");
for (const id of IDS) {
  const t = PB.PROFIT?.[id], base = PB.PROFIT?.[id === "gable_multi" ? "roof_gable" : "roof"];
  ok(`${id}: ตั้ง %กำไรไว้แล้ว เท่ากับหลังคาทรงเดียวกัน`,
    !!t && JSON.stringify(t) === JSON.stringify(base), JSON.stringify(t ?? "ไม่ได้ตั้ง"));
}

// ── ⑧ บั๊กที่ QA จับได้ 27 ส.ค.69 — ห้ามกลับมาอีก ──
console.log("\n═══ ⑧ บั๊กที่เคยเจอ (QA 27 ส.ค.69) ═══");
{
  // #1 พื้นที่ = 0 แล้วค่าแรงต้องเป็น 0 ด้วย — ห้ามตกไปใช้ กว้าง×สูง ที่ค้างในช่องที่ซ่อนไปแล้ว
  const zero = Object.fromEntries([...Array(6)].flatMap((_, i) => [[`side${i + 1}W`, "0"], [`side${i + 1}P`, "0"]]));
  const a = calcOf("roof_multi", zero, 350), b = calcOf("roof_multi", zero, 150);
  ok("ไม่กรอกด้าน → ค่าแรง 0 (ไม่ผูกกับเลขที่ค้างในช่องที่ซ่อน)",
    a.calc.labor.prod === 0 && b.calc.labor.prod === 0, `${a.calc.labor.prod} / ${b.calc.labor.prod}`);
  ok("ไม่กรอกด้าน → ค่าแรงไม่เปลี่ยนตามช่องกว้างที่ค้าง", a.calc.labor.prod === b.calc.labor.prod);

  // #2 กระจกต้องคิดตามพื้นที่หลังคาจริง ไม่ใช่นับแผ่นด้วยความกว้างของไวนิล (เกินจริง 37-96%)
  for (const id of IDS) {
    for (const mat of ["กระจก 4+4", "กระจก 5+5"]) {
      const r = calcOf(id, {}, 400, mat);
      const line = r.calc.lines.find((l) => l.cat === "consum" && /^แผ่นกระจก/.test(l.name));
      ok(`${id}/${mat}: คิดเงินเท่าพื้นที่จริง ${r.area} ตร.ม.`, !!line && Math.abs(line.qty - r.area) < 0.01,
        line ? `${line.qty} ตร.ม.` : "ไม่มีบรรทัดกระจก");
    }
  }
  // แผ่นที่ใบตัดมีชนิดจริง (ชินโคร์/เมทัล) ยังต้องคิดแบบนับแผ่นตามเดิม ไม่ใช่พื้นที่ราบ
  const sc = calcOf("roof_multi", {}, 400, "ชินโคร์ HC");
  const scl = sc.calc.lines.find((l) => l.cat === "consum" && /ชินโคร์/.test(l.name));
  ok("ชินโคร์ (ใบตัดมีชนิดแผ่นจริง) ยังนับตามแผ่น ไม่ใช่พื้นที่ราบ", !!scl && scl.qty > sc.area, `${scl?.qty} vs ${sc.area}`);

  // #3 ช่องรายด้าน/รอยต่อ ต้องถูกกรองออกจากลิสต์ specOpts ทั่วไป (ไม่งั้นโผล่ซ้ำ 2 ที่บนหน้าจอ)
  const re = /^(side\d|joint\d)/;
  const keys = (PRODUCTS.roof_multi.specOpts ?? []).map((o) => o.key).filter((k) => re.test(k));
  ok("regex กรองช่องรายด้าน/รอยต่อ ได้ครบ (กันโผล่ซ้ำ 2 ที่)", keys.length === 17, `กรองได้ ${keys.length} ช่อง`);
  ok("regex ตัวเดียวกับที่หน้าเว็บใช้จริง",
    fs.readFileSync("src/components/Calculator40Client.tsx", "utf8").includes("!/^(side\\d|joint\\d)/.test(o.key)"));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
