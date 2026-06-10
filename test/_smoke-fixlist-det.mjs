// _smoke-fixlist-det.mjs — ยืนยัน det ใหม่จาก FIXLIST 7 กลุ่ม render จริงไม่ error
//  G4 ตู้/ฝาตู้ det · G3-S1 หลังคาเลื่อน · G7 ม่านซิป รุ่น+ควบคุม · H1/H2 ตะแกรง+ท่อน้ำทิ้ง
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const calcHtml = readFileSync(join(__dirname, "..", "public/calculator/index.html"), "utf8");

const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message); });

const dom = new JSDOM(calcHtml, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });

const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
function setF(ch, sel, v) { const el = ch.querySelector(sel); if (el) { if (el.type === "checkbox") el.checked = !!v; else el.value = String(v); fire(el, "input"); fire(el, "change"); } }
function setF2(id, v) { const el = doc.getElementById(id); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }
function clearItems() { doc.getElementById("items").innerHTML = ""; }

function addItem(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch");
  const ch = chs[chs.length - 1];
  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(it.g));
  ps.value = it.prod; fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  for (const [sel, val] of Object.entries(it.opts || {})) setF(ch, sel, val);
  if (it.autoColor !== false) {
    const c = ch.querySelector(".i-color"); if (c && c.options.length > 1) { c.value = c.options[1].value; fire(c, "change"); }
  }
  return ch;
}
function render(it) {
  clearItems(); setF2("discFlat", 0); setF2("discPct", 0); setF2("custName", "ทดสอบ"); setF2("qdate", "01-01-69");
  addItem(it); w.calcQuote(); w.genQuote();
  const qc = doc.getElementById("quoteContent");
  let txt = "", priceRaw = "";
  [...qc.querySelectorAll("table.qt tbody tr")].forEach((row) => {
    const tds = row.querySelectorAll("td");
    if (tds[1]) txt += " " + (tds[1].textContent || "").replace(/\s+/g, " ").trim();
    if (!priceRaw && tds[4]) priceRaw = (tds[4].textContent || "").replace(/[^\d]/g, "");
  });
  return { txt: txt.trim(), price: parseInt(priceRaw) || 0 };
}

const cases = [
  { name: "G4 ตู้อลู det", it: { g: 4, prod: "cabinet_alu", w: 2.0, h: 2.4, autoColor: false,
      opts: { ".o-cabtype": "wardrobe", ".o-cabdoors": "2", ".o-depth": "0.6", ".o-shelves": "3", ".o-shelfmat": "alu" } },
    want: ["ตู้อลูมิเนียม", "บานหน้า Future Tech", "ชั้นวาง 3 ชั้น", "ผนังอลู"], notDet: ["\n-"] },
  { name: "G4 ฝาตู้ det", it: { g: 4, prod: "future_tech", w: 1.0, h: 2.0, panels: 2, autoColor: false,
      opts: { ".o-ftcolor": "0" } },
    want: ["ฝาตู้ Future Tech 2 บาน"] },
  { name: "G7 ม่านซิป รุ่น+ควบคุม", it: { g: 7, prod: "zipscreen", w: 3.0, h: 2.8, autoColor: false,
      opts: { ".o-zmodel": "auto", ".o-zfab": "5", ".o-zctrl": "aok220" } },
    want: ["JR-Z", "ระบบควบคุม", "มอเตอร์"], notDet: ["ครอบวงกบ"] },
  { name: "H1/H2 รางน้ำ+ตะแกรง+ท่อน้ำทิ้ง", it: { g: 3, prod: "roof_vinyl", w: 4.0, h: 3.0,
      opts: { ".o-roofend": "รางน้ำ", ".o-guttersys": "ท่อ", ".o-gutter-pipecolor": "ขาว", ".o-rfdrain": "ดำ" } },
    want: ["รางน้ำ", "ตะแกรงพลาสติกกันใบไม้", "ท่อน้ำทิ้ง PVC 2.5", "สีดำ"] },
  { name: "G3-S1 หลังคาเลื่อน + มอเตอร์", it: { g: 3, prod: "roof_vinyl", w: 5.0, h: 4.0,
      opts: { ".o-slide": true, ".o-spanels": "3", ".o-smotorqty": "1" } },
    want: ["หลังคาเลื่อน 3 บาน", "มอเตอร์ 1 ตัว"] },
];

let pass = 0, fail = 0;
console.log("=== SMOKE FIXLIST DET (7 กลุ่ม) ===\n");
for (const c of cases) {
  let r;
  try { r = render(c.it); } catch (e) { console.log("❌ " + c.name + " — RENDER ERROR: " + e.message); fail++; continue; }
  const miss = (c.want || []).filter((k) => !r.txt.includes(k));
  const bad = (c.notDet || []).filter((k) => r.txt.includes(k));
  const ok = miss.length === 0 && bad.length === 0 && r.price > 0;
  console.log((ok ? "✅" : "❌") + " " + c.name + "  (฿" + r.price.toLocaleString() + ")");
  if (miss.length) console.log("   ขาด: " + miss.join(" · "));
  if (bad.length) console.log("   ไม่ควรมี: " + bad.join(" · "));
  if (!ok && r.price === 0) console.log("   ⚠ price=0");
  if (ok) pass++; else fail++;
}
if (jsErrors.length) { console.log("\nJS errors:"); jsErrors.forEach((e) => console.log("  " + e)); }
console.log("\nสรุป: PASS " + pass + " / " + cases.length + "  |  FAIL " + fail);
process.exit(fail === 0 ? 0 : 1);
