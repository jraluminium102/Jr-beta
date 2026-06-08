// ทดสอบชุดกั้นห้องกระจก (ระบบชุดใหม่ R5.0):
//   addGlasshouseSet() → เพิ่มด้าน B/C + หลังคา → genQuote → ใบ 1 ข้อ group + ค่าทำชุด 5,000
// ชุดทดสอบ: 2 ด้าน (sliding_euro + fixed_glass) + หลังคา (roof_std)
// ราคาที่คาดหวัง = ผลรวมราคาทุกส่วน + 5,000 ค่าทำชุด
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });

const w = dom.window, doc = w.document;
const checks = [];
const want = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
function setF(ch, sel, v) { const el = ch.querySelector(sel); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }
const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

// ปิดค่าบริการ
["svc-protect","svc-lift","svc-travel","svc-ship"].forEach((id)=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false; e.dispatchEvent(new w.Event("change",{bubbles:true}));} });

// ========== สร้างชุดกั้นห้องกระจกด้วย flow ใหม่ ==========
doc.getElementById("items").innerHTML = "";

// 1. สร้าง setbox ด้วย addGlasshouseSet()
const sb = w.addGlasshouseSet();
want("G0 addGlasshouseSet() คืน setbox", !!sb && sb.classList && sb.classList.contains("setbox"), "ไม่ได้ setbox");

// 2. ตั้งชื่อชุด
const sn = sb.querySelector(".set-name");
want("G0b มี .set-name ในชุด", !!sn, "ไม่พบ .set-name");
if (sn) { sn.value = "กั้นห้องกระจก (ห้องอเนกประสงค์)"; fire(sn, "input"); fire(sn, "change"); }

// 3. กำหนด ด้าน A (ch แรก)
const parts = sb.querySelector(".set-parts");
let chs = parts.querySelectorAll(".ch");
want("G0c มี ch แรก group6", chs.length >= 1, "ไม่มี .ch ในชุด");
if (chs.length >= 1) {
  const ch0 = chs[0];
  const grp = ch0.querySelector(".i-group");
  want("G0d ด้าน A group=6", grp && grp.value === "6", "group=" + (grp ? grp.value : "null"));
  const ps = ch0.querySelector(".i-prod");
  if (ps && !ps.querySelector('option[value="sliding_euro"]')) ps.innerHTML = w.prodOptionsG6("6");
  if (ps) { ps.value = "sliding_euro"; fire(ps, "change"); }
  setF(ch0, ".i-w", 3.0); setF(ch0, ".i-h", 2.4);
  const pA = ch0.querySelector(".i-position");
  if (pA) { pA.value = "ด้าน A"; fire(pA, "input"); fire(pA, "change"); }
}

// 4. เพิ่มด้าน B ด้วยการคลิก .set-addpart
const addBtn = sb.querySelector(".set-addpart");
want("G1 มีปุ่ม .set-addpart", !!addBtn, "ไม่พบ .set-addpart");
if (addBtn) fire(addBtn, "click");
chs = parts.querySelectorAll(".ch");
want("G2 หลังคลิก set-addpart มี 2 ch", chs.length >= 2, "มี " + chs.length + " ch");
if (chs.length >= 2) {
  const ch1 = chs[chs.length - 1];
  const ps = ch1.querySelector(".i-prod");
  if (ps && !ps.querySelector('option[value="fixed_glass"]')) ps.innerHTML = w.prodOptionsG6("6");
  if (ps) { ps.value = "fixed_glass"; fire(ps, "change"); }
  setF(ch1, ".i-w", 2.0); setF(ch1, ".i-h", 2.4);
  const pB = ch1.querySelector(".i-position");
  if (pB) { pB.value = "ด้าน B"; fire(pB, "input"); fire(pB, "change"); }
}

// 5. เพิ่มหลังคาด้วย .set-addroof
const roofBtn = sb.querySelector(".set-addroof");
want("G3 มีปุ่ม .set-addroof (inject โดย refreshSet)", !!roofBtn, "ไม่พบ .set-addroof");
if (roofBtn) fire(roofBtn, "click");
chs = parts.querySelectorAll(".ch");
want("G4 หลังคลิก set-addroof มี 3 ch", chs.length >= 3, "มี " + chs.length + " ch");
if (chs.length >= 3) {
  const roofCh = chs[chs.length - 1];
  const grpR = roofCh.querySelector(".i-group");
  want("G4b หลังคา group=3", grpR && grpR.value === "3", "group=" + (grpR ? grpR.value : "null"));
  const ps = roofCh.querySelector(".i-prod");
  if (ps) { ps.value = "roof_vinyl"; fire(ps, "change"); }
  setF(roofCh, ".i-w", 6.0); setF(roofCh, ".i-h", 2.5);
  const pR = roofCh.querySelector(".i-position");
  if (pR && !pR.value.trim()) { pR.value = "หลังคา"; fire(pR, "input"); }
}

// 6. คิดราคา + genQuote
w.calcQuote();
// อ่านราคาแต่ละส่วน (readItem) เพื่อเปรียบเทียบกับยอดชุด
const chList = [...parts.querySelectorAll(".ch")];
const partPrices = chList.map(ch => {
  const ri = w.readItem && w.readItem(ch);
  return ri ? (ri.r ? ri.r.sell : 0) : 0;
}).filter(v => !isNaN(v) && v > 0);
const sumParts = partPrices.reduce((a, b) => a + b, 0);
want("G5 ราคาแต่ละส่วน > 0 (อ่านได้จาก readItem)", sumParts > 0, "sumParts=" + sumParts);

w.genQuote();
const qc = doc.getElementById("quoteContent");
const t = txt(qc);

want("G6 ใบเสนอ 'ออก' (ไม่ว่าง)", t.length > 50, "ยาว " + t.length);
want("G7 มีคำว่า 'กั้นห้องกระจก' ในใบ", t.includes("กั้นห้องกระจก"), t.slice(0, 120));
want("G8 มี 'ด้าน A' ในใบ", t.includes("ด้าน A"), "ไม่พบ 'ด้าน A'");
want("G9 มี 'ด้าน B' ในใบ", t.includes("ด้าน B"), "ไม่พบ 'ด้าน B'");
want("G10 มี 'ค่าทำชุด' ในใบ", t.includes("ค่าทำชุด"), "ไม่พบ 'ค่าทำชุด'");

// ยอดรวมชุด (subtotal ก่อน VAT) = sumParts + 5000
// ใช้ ".qtot .l" (บรรทัดแรก = "รวมเป็นเงิน") แทน ".qtot .g" (withVat) เพื่อหลีกเลี่ยง VAT diff
const subtotalEl = doc.querySelector("#quoteContent .qtot .l");
const subtotal = subtotalEl ? parseInt((subtotalEl.textContent || "").replace(/\.\d+/g, "").replace(/[^\d]/g, ""), 10) : NaN;
const expectedSub = sumParts + 5000;
want("G11 subtotal (ก่อน VAT) = ผลรวมส่วน + 5,000 ค่าทำชุด", subtotal === expectedSub, `subtotal=${subtotal} expected=${expectedSub} (sumParts=${sumParts}+5000)`);
const gEl = doc.querySelector("#quoteContent .qtot .g");
const grand = gEl ? parseInt((gEl.textContent || "").replace(/\.\d+/g, "").replace(/[^\d]/g, ""), 10) : NaN;
want("G12 รวมทั้งสิ้น > subtotal (มี VAT)", !isNaN(grand) && grand > expectedSub, `grand=${grand} expectedSub=${expectedSub}`);

// ตรวจใบออก 1 ข้อ (grouped)
const rows = doc.querySelectorAll("#quoteContent tr[data-row], #quoteContent tbody tr");
// นับข้อที่มีตัวเลข (แถวรายการ ไม่ใช่หัว/ยอด)
want("G13 ใบมีแถวรายการอย่างน้อย 1 แถว", rows.length >= 1, "rows=" + rows.length);

const jsErrs = errors.filter((e) => !/sheetjs|xlsx|external|Could not load|scrollTo|Not implemented/i.test(e));
want("G14 ไม่มี JS error", jsErrs.length === 0, jsErrs.join("; "));

let pass = 0;
console.log("=== TEST ชุดกั้นห้องกระจก (flow ใหม่ R5.0) ===");
for (const c of checks) { console.log((c.ok ? "✅" : "❌") + " " + c.name + (c.ok ? "" : "  → " + c.detail)); if (c.ok) pass++; }
console.log(`\nราคาแต่ละส่วน: ${partPrices.join(" + ")} = ${sumParts} + ค่าทำชุด 5,000 = ${sumParts + 5000}`);
console.log(`subtotal (ก่อน VAT): ${subtotal}  ·  รวมทั้งสิ้น (withVAT): ${grand}`);
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
