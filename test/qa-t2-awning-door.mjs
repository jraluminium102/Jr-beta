// QA Tester #2 — บานกระทุ้ง (awning_euro) + ประตูบานเปิด (casement_euro)
// พิสูจน์ด้วยการรันจริงใน jsdom — ไม่เดา
// รัน: node test\qa-t2-awning-door.mjs
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

const w = dom.window;
const doc = w.document;

function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel);
  el.value = String(value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  return el;
}

// สร้าง 1 บานในชุดใหม่, ตั้ง product + ขนาด + panels แล้วอ่าน readItem
function makeItem({ prod, group, type, width, height, panels, qty }) {
  doc.getElementById("items").innerHTML = "";
  const setBox = w.addSet();
  const ch = setBox.querySelector(".ch");
  if (group != null) setField(ch, ".i-group", String(group));
  // group เปลี่ยน → rebuild prod options; ตั้ง prod หลัง group
  setField(ch, ".i-prod", prod);
  // rebuild options ของ product (closer ฯลฯ)
  if (typeof w.buildItemOpts === "function") w.buildItemOpts(ch);
  if (type != null) setField(ch, ".i-type", type);
  setField(ch, ".i-w", width);
  setField(ch, ".i-h", height);
  if (ch.querySelector(".i-panels")) setField(ch, ".i-panels", panels || 1);
  setField(ch, ".i-qty", qty || 1);
  // ไม่ตั้ง override → ใช้สูตรเครื่องจริง
  w.calcQuote();
  const it = w.readItem(ch);
  return it;
}

const results = [];
function tc(id, label, it, expected, note) {
  const actual = it && it.r ? it.r.sell : NaN;
  const area = it && it.r ? it.r.a : NaN;
  const msgs = it && it.r ? (it.r.msgs || []).join(" | ") : "";
  const pass = actual === expected;
  results.push({ id, label, area, expected, actual, pass, note, msgs });
}

// ---------- TC1: กระทุ้ง 0.9×0.6 (พื้นที่ 0.54) ----------
// rateOf: area 0.54 < 0.6 → คืน rate ช่อง [0.6,0.8]=18000
// monoRate = 0.54×18000 = 9,720 ; bump max(r[1]*r[2]) ของช่องที่ r[1]<=0.54 = ไม่มี → 9,720
// base = max(min 10000, 9720) = 10,000  ← เครื่องใช้ min 10,000 (spec ระบุ 10,800)
const it1 = makeItem({ prod: "awning_euro", group: 1, type: "window", width: "0.9", height: "0.6", panels: 1 });
tc("TC1", "กระทุ้ง 0.9×0.6", it1, 10000, "spec คาด max(10800, 0.6×18000)=10,800 · เครื่อง min=10,000");

// ---------- TC2: กระทุ้ง 1.2×1.0 (พื้นที่ 1.2 → ช่วง 1.1-1.3 เรต 12000) ----------
// monoRate = 1.2×12000 = 14,400 ; bump: ช่อง [0.8,1.1] r[1]=1.1<=1.2 → 1.1×14400=15,840 > 14,400 → 15,840
//           ช่อง [0.6,0.8] r[1]=0.8 → 0.8×18000=14,400 ; สูงสุด=15,840
// base = max(10000, 15840) = 15,840  ← bump ทำให้ ≠ 14,400 ตาม spec ตรงๆ
const it2 = makeItem({ prod: "awning_euro", group: 1, type: "window", width: "1.2", height: "1.0", panels: 1 });
tc("TC2", "กระทุ้ง 1.2×1.0", it2, 16000, "spec มือ 1.2×12000=14,400 · เครื่อง bump 1.1×14400=15,840 → roundUp 16,000");

// ---------- TC3: ประตูบานเปิดเดี่ยว 1.0×2.2 (พื้นที่ 2.2 → ช่วง 2.0-2.4 เรต 7500) ----------
// monoRate = 2.2×7500 = 16,500 ; bump: ช่อง [2.0,2.4] r[1]=2.4>2.2 ไม่ใช้ → 16,500
// base = max(min 18000, 16500) = 18,000  ← ตรง spec
const it3 = makeItem({ prod: "casement_euro", group: 1, type: "door", width: "1.0", height: "2.2", panels: 1 });
tc("TC3", "บานเปิดเดี่ยว 1.0×2.2", it3, 18000, "spec max(18000, 2.2×7500=16,500)=18,000 · ตรง");

// ---------- TC4: ประตูบานเปิดคู่ 1.6×2.2 (พื้นที่ 3.52) panels=2 ----------
// rateOf 3.52 → ช่อง [3.5,4.0]=6500 ; monoRate=3.52×6500=22,880
//   bump ช่อง r[1]<=3.52: [3.0,3.5]→3.5×7000=24,500 ; [2.4,3.0]→3.0×7000=21,000 ; [2.0,2.4]→2.4×7500=18,000 → สูงสุด 24,500
// base = max(18000, 24500) = 24,500
// addon door (panels>=2) extra 14,000 → core = base + 14,000 = 38,500
// floor (panels>1): per=monoRate(3.52/2=1.76,OPEN) → 1.76<2.0 rate=7500 → 1.76×7500=13,200 ; floor=13200×(1+0.67)=22,044
// core = max(38500, 22044) = 38,500  ← ไม่ติดขั้นต่ำคู่ 32,000 (เกินอยู่แล้ว)
const it4 = makeItem({ prod: "casement_euro", group: 1, type: "door", width: "1.6", height: "2.2", panels: 2 });
tc("TC4", "บานเปิดคู่ 1.6×2.2", it4, 39000, "spec คู่ขั้นต่ำ 32,000 · base 24,500 + บานคู่ 14,000 = 38,500 → roundUp 39,000 (เกินขั้นต่ำคู่)");

// ---------- รายงาน ----------
console.log("=== QA T2 — บานกระทุ้ง + ประตูบานเปิด (รันจริง jsdom) ===\n");
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : String(n));
let pass = 0;
for (const r of results) {
  console.log(
    `${r.pass ? "PASS" : "DIFF"} ${r.id} ${r.label} | area=${r.area} | Expected=${fmt(r.expected)} | Actual=${fmt(r.actual)}`
  );
  console.log(`     หมายเหตุ: ${r.note}`);
  console.log(`     msgs: ${r.msgs}`);
  if (r.pass) pass++;
}
console.log(`\nผ่าน(ตรง expected ที่ตั้งจากโค้ดจริง) ${pass}/${results.length}`);

const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external|net::|localStorage|scrollTo|Not implemented/i.test(e));
if (jsErrs.length) console.log("\nJS errors:\n" + jsErrs.join("\n"));
