// qa-options.mjs — F2 (ราวจับ) + F3 (ผ้ามุ้ง) wiring verification · รันจริงใน jsdom
// พิสูจน์: หลัง wiring buildItemOpts/readItem แล้ว option dropdown render จริง
// และราคา sell บวก add-on ตรงสูตร (เทียบ "ก่อน vs หลัง" เลือก option)
// ห้ามแก้สูตร — ราคาทุกตัวมาจาก readItem/calcUnit ของตัวเครื่อง
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "../public/calculator/index.html"), "utf8");

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

function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function addItem(container) { w.addItem(container); const chs = container.querySelectorAll(".ch"); return chs[chs.length - 1]; }
function setField(ch, sel, value) {
  const el = ch.querySelector(sel);
  if (!el) throw new Error("ไม่พบ field " + sel);
  el.value = String(value);
  fire(el, "input"); fire(el, "change");
  return el;
}
function setItem(ch, cfg) {
  if (cfg.group != null) setField(ch, ".i-group", cfg.group);
  if (cfg.prod != null) {
    const prodSel = ch.querySelector(".i-prod");
    if (!prodSel.querySelector('option[value="' + cfg.prod + '"]')) {
      prodSel.innerHTML = w.prodOptionsG6(String(cfg.group || ch.querySelector(".i-group").value));
    }
    prodSel.value = cfg.prod;
    if (prodSel.value !== cfg.prod) throw new Error("เลือก prod ไม่ได้: " + cfg.prod);
    fire(prodSel, "change");
  }
  if (cfg.type != null) setField(ch, ".i-type", cfg.type);
  if (cfg.w != null) setField(ch, ".i-w", cfg.w);
  if (cfg.h != null) setField(ch, ".i-h", cfg.h);
  if (cfg.panels != null) setField(ch, ".i-panels", cfg.panels);
  if (cfg.qty != null) setField(ch, ".i-qty", cfg.qty);
}
function setOpt(ch, sel, val) {
  const oel = ch.querySelector(sel);
  if (!oel) throw new Error("ไม่พบ option " + sel + " (UI ไม่ render)");
  if (oel.type === "checkbox") oel.checked = !!val; else oel.value = String(val);
  fire(oel, "input"); fire(oel, "change");
  return oel;
}
function clearItems() { doc.getElementById("items").innerHTML = ""; w.qSplit = false; w.qSplitGroups = {}; }
const fmt = (x) => (isNaN(x) ? "—" : Math.round(x).toLocaleString("en-US"));
const roundUp = (x) => Math.ceil(x / 1000) * 1000;

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
}

// ============================================================
// F2 — ราวจับ (handrail) · product imp1, width=6
// ============================================================
console.log("=== F2 — ราวจับ (handrail) · imp1 กว้าง=6 ===\n");
{
  clearItems();
  const ch = addItem(doc.getElementById("items"));
  setItem(ch, { group: 2, prod: "imp1", w: 6, h: 1, qty: 1 });

  // 1) dropdown render จริง
  const hasDropdown = !!ch.querySelector(".o-handrail");
  check("F2 dropdown .o-handrail render (imp1)", hasDropdown, hasDropdown ? "render" : "ไม่ render");

  // 2) readItem อ่านค่า key handrail
  const optKeys = Object.keys(w.readItem(ch).optSel || {});
  check("F2 readItem.optSel มี key 'handrail'", optKeys.includes("handrail"), optKeys.includes("handrail") ? "มี" : "ไม่มี");

  // base (option='')
  setOpt(ch, ".o-handrail", "");
  const base = w.readItem(ch).r.sell;
  const len = w.readItem(ch).r.a; // = 6

  // u5: +500/ม. → roundUp(base_raw + 500*len)
  setOpt(ch, ".o-handrail", "u5");
  const sellU5 = w.readItem(ch).r.sell;
  const expU5 = roundUp(base + 500 * len); // base เป็น roundUp อยู่แล้ว (60000) → 63000
  check("F2 u5 sell = base + 500×6", sellU5 === expU5,
    `base=${fmt(base)} → u5=${fmt(sellU5)} (คาด ${fmt(expU5)}) · delta=${fmt(sellU5 - base)} (สูตร +${fmt(500 * len)})`);

  // box: +600/ม. → roundUp(base_raw + 600*len)
  setOpt(ch, ".o-handrail", "box");
  const sellBox = w.readItem(ch).r.sell;
  const expBox = roundUp(base + 600 * len);
  check("F2 box sell = base + 600×6", sellBox === expBox,
    `base=${fmt(base)} → box=${fmt(sellBox)} (คาด ${fmt(expBox)}) · delta=${fmt(sellBox - base)} (สูตร +${fmt(600 * len)})`);

  console.log(`  imp1 กว้าง=6: base=${fmt(base)} · u5=${fmt(sellU5)} (Δ${fmt(sellU5 - base)}) · box=${fmt(sellBox)} (Δ${fmt(sellBox - base)})\n`);
}

// ============================================================
// F3 — ผ้ามุ้ง (screen_addon) · product imp21
// ============================================================
console.log("=== F3 — ผ้ามุ้ง (screen_addon) · imp21 ===\n");
{
  clearItems();
  const ch = addItem(doc.getElementById("items"));
  setItem(ch, { group: 5, prod: "imp21", type: "window", w: 1.5, h: 2.0, panels: 1, qty: 1 });

  const hasDropdown = !!ch.querySelector(".o-screenfabric");
  check("F3 dropdown .o-screenfabric render (imp21)", hasDropdown, hasDropdown ? "render" : "ไม่ render");

  const optKeys = Object.keys(w.readItem(ch).optSel || {});
  check("F3 readItem.optSel มี key 'screenFabric'", optKeys.includes("screenFabric"), optKeys.includes("screenFabric") ? "มี" : "ไม่มี");

  // base = fiber (default, +0)
  setOpt(ch, ".o-screenfabric", "fiber");
  const it0 = w.readItem(ch).r;
  const base = it0.sell, A = it0.a; // A = พื้นที่

  // cat: +800/ตร.ม.
  setOpt(ch, ".o-screenfabric", "cat");
  const sellCat = w.readItem(ch).r.sell;
  // base raw = max(min, A*rate); cat บวก A*800 ก่อน roundUp. base เป็น roundUp ของ base_raw
  // ใช้ delta เทียบสูตร: ตรวจว่า sell = roundUp(base_raw + A*800). หา base_raw จาก msgs ไม่ได้ → ตรวจผ่าน roundUp ของ (base ก่อน roundUp ไม่รู้)
  // วิธีพิสูจน์ที่แน่นอน: คำนวณ base_raw เองจาก A,rate,min แล้วเทียบทั้ง base และ sellCat
  const RATES_IMP21 = [[0.0, 1.5, 2200], [1.5, 2.5, 1700], [2.5, 9999, 1500]];
  const rateOf = (a, t) => { if (a < t[0][0]) return t[0][2]; for (const r of t) { if (a >= r[0] && a < r[1]) return r[2]; } return t[t.length - 1][2]; };
  const rate = rateOf(A, RATES_IMP21);
  const baseRaw = Math.max(1200 * 1, A * rate); // min_window=1200 × panel 1
  check("F3 base (fiber) = roundUp(max(min, A×rate))", base === roundUp(baseRaw),
    `A=${A.toFixed(3)} rate=${rate} baseRaw=${fmt(baseRaw)} → base=${fmt(base)} (คาด ${fmt(roundUp(baseRaw))})`);
  const expCat = roundUp(baseRaw + A * 800);
  check("F3 cat sell = roundUp(baseRaw + A×800)", sellCat === expCat,
    `cat=${fmt(sellCat)} (คาด ${fmt(expCat)}) · add A×800=${fmt(A * 800)}`);

  // rat: +1200/ตร.ม.
  setOpt(ch, ".o-screenfabric", "rat");
  const sellRat = w.readItem(ch).r.sell;
  const expRat = roundUp(baseRaw + A * 1200);
  check("F3 rat sell = roundUp(baseRaw + A×1200)", sellRat === expRat,
    `rat=${fmt(sellRat)} (คาด ${fmt(expRat)}) · add A×1200=${fmt(A * 1200)}`);

  console.log(`  imp21 ${1.5}×${2.0} (A=${A.toFixed(3)}): fiber=${fmt(base)} · cat=${fmt(sellCat)} (+${fmt(sellCat - base)}) · rat=${fmt(sellRat)} (+${fmt(sellRat - base)})\n`);
}

// ============================================================
// F3 safety — เฉพาะ imp23 (imp21/imp22 ต้องไม่มี)
// ============================================================
console.log("=== F3 safety — option 'safety' เฉพาะ imp23 ===\n");
function hasSafetyOption(prod) {
  clearItems();
  const ch = addItem(doc.getElementById("items"));
  setItem(ch, { group: 5, prod, type: "window", w: 1.5, h: 2.0, panels: 1, qty: 1 });
  const sel = ch.querySelector(".o-screenfabric");
  if (!sel) return null;
  return !!sel.querySelector('option[value="safety"]');
}
const safe21 = hasSafetyOption("imp21");
const safe22 = hasSafetyOption("imp22");
const safe23 = hasSafetyOption("imp23");
check("F3 imp23 มี option 'safety'", safe23 === true, `imp23=${safe23}`);
check("F3 imp21 ไม่มี 'safety'", safe21 === false, `imp21=${safe21}`);
check("F3 imp22 ไม่มี 'safety'", safe22 === false, `imp22=${safe22}`);
console.log(`  safety dropdown: imp21=${safe21} · imp22=${safe22} · imp23=${safe23}\n`);

// ============================================================
// สรุป
// ============================================================
console.log("=== สรุปผล ===");
let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}  — ${r.detail}`);
  if (r.ok) pass++;
}
if (errors.length) {
  console.log(`\n⚠ jsdom errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("  " + e));
}
console.log(`\nผ่าน ${pass}/${results.length}`);
process.exit(pass === results.length && errors.length === 0 ? 0 : 1);
