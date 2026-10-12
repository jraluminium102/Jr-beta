#!/usr/bin/env node
/**
 * fit-r41-matpct — จูน % กำไรค่าของ (R41.matPct) ให้ยอดรวมเว็บชน ★ ตารางราคาขาย R4.1
 *   node --experimental-strip-types scripts/fit-r41-matpct.mjs --stock stock-live.json          (ดูอย่างเดียว)
 *   node --experimental-strip-types scripts/fit-r41-matpct.mjs --stock stock-live.json --write  (เขียนลง pricebook.json)
 *
 * เจ้าของเคาะ 12 ต.ค.69: "จูนกำไรค่าของเลย" + "รุ่นที่ห่างตามขนาด → ตั้ง % แยกตามช่วงขนาด"
 *   · คิดด้วยราคาสโตร์จริง (--stock) แบบเดียวกับหน้าเว็บ — ต่างจาก audit-r41-pdf --fit ที่ใช้ pricebook ล้วน
 *   · กลุ่มละ % เดียว (รุ่น / แบบย่อย) ถ้าแย่สุดไม่เกิน ±TOL% · เกิน → เก็บเป็นจุด [พื้นที่, %] ลง R41.matPctBySize
 *   · ไม่แตะค่าแรง (ค่าแรงขายมาจากตารางเป๊ะอยู่แล้ว) · ไม่แตะรุ่นใน SKIP
 *   · แถวราคาตายตัว (ไซซ์เล็ก / ขั้นต่ำ Shower) ใช้หาไม่ได้ — ข้าม
 */
import fs from "node:fs";
import { computeCost, r41Key } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const WRITE = process.argv.includes("--write");
const TOL = 3;   // % แย่สุดที่ยอมให้ใช้ % เดียว
// บานตู้ Futuretech: ตาราง R4.1 คิดจากชีตที่ยังไม่เลือกสี/แบบ (ราคาสีชุบ · ไม่มีชุดล้อ/รางยู/ค่ากรีดราง) → ทุนในตารางผิด ห้ามจูนตาม
const SKIP = new Set(["cabinet_face"]);
const VK_IDS = new Set(["roof", "roof_gable", "roof_slide", "louver", "frameless_door", "shower", "gate", "bansolid"]);

const PB_PATH = "src/lib/calculator40/pricebook.json";
const PB0 = JSON.parse(fs.readFileSync(PB_PATH, "utf8"));
const stock = arg("--stock") ? JSON.parse(fs.readFileSync(arg("--stock"), "utf8")) : null;
const mkPB = (src) => (stock ? applyPriceOverride(JSON.parse(JSON.stringify(src)), buildPriceOverride(stock.rows ?? stock, src)) : JSON.parse(JSON.stringify(src)));
const PB = mkPB(PB0);
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8"));
const floorOf = (r) => { const SM = PB.SELL && PB.SELL.products && PB.SELL.products[r.id]; return SM && SM.floor; };
const rows = FX.rows.filter((r) => r.id && r.inputs && PRODUCTS[r.id] && !SKIP.has(r.id) && !r.small
  && !(floorOf(r) && [floorOf(r).base, floorOf(r).withDoor].includes(r.pdf.sT)));
const run = (r, m) => computeCost(PB, PRODUCTS[r.id], { ...r.inputs, profitEdit: { mat: true }, profitMat: m });
const total = (r, m) => run(r, m).sell.withInstall;
const ideal = new Map(), areaOf = new Map();
for (const r of rows) {
  let lo = -90, hi = 800;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (total(r, mid) < r.pdf.sT) lo = mid; else hi = mid; }
  ideal.set(r, hi);
  areaOf.set(r, run(r, 100).laborCalc?.area ?? (r.w * r.h) / 1e4);
}
const groups = new Map();
const add = (k, r) => { const g = groups.get(k) || []; g.push(r); groups.set(k, g); };
for (const r of rows) { const key = r41Key(r.id); if (VK_IDS.has(r.id) && r.vk) add(key + "|" + r.vk, r); else add(key + "|_", r); }
// รุ่นที่มีแบบย่อย แต่บางแถวไม่มี vk ก็เข้ากลุ่ม "_" ตามปกติ
const errOf = (rs, pick) => rs.map((r) => (total(r, pick(r)) / r.pdf.sT - 1) * 100);
const matPct = JSON.parse(JSON.stringify(PB0.R41.matPct || {}));
const bySize = JSON.parse(JSON.stringify(PB0.R41.matPctBySize || {}));
const report = [];
for (const [k, rs] of groups) {
  const [id, vk] = k.split("|");
  const ms = rs.map((r) => ideal.get(r));
  let best = null;
  for (let m = Math.floor(Math.min(...ms)) - 2; m <= Math.ceil(Math.max(...ms)) + 2; m++) {
    const errs = errOf(rs, () => m), worst = Math.max(...errs.map(Math.abs)), sum = errs.reduce((a, e) => a + Math.abs(e), 0);
    if (!best || worst < best.worst - 1e-9 || (Math.abs(worst - best.worst) < 1e-9 && sum < best.sum)) best = { m, worst, sum, errs };
  }
  const before = errOf(rs, (r) => { const M = (PB0.R41.matPct || {})[id]; return M == null ? 100 : typeof M === "number" ? M : (vk !== "_" && M[vk] != null ? M[vk] : (M._ ?? 100)); });
  (matPct[id] = typeof matPct[id] === "object" && matPct[id] ? matPct[id] : {})[vk] = best.m;
  let pts = null, after = best.errs;
  if (best.worst > TOL) {
    // จุด [พื้นที่, %] · ถ้าตารางมีหลายจำนวนบาน → แยกชุดตามจำนวนบาน (p2/p3/p4) ไม่งั้น % แกว่งขึ้นลงตามขนาด
    const mkPts = (list) => { const byA = new Map();
      for (const r of list) { const a = Math.round(areaOf.get(r) * 100) / 100; const l = byA.get(a) || []; l.push(ideal.get(r)); byA.set(a, l); }
      return [...byA.entries()].sort((a, b) => a[0] - b[0]).map(([a, l]) => [a, Math.round(l.reduce((x, y) => x + y, 0) / l.length)]); };
    const panelsOf = (r) => Number(r.inputs.p) || 1;
    const ps = [...new Set(rs.map(panelsOf))].sort((a, b) => a - b);
    if (ps.length > 1) { pts = {}; for (const p of ps) pts["p" + p] = mkPts(rs.filter((r) => panelsOf(r) === p)); }
    else pts = mkPts(rs);
    (bySize[id] = bySize[id] || {})[vk] = pts;
    const pbT = JSON.parse(JSON.stringify(PB)); pbT.R41.matPct = matPct; pbT.R41.matPctBySize = bySize;
    after = rs.map((r) => (computeCost(pbT, PRODUCTS[r.id], { ...r.inputs }).sell.withInstall / r.pdf.sT - 1) * 100);
  } else if (bySize[id]) { delete bySize[id][vk]; if (!Object.keys(bySize[id]).length) delete bySize[id]; }
  const w = (a) => Math.max(...a.map(Math.abs)).toFixed(1);
  report.push([id, vk === "_" ? "(ทั้งรุ่น)" : vk, rs.length, `ก่อน ±${w(before)}%`, pts ? (Array.isArray(pts) ? `แยกขนาด ${pts.length} จุด` : `แยกตามจำนวนบาน+ขนาด ${JSON.stringify(pts)}`) : `${best.m}%`, `หลัง ±${w(after)}%`].join(" | "));
}
console.log("รุ่น | แบบย่อย | แถว | ก่อนจูน | % ใหม่ | หลังจูน");
for (const l of report) console.log(l);
if (WRITE) {
  PB0.R41.matPct = matPct; PB0.R41.matPctBySize = bySize;
  fs.writeFileSync(PB_PATH, JSON.stringify(PB0, null, 2) + "\n");
  console.log("\nเขียน R41.matPct + R41.matPctBySize ลง pricebook.json แล้ว");
}
