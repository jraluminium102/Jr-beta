// check-g3-faaranae.mjs — ตรวจ ฝ้าระแนงอลู 3 รุ่นใหม่ ที่ dev เพิ่ม (เทียบ CODE-READY 16 มิ.ย.)
// เช็ค: (1) ราคา render engine จริง = rate×area (2) ครบ 3 จุด (product/ชิปธงC/G3_WALL_PRODS)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync("public/calculator/index.html", "utf8");
const vc = new VirtualConsole(); const errs = [];
vc.on("jsdomError", (e) => errs.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const setF = (ch, s, v) => { const el = ch.querySelector(s); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } };

function priceOf(prod, wv, hv) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = [...doc.querySelectorAll("#items .ch")].pop();
  setF(ch, ".i-group", 3);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + prod + '"]')) ps.innerHTML = w.prodOptionsG6("3");
  ps.value = prod; fire(ps, "change");
  setF(ch, ".i-w", wv); setF(ch, ".i-h", hv);
  const r = w.readItem(ch).r;
  return { sell: Math.round(r.sell), area: +r.a.toFixed(2) };
}

// === 1) ราคา 3 รุ่น (w×h=6×3=18 ตร.ม. + เช็คอีกขนาด) ===
const CASES = [
  { id: "ceil_ranae_1x5",  name: "ฝ้าระแนงอลู 1x5ซม.",          rate: 3300 },
  { id: "ceil_ranae_16_5", name: "ฝ้าระแนงอลู 1\"x1.6\" เว้น5ซม.", rate: 3700 },
  { id: "ceil_ranae_16_2", name: "ฝ้าระแนงอลู 1\"x1.6\" เว้น2ซม.", rate: 4800 },
];
const roundUp = (n) => Math.ceil(n / 1000) * 1000;
console.log("\n=== ราคา (render engine จริง) ===");
let priceFail = 0;
for (const c of CASES) {
  const p = priceOf(c.id, 6, 3);              // area 18
  const expect = roundUp(c.rate * p.area);    // per_sqm min0 → rate×area, roundUp พัน
  const ok = p.sell === expect;
  if (!ok) priceFail++;
  console.log(`  ${ok ? "✅" : "🔴"} ${c.name}  area=${p.area}  ได้=${p.sell.toLocaleString()}  คาด(${c.rate}×${p.area}→พัน)=${expect.toLocaleString()}`);
}

// === 2) ครบ 3 จุดในซอร์ส ===
console.log("\n=== ครบ 3 จุด (touch-points) ===");
const checks = [
  ["จุด1 product (3 รุ่น)",   CASES.every((c) => new RegExp("id:'" + c.id + "'").test(html))],
  ["จุด2 ชิป ธงC (g3CeilTypePick)", CASES.every((c) => new RegExp('data-cid="' + c.id + '"[^>]*g3CeilTypePick').test(html))],
  ["จุด2 option o-ceiltype",  CASES.every((c) => new RegExp('value="' + c.id + '"').test(html))],
  ["จุด3 G3_WALL_PRODS",      CASES.every((c) => new RegExp("'" + c.id + "'").test(html.split("G3_WALL_PRODS")[1] ? html.split("G3_WALL_PRODS")[1].slice(0, 600) : ""))],
];
let pointFail = 0;
for (const [label, ok] of checks) { if (!ok) pointFail++; console.log(`  ${ok ? "✅" : "🔴"} ${label}`); }

// === 3) JS error ===
const realErrs = errs.filter((e) => !/Not implemented:|scrollTo/.test(e));
console.log("\n=== JS error ===");
console.log(`  ${realErrs.length === 0 ? "✅ ไม่มี" : "🔴 " + realErrs.length + " ตัว"}`);
realErrs.slice(0, 3).forEach((e) => console.log("    " + e.slice(0, 120)));

console.log(`\n>>> สรุป: ราคา ${priceFail === 0 ? "ผ่าน" : "🔴" + priceFail} · จุด ${pointFail === 0 ? "ครบ" : "🔴" + pointFail} · error ${realErrs.length === 0 ? "0" : "🔴" + realErrs.length}`);
