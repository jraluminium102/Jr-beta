#!/usr/bin/env node
/**
 * audit-r41-pdf — เทียบคิดราคา 4.0 กับ ★ ตารางราคาขาย R4.1 "ทุกแถวในตาราง" (ไม่ใช่ชุดทดสอบเก่า)
 *   node scripts/audit-r41-pdf.mjs            → รายงาน + exit 1 ถ้าค่าแรงขายไม่ตรงตาราง
 *   node scripts/audit-r41-pdf.mjs --rows     → รายแถว
 *   node scripts/audit-r41-pdf.mjs --fit      → คำนวณ % กำไรค่าของตั้งต้นที่ทำให้ยอดรวมชนตาราง (แสดงอย่างเดียว)
 *   node scripts/audit-r41-pdf.mjs --fit --write → เขียน % ลง pricebook.json (R41.matPct)
 *
 * กติกาเจ้าของ (10 ก.ย.69)
 *   · ค่าผลิต/ค่าติดตั้ง (ขาย) = ช่องในตาราง R4.1 เป๊ะ — ห้ามเมคเอง
 *   · ยอดรวมไม่เท่า "ราคาขาย รวมทั้งชุด" → ปรับ % กำไรค่าของตั้งต้นให้เท่า (+/- ได้นิดหน่อย)
 *   · ⚠ บทเรียน: ตารางสถานะรอบก่อนเทียบกับ ส่งต่อ-เว็บ/tests.json (export รุ่นเก่า ขนาด/ทุนคนละชุด) = ผิดฐาน
 *
 * ข้อมูล: scripts/fixtures/r41-rows.json (สร้างจาก PDF ด้วย scripts/gen-r41-table.mjs)
 */
import fs from "node:fs";
import { computeCost, r41Key } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const PB_PATH = "src/lib/calculator40/pricebook.json";
const PB = JSON.parse(fs.readFileSync(PB_PATH, "utf8"));
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8"));
const ARG = new Set(process.argv.slice(2));
const TOL_TOTAL_PCT = 5;   // ยอดรวมต่างจากตารางได้ไม่เกิน ±5% ("+- ได้นิดหน่อย")

const rows = FX.rows.filter((r) => r.id && r.inputs && PRODUCTS[r.id]);
const run = (pb, r, extra = {}) => computeCost(pb, PRODUCTS[r.id], { ...r.inputs, ...extra });
// หลังคา/ระแนง/บานเปลือย/Shower/ประตูรั้ว มีแบบย่อยในตาราง → ตั้ง % แยกได้
const VK_IDS = new Set(["roof", "roof_gable", "roof_slide", "louver", "frameless_door", "shower", "gate", "bansolid"]);

// ── --fit: หา % ค่าของตั้งต้น ─────────────────────────────────────────────
if (ARG.has("--fit")) {
  const pb = JSON.parse(JSON.stringify(PB));
  const floorOf = (r) => { const SM = pb.SELL && pb.SELL.products && pb.SELL.products[r.id]; return SM && SM.floor; };
  // แถวที่ราคาตายตัว (ไซซ์เล็ก / ขั้นต่ำ Shower) ใช้หา % ไม่ได้ — ตารางไม่ได้มาจากสูตร
  const fitRows = rows.filter((r) => !r.small && !(floorOf(r) && [floorOf(r).base, floorOf(r).withDoor].includes(r.pdf.sT)));
  const total = (r, m) => run(pb, r, { profitEdit: { mat: true }, profitMat: m }).sell.withInstall;
  // % จริงของแต่ละแถวที่ทำให้ยอดรวมแตะตาราง (ยอดรวมขึ้นตาม % เสมอ → binary search)
  const ideal = new Map();
  for (const r of fitRows) {
    let lo = -90, hi = 600;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (total(r, mid) < r.pdf.sT) lo = mid; else hi = mid; }
    ideal.set(r, hi);
  }
  const groups = new Map();
  const add = (k, r) => { const g = groups.get(k) || []; g.push(r); groups.set(k, g); };
  for (const r of fitRows) { add(r.id + "|_", r); if (VK_IDS.has(r.id) && r.vk) add(r.id + "|" + r.vk, r); }
  const out = {};
  console.log("รุ่น | แบบย่อย | แถว | % ตั้งต้น | ยอดรวมต่างจากตาราง (แย่สุด)");
  for (const [k, rs] of groups) {
    const [id, vk] = k.split("|");
    const ms = rs.map((r) => ideal.get(r));
    let best = null;
    for (let m = Math.floor(Math.min(...ms)) - 2; m <= Math.ceil(Math.max(...ms)) + 2; m++) {
      const errs = rs.map((r) => (total(r, m) / r.pdf.sT - 1) * 100);
      const worst = Math.max(...errs.map(Math.abs)), sum = errs.reduce((a, e) => a + Math.abs(e), 0);
      if (!best || worst < best.worst - 1e-9 || (Math.abs(worst - best.worst) < 1e-9 && sum < best.sum)) best = { m, worst, sum, errs };
    }
    (out[id] = out[id] || {})[vk] = best.m;
    console.log([id, vk === "_" ? "(ทั้งรุ่น)" : vk, rs.length, best.m + "%", best.errs.map((e) => (e >= 0 ? "+" : "") + e.toFixed(1)).join(" ")].join(" | "));
  }
  if (ARG.has("--write")) {
    PB.R41.matPct = out;
    fs.writeFileSync(PB_PATH, JSON.stringify(PB, null, 2) + "\n");
    console.log("\nเขียน R41.matPct ลง pricebook.json แล้ว (" + Object.keys(out).length + " รุ่น)");
  }
  process.exit(0);
}

// ── รายงาน ───────────────────────────────────────────────────────────────
const n = (x) => Math.round(x).toLocaleString("en-US");
const sg = (x) => (x > 0 ? "+" : "") + n(x);
const res = rows.map((r) => {
  const w = run(PB, r);
  const P = w.sell.parts || { prod: 0, inst: 0 };
  // เทียบค่าแรงขายได้ก็ต่อเมื่อทุนค่าแรงเว็บเท่าตาราง (ต่างไม่เกิน 1 บาท) — ไม่งั้นเป็นเรื่องทุน ไม่ใช่เรื่องกำไร
  const cmpP = Math.abs(w.labor.prod - r.pdf.cP) <= 1, cmpI = Math.abs(w.labor.install - r.pdf.cI) <= 1;
  return {
    r, w, cmpP, cmpI,
    dP: P.prod - r.pdf.sP, dI: P.inst - r.pdf.sI,
    dCostP: w.labor.prod - r.pdf.cP, dCostI: w.labor.install - r.pdf.cI,
    dT: (w.sell.withInstall / r.pdf.sT - 1) * 100,
    sum: Math.abs(P.mat + P.prod + P.inst - w.sell.withInstall) < 0.01,
    r41: !!(w.sellModel && w.sellModel.r41),
  };
});

if (ARG.has("--rows")) {
  console.log("รุ่น | แบบ | ขนาด | ค่าผลิต เว็บ/ตาราง | ค่าติดตั้ง เว็บ/ตาราง | ยอดรวม เว็บ/ตาราง | ต่าง%");
  for (const x of res) console.log([r41Key(x.r.id), x.r.vk || "-", x.r.w + "×" + x.r.h + (x.r.p > 1 ? " " + x.r.p + "บาน" : ""),
    n(x.w.sell.parts?.prod ?? 0) + "/" + n(x.r.pdf.sP) + (x.cmpP ? "" : " (ทุน " + sg(x.dCostP) + ")"),
    n(x.w.sell.parts?.inst ?? 0) + "/" + n(x.r.pdf.sI) + (x.cmpI ? "" : " (ทุน " + sg(x.dCostI) + ")"),
    n(x.w.sell.withInstall) + "/" + n(x.r.pdf.sT), (x.dT >= 0 ? "+" : "") + x.dT.toFixed(1)].join(" | "));
  process.exit(0);
}

const by = new Map();
for (const x of res) { const g = by.get(x.r.id) || []; g.push(x); by.set(x.r.id, g); }
let labBad = 0, labCmp = 0, totBad = 0, notR41 = 0, sumBad = 0;
const costIssues = [];
console.log("═══ คิดราคา 4.0 ↔ ★ ตารางราคาขาย R4.1 · " + res.length + " แถว ═══\n");
console.log("รุ่น | แถว | ค่าแรงขายตรงตาราง | ยอดรวมต่าง (แย่สุด) | หมายเหตุ");
for (const [id, xs] of by) {
  const cmp = xs.reduce((a, x) => a + (x.cmpP ? 1 : 0) + (x.cmpI ? 1 : 0), 0);
  const ok = xs.reduce((a, x) => a + (x.cmpP && x.dP === 0 ? 1 : 0) + (x.cmpI && x.dI === 0 ? 1 : 0), 0);
  labCmp += cmp; labBad += cmp - ok;
  const worst = xs.reduce((a, x) => (Math.abs(x.dT) > Math.abs(a) ? x.dT : a), 0);
  const badT = xs.filter((x) => Math.abs(x.dT) > TOL_TOTAL_PCT).length; totBad += badT;
  notR41 += xs.filter((x) => !x.r41).length; sumBad += xs.filter((x) => !x.sum).length;
  const costOff = xs.filter((x) => !x.cmpP || !x.cmpI);
  if (costOff.length) costIssues.push(id + " (" + costOff.length + "/" + xs.length + " แถว · ทุนค่าแรงเว็บต่าง ผลิต " + sg(costOff[0].dCostP) + " ติดตั้ง " + sg(costOff[0].dCostI) + " ที่ " + costOff[0].r.w + "×" + costOff[0].r.h + ")");
  const note = [badT ? "⚠ " + badT + " แถวเกิน ±" + TOL_TOTAL_PCT + "%" : "", costOff.length ? "ทุนค่าแรงเว็บไม่ตรง " + costOff.length + " แถว" : ""].filter(Boolean).join(" · ");
  console.log([id, xs.length, ok + "/" + cmp, (worst >= 0 ? "+" : "") + worst.toFixed(1) + "%", note || "✅"].join(" | "));
}
console.log("\n── สรุป ──");
console.log("ค่าแรงขาย (เฉพาะช่องที่ทุนค่าแรงตรงตาราง): ตรง " + (labCmp - labBad) + "/" + labCmp);
console.log("ยอดรวมเกิน ±" + TOL_TOTAL_PCT + "%: " + totBad + " แถว · ไม่ได้ใช้โมเดล R4.1: " + notR41 + " · 3 ก้อนรวมไม่เท่ายอดขาย: " + sumBad);
if (costIssues.length) { console.log("\nทุนค่าแรงบนเว็บไม่ตรงตาราง (เป็นเรื่องสูตรค่าแรง ไม่ใช่กำไร):"); for (const c of costIssues) console.log("  · " + c); }
const skipped = FX.rows.filter((r) => !r.id || !r.inputs);
if (skipped.length) {
  console.log("\nเทียบไม่ได้ " + skipped.length + " แถว:");
  const m = new Map(); for (const r of skipped) { const k = r.head + " — " + (r.note || ""); m.set(k, (m.get(k) || 0) + 1); }
  for (const [k, c] of m) console.log("  ⚪ " + k + " (" + c + ")");
}
process.exit(labBad || notR41 || sumBad ? 1 : 0);
