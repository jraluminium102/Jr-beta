// qa-t4-screen-batten.mjs — QA Tester #4 · กลุ่ม มุ้ง (5) + ระแนง/รั้ว/ราวกันตก (2)
// รันจริงใน jsdom · อ่าน it.r.msgs (breakdown) → ตรวจว่าการคูณใน msg ตรงกับ it.r.sell
// ห้ามแก้สูตร · ราคาทั้งหมดมาจาก readItem/calcUnit ของตัวเครื่อง
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
  if (cfg.opts) for (const [sel, val] of Object.entries(cfg.opts)) {
    const oel = ch.querySelector(sel);
    if (oel) {
      if (oel.type === "checkbox") oel.checked = !!val;
      else oel.value = String(val);
      fire(oel, "input"); fire(oel, "change");
    }
  }
}
function clearItems() { doc.getElementById("items").innerHTML = ""; w.qSplit = false; w.qSplitGroups = {}; }
const fmt = (x) => (isNaN(x) ? "—" : Math.round(x).toLocaleString("en-US"));
const roundUp = (x) => Math.ceil(x / 1000) * 1000;

// ---------- 4 test cases ----------
const TCS = [
  {
    tc: "TC1", name: "มุ้งเฟรมใหญ่ (imp23) ประตู 1.8×2.1",
    build() { const ch = addItem(doc.getElementById("items")); setItem(ch, { group: 5, prod: "imp23", type: "door", w: 1.8, h: 2.1, panels: 1, qty: 1 }); },
    // imp23: A=3.78 → tier >3 → 4500? no: [3.0,9999]=3500. baseSell=A*3500. min_door=7200×1=7200 > baseSell → 7200. fiber=0. roundUp
    expect(it) {
      const A = it.r.a, rate = 3500, baseSell = A * rate, totalMin = 7200 * 1;
      const sell = roundUp(Math.max(totalMin, baseSell));
      return { sell, note: `A=${A.toFixed(2)}×${rate}=${fmt(baseSell)} vs min ประตู 7,200×1 → max=${fmt(Math.max(totalMin, baseSell))} → roundUp` };
    },
  },
  {
    tc: "TC2", name: "มุ้งจีบ ตีนตะขาบ (imp28) 1.2×2.4",
    build() { const ch = addItem(doc.getElementById("items")); setItem(ch, { group: 5, prod: "imp28", type: "window", w: 1.2, h: 2.4, panels: 1, qty: 1 }); },
    // imp28: rate flat 4500 (tier [1,9999]), min=0 → base=max(0, A*4500). A=2.88. roundUp
    expect(it) {
      const A = it.r.a, rate = 4500, base = Math.max(0, A * rate);
      const sell = roundUp(base);
      return { sell, note: `A=${A.toFixed(2)}×${rate}=${fmt(base)} (min 0) → roundUp` };
    },
  },
  {
    tc: "TC3", name: "ราวกันตก 47.4 บันไดตรง เสาอลู (imp6) ยาว 6.0 ม. (พยายามใส่ราวจับ ยู 5 หุน)",
    build() { const ch = addItem(doc.getElementById("items")); setItem(ch, { group: 2, prod: "imp6", w: 6.0, h: 1.0, qty: 1, opts: { ".o-handrail": "u5" } }); },
    // imp6: len=6 → tier [5,10]=8000. sell=roundUp(6*8000)=48000. (ราวจับ option UI ไม่ render → ไม่ถูกบวก = BUG)
    expect(it) {
      const len = it.r.a, rate = 8000, byLen = len * rate;
      const sell = roundUp(byLen);
      return { sell, note: `ยาว ${len} × ${fmt(rate)} = ${fmt(byLen)} → roundUp (เครื่องไม่บวกราวจับ — option ไม่ render, ดู FINDING)` };
    },
  },
  {
    tc: "TC4", name: "ราวกันตก 47.2 บันไดเฉียง เสาอลู (imp3) ยาว 4.0 ม. (พยายามใส่ราวจับ กล่อง)",
    build() { const ch = addItem(doc.getElementById("items")); setItem(ch, { group: 2, prod: "imp3", w: 4.0, h: 1.0, qty: 1, opts: { ".o-handrail": "box" } }); },
    // imp3: len=4 → tier [0,5]=9700. sell=roundUp(4*9700)=38800→39000. (ราวจับ option UI ไม่ render → ไม่ถูกบวก = BUG)
    expect(it) {
      const len = it.r.a, rate = 9700, byLen = len * rate;
      const sell = roundUp(byLen);
      return { sell, note: `ยาว ${len} × ${fmt(rate)} = ${fmt(byLen)} → roundUp (เครื่องไม่บวกราวจับ — option ไม่ render, ดู FINDING)` };
    },
  },
];

const rows = [];
let pass = 0;
for (const t of TCS) {
  errors.length = 0;
  clearItems();
  t.build();
  w.calcQuote();
  const its = [...doc.querySelectorAll("#items .ch")].map(w.readItem).filter(Boolean);
  const it = its[0];
  const exp = t.expect(it);
  const actual = it.r.sell;
  const ok = actual === exp.sell;
  if (ok) pass++;
  const msgs = (it.r.msgs || []).join(" | ");
  rows.push({ tc: t.tc, name: t.name, input: `${it.w}×${it.h} a=${it.r.a}`, msgs, expected: exp.sell, actual, ok, note: exp.note, jsErr: errors.length });
}

console.log("=== QA T4 — มุ้ง + ระแนง/รั้ว/ราวกันตก (รันจริง) ===\n");
for (const r of rows) {
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.tc} ${r.name}`);
  console.log(`  Input    : ${r.input}`);
  console.log(`  msgs     : ${r.msgs}`);
  console.log(`  Expected : ${fmt(r.expected)}  (${r.note})`);
  console.log(`  Actual   : ${fmt(r.actual)}   ${r.ok ? "✓ ตรง" : "✗ ไม่ตรง"}`);
  if (r.jsErr) console.log(`  JS errors: ${r.jsErr}`);
  console.log("");
}
console.log(`สรุป: ผ่าน ${pass}/${TCS.length}`);

// ---------- FINDINGS: ตรวจว่า option UI render จริงไหม ----------
console.log("\n=== FINDINGS — option ที่ระบุใน spec แต่ใช้งานไม่ได้ ===");
function uiHas(group, prod, sel) {
  clearItems();
  const ch = addItem(doc.getElementById("items"));
  setItem(ch, { group, prod, w: 1.0, h: 1.0 });
  return !!ch.querySelector(sel);
}
const hasHandrail = uiHas(2, "imp6", ".o-handrail");
const hasFabric = uiHas(5, "imp23", ".o-screenfabric");
// อ่าน readItem optSel ว่ามี key handrail/screenFabric ไหม
clearItems();
const chR = addItem(doc.getElementById("items"));
setItem(chR, { group: 2, prod: "imp6", w: 6.0, h: 1.0 });
const optKeys = Object.keys(w.readItem(chR).optSel || {});
console.log(`F1 ราวจับ (ยู 5 หุน/กล่อง) — dropdown .o-handrail render ในบาน?  ${hasHandrail ? "✅ มี" : "❌ ไม่มี (option ตกหล่น)"}`);
console.log(`   readItem.optSel มี key 'handrail'?  ${optKeys.includes("handrail") ? "✅" : "❌ ไม่อ่านค่า (calcUnit รอ optSel.handrail แต่ readItem ไม่เซ็ต)"}`);
console.log(`F2 ผ้ามุ้งนิรภัยสแตน 304 (imp23) — dropdown .o-screenfabric render?  ${hasFabric ? "✅ มี" : "❌ ไม่มี (อัพเกรดผ้ามุ้งใช้ไม่ได้ · default ไฟเบอร์เท่านั้น)"}`);

process.exit(pass === TCS.length ? 0 : 1);
