// QA Tester #3 — บานกระจกติดตาย (fixed_glass) + บานเฟี้ยม (folding) · R3.9
// รันจริงใน jsdom: โหลด index.html → addItem → set fields → readItem → อ่าน it.r.sell
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});
const w = dom.window, doc = w.document;

function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel);
  el.value = String(value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  return el;
}

// สร้าง 1 บาน ตั้ง group/prod/ขนาด/panels แล้วคืน readItem
function makeItem({ group, prod, ww, hh, panels }) {
  doc.getElementById("items").innerHTML = "";
  w.addItem();
  const ch = doc.querySelector("#items .ch");
  setField(ch, ".i-group", group);            // เปลี่ยน group → rebuild .i-prod options
  setField(ch, ".i-prod", prod);              // เลือกแบบ
  setField(ch, ".i-w", ww);
  setField(ch, ".i-h", hh);
  if (panels != null) setField(ch, ".i-panels", panels);
  setField(ch, ".i-qty", "1");
  w.calcQuote();
  return w.readItem(ch);
}

// ---- mirror logic (สูตรมือ = mirror โค้ดเครื่อง) ----
const RATES_FIX = [[0.5,1.0,8000],[1.0,1.5,7500],[1.5,2.0,7000],[2.0,2.5,6500],[2.5,3.0,6000],[3.0,3.5,5000],[3.5,9999,5000]];
const rateOf = (area, t) => { if (area < t[0][0]) return t[0][2]; for (const r of t) if (area >= r[0] && area < r[1]) return r[2]; return t[t.length-1][2]; };
const roundUp = (x) => Math.ceil(x/1000)*1000;
const monoRate = (area, t) => { let v = area*rateOf(area,t); for (const r of t) if (r[1] <= area) { const e = r[1]*r[2]; if (e > v) v = e; } return v; };
const fixExpect = (ww, hh) => roundUp(Math.max(5000, monoRate(ww*hh, RATES_FIX)));
const foldExpect = (ww, hh, panels) => roundUp(Math.max(ww*hh*9000, 15000*Math.max(1,panels))); // unit_rate 9000, per_panel_min 15000

const rows = [];
const fmt = (n) => Number.isFinite(n) ? n.toLocaleString("en-US") : String(n);

// ===== TC1: ติดตาย 1.0 × 1.2 (A=1.20 → ช่วง 1.0-1.5 เรต 7500) =====
{
  const A = 1.0 * 1.2;
  const it = makeItem({ group: "1", prod: "fixed_glass", ww: "1.0", hh: "1.2", panels: "1" });
  const exp = fixExpect(1.0, 1.2);
  const act = it.r.sell;
  rows.push(["TC1","กระจกติดตาย","1.0×1.2",A.toFixed(2),"7500",exp,act, act===exp?"PASS":"FAIL", (it.r.msgs||[]).join(" ")]);
}
// ===== TC2: ติดตาย 2.0 × 1.5 (A=3.00 boundary → ช่วง 2.5-3.0 เรต 6000) =====
{
  const A = 2.0 * 1.5;
  const it = makeItem({ group: "1", prod: "fixed_glass", ww: "2.0", hh: "1.5", panels: "1" });
  const exp = fixExpect(2.0, 1.5);
  const act = it.r.sell;
  // หมายเหตุ: A=3.00 พอดี → rateOf เลือกช่วง [3.0,3.5)=5000 (เพราะ area>=3.0) ไม่ใช่ 6000
  const rateUsed = rateOf(A, RATES_FIX);
  rows.push(["TC2","กระจกติดตาย","2.0×1.5",A.toFixed(2),String(rateUsed),exp,act, act===exp?"PASS":"FAIL", (it.r.msgs||[]).join(" ")]);
}
// ===== TC3: ติดตาย เล็ก 0.6 × 0.6 (A=0.36 → ต่ำกว่า 0.5 → ติดขั้นต่ำ 5000) =====
{
  const A = 0.6 * 0.6;
  const it = makeItem({ group: "1", prod: "fixed_glass", ww: "0.6", hh: "0.6", panels: "1" });
  const exp = fixExpect(0.6, 0.6);
  const act = it.r.sell;
  const rateUsed = rateOf(A, RATES_FIX);
  rows.push(["TC3","กระจกติดตาย","0.6×0.6",A.toFixed(2),String(rateUsed)+" (ติดขั้นต่ำ)",exp,act, act===exp?"PASS":"FAIL", (it.r.msgs||[]).join(" ")]);
}
// ===== TC4: บานเฟี้ยม เซมิยูโร 3.2 × 2.4 =====
{
  const A = 3.2 * 2.4; // 7.68
  // panels default — ลองอ่านค่าจริงจาก field
  const it = makeItem({ group: "1", prod: "folding", ww: "3.2", hh: "2.4", panels: null });
  const ch = doc.querySelector("#items .ch");
  const panels = parseInt(ch.querySelector(".i-panels")?.value) || 1;
  const exp = foldExpect(3.2, 2.4, panels);
  const act = it.r.sell;
  rows.push(["TC4","บานเฟี้ยม เซมิยูโร","3.2×2.4 ("+panels+" บาน)",A.toFixed(2),"fold: 9000/ตร.ม.",exp,act, act===exp?"PASS":"FAIL", (it.r.msgs||[]).join(" ")]);
}

// ===== รายงาน =====
console.log("=== QA T3 — บานกระจกติดตาย + บานเฟี้ยม (R3.9) ===\n");
const header = ["TC","สินค้า","Input","พื้นที่","เรตที่ใช้","Expected","Actual","ผล","หมายเหตุ(msgs)"];
console.log(header.join(" | "));
console.log(header.map(()=>"---").join(" | "));
let pass = 0;
for (const r of rows) {
  if (r[7] === "PASS") pass++;
  const out = [...r];
  out[5] = fmt(out[5]); out[6] = fmt(out[6]);
  console.log(out.join(" | "));
}
console.log(`\nผ่าน ${pass}/${rows.length}`);

const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external|net::|localStorage|scrollTo|Not implemented/i.test(e));
if (jsErrs.length) console.log("\nJS errors:\n" + jsErrs.join("\n"));
process.exit(pass === rows.length ? 0 : 1);
