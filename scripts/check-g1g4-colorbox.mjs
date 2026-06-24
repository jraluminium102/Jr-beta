// check-g1g4-colorbox.mjs — GATE เฉพาะกล่องสี L1/L2/L3 G1+G4 (ตามใบสั่ง ORDER-dev-G1G4-L1L2L3)
// ใช้: node scripts/check-g1g4-colorbox.mjs
//   - รันก่อนแก้ = หลายข้อ 🔴 (ยังไม่ apply redesign) = baseline ถูกต้อง
//   - รันหลัง dev แก้ = ต้อง 🟢 ครบ (= เหมือนดราฟ) · exit 1 ถ้ามี 🔴
// เกณฑ์ = ORDER ธง A1/A3/A4/A5/A7 (G1) + B (G4) + C(imp31) + Fuji(เคาะ 24มิ.ย.=มีรหัส)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");

const vc = new VirtualConsole(); vc.on("jsdomError", () => {});
const dom = new JSDOM(SRC, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

const rows = [];
const add = (flag, pass, name, detail) => rows.push({ flag, pass, name, detail });

// ---- render G1 product → return item .ch (เปิดกล่องสีถ้ามีปุ่มพับ) ----
function g1item(id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = "1"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps || !ps.querySelector('option[value="' + id + '"]')) return null;
  ps.value = id; fire(ps, "change");
  return ch;
}
function g4item(id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = "4"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps) return null;
  if (id && ps.querySelector('option[value="' + id + '"]')) { ps.value = id; fire(ps, "change"); }
  return ch;
}
const optCount = el => el ? el.querySelectorAll("option").length : 0;
const firstOptVal = el => el && el.options && el.options.length ? el.options[0].value : null;
const isSelect = el => el && el.tagName === "SELECT";

const ch1 = g1item("sliding_euro");

// ===== A1 — บั๊ก value "ไม่เทียบ" ต้อง = "-1" (ไม่ใช่ "0") =====
if (ch1) {
  const l3c = ch1.querySelector(".g1co-l3c"), l3g = ch1.querySelector(".g1co-l3g");
  const cVal = firstOptVal(l3c), gVal = firstOptVal(l3g);
  add("A1", l3c ? (cVal === "-1") : false, "G1 L3 สีอลู 'ไม่เทียบ' value=-1",
    l3c ? `option[0].value="${cVal}" (ต้อง "-1")` : "ไม่พบ .g1co-l3c");
  add("A1", l3g ? (gVal === "-1") : false, "G1 L3 กระจก 'ไม่เทียบ' value=-1",
    l3g ? `option[0].value="${gVal}" (ต้อง "-1")` : "ไม่พบ .g1co-l3g");
} else add("A1", false, "G1 colorbox", "render sliding_euro ไม่ได้");

// ===== A1 engine — ต้องเทียบ l3ci>=0 / l3gi>=0 (ไม่ใช่ >0) =====
add("A1", !/l3ci\s*>\s*0/.test(SRC), "engine l3ci เทียบ >=0 (ไม่ใช่ >0)",
  /l3ci\s*>\s*0/.test(SRC) ? "ยังพบ `l3ci>0` ใน source → index 0 (สีอบขาว) ถูกตัด = บั๊ก" : "ใช้ >=0 แล้ว");
add("A1", !/l3gi\s*>\s*0/.test(SRC), "engine l3gi เทียบ >=0 (ไม่ใช่ >0)",
  /l3gi\s*>\s*0/.test(SRC) ? "ยังพบ `l3gi>0` ใน source" : "ใช้ >=0 แล้ว");

// ===== A3 — L2 สีอลู เป็น dropdown (select) =====
if (ch1) {
  const l2c = ch1.querySelector(".g1co-l2c");
  add("A3", isSelect(l2c) && optCount(l2c) >= 13, "G1 L2 สีอลู = dropdown 13 สี",
    l2c ? `tag=${l2c.tagName} · ${optCount(l2c)} options (ต้อง SELECT ≥13)` : "ไม่พบ .g1co-l2c");
}

// ===== A4 — กระจก dropdown ครบ 66 (L2) =====
if (ch1) {
  const l2g = ch1.querySelector(".g1co-l2g");
  add("A4", isSelect(l2g) && optCount(l2g) >= 60, "G1 L2 กระจก = dropdown ~66",
    l2g ? `tag=${l2g.tagName} · ${optCount(l2g)} options (ต้อง ~66)` : "ไม่พบ .g1co-l2g");
}

// ===== A5/Fuji — ช่องรหัสสี "อยู่ในกล่องสี ใต้ dropdown L2" + Fuji 8,9 hasCode =====
if (ch1) {
  const rare = ch1.querySelector(".g1-rare-body, #g1-rare-body, .g1-rare-section");
  const code = ch1.querySelector(".g1co-code, .g1co-l2code, .i-colorcode");
  const l2c = ch1.querySelector(".g1co-l2c");
  const inRare = !!(rare && code && rare.contains(code));
  const afterL2 = !!(code && l2c && (l2c.compareDocumentPosition(code) & 4)); // FOLLOWING
  add("A5", inRare, "G1 ช่องรหัสสีอยู่ใน g1-rare-body (ไม่ลอย)", code ? (inRare ? "อยู่ในกล่องสี ✓" : "ช่องรหัสลอยนอกกล่องสี → ย้าย .i-colorcode-wrap เข้า g1-rare-body") : "ไม่พบช่องรหัส");
  add("A5", afterL2, "G1 ช่องรหัสสีอยู่ใต้ dropdown L2 (g1co-l2c)", afterL2 ? "อยู่หลัง l2c ✓" : "ไม่อยู่ใต้ dropdown สี → จัดลำดับใหม่");
}
// Fuji 8,9 ต้องคง hasCode:1 (มติ 24มิ.ย.) · index 10,11,12 ด้วย
const fujiHas = /Fuji - Oak[\s\S]{0,160}hasCode:1/.test(SRC) && /Fuji - Makha[\s\S]{0,160}hasCode:1/.test(SRC);
add("A5", fujiHas, "Fuji Oak/Makha คง hasCode:1 (เคาะ=มีรหัส)", fujiHas ? "Fuji 8,9 มี hasCode:1 ✓ (ห้ามแก้ COLORS)" : "Fuji ไม่มี hasCode — ผิดมติ!");

// ===== A7 — L3 ครบ: สีอลู(13) + กระจก(66) + รหัส =====
if (ch1) {
  const l3c = ch1.querySelector(".g1co-l3c"), l3g = ch1.querySelector(".g1co-l3g");
  const l3wrap = (l3c && l3c.closest("details, .g1co-l3, .g1co-l3det")) || ch1;
  const l3code = l3wrap.querySelector(".g1co-l3code, .g1co-l3-code, .i-colorcode-l3") || (l3wrap !== ch1 && l3wrap.querySelector(".i-colorcode"));
  add("A7", isSelect(l3c) && optCount(l3c) >= 14, "G1 L3 สีอลู dropdown (13+ไม่เทียบ)", l3c ? `${optCount(l3c)} options` : "ไม่พบ");
  add("A7", isSelect(l3g) && optCount(l3g) >= 60, "G1 L3 กระจก dropdown (66+ไม่เทียบ)", l3g ? `${optCount(l3g)} options` : "ไม่พบ");
  add("A7", !!l3code, "G1 L3 มีช่องรหัสสี (โผล่เมื่อ hasCode)", l3code ? "พบช่องรหัส L3 ✓" : "ไม่พบช่องรหัสใน L3 → เพิ่มช่องรหัสสีในบล็อก L3 (โผล่เมื่อเลือกสี hasCode)");
}

// ===== B — G4 สีตู้ 2 คอลัมน์ (หน้าบาน|โครง) + L3 กระจก =====
const ch4 = g4item(null);
if (ch4) {
  const colgrid = ch4.querySelector(".cab-co-colgrid");
  add("B", !!colgrid, "G4 สีตู้ 2 คอลัมน์ (หน้าบาน|โครง)", colgrid ? "พบ .cab-co-colgrid" : "ไม่พบ .cab-co-colgrid");
  const l3det = ch4.querySelector(".cab-co-l3det, .cab-co-l3");
  add("B", !!l3det, "G4 L3 พับ + กระจก", l3det ? "พบกล่อง L3 ตู้" : "ไม่พบ L3 ตู้");
} else add("B", false, "G4 colorbox", "render G4 ไม่ได้");

// ===== C — ลบ imp31 (ตัด product) =====
add("C", !/id:\s*['"]imp31['"]/.test(SRC), "ลบ imp31 ออกจาก PRODUCTS", /id:\s*['"]imp31['"]/.test(SRC) ? "ยังพบ id:'imp31' ใน source → ยังไม่ลบ" : "ลบแล้ว");

// ===== sanity — COLORS 13 / GLASS 66 (นับจาก dropdown ที่มี) =====
if (ch1) {
  const anyColor = ch1.querySelector(".g1co-l3c, .i-color");
  const anyGlass = ch1.querySelector(".g1co-l3g, .i-glass");
  if (anyColor) add("sanity", optCount(anyColor) >= 13, "COLORS dropdown ≥13", `${optCount(anyColor)} options`);
  if (anyGlass) add("sanity", optCount(anyGlass) >= 60, "GLASS dropdown ≥60", `${optCount(anyGlass)} options`);
}

// ===== report =====
const pass = rows.filter(r => r.pass).length, fail = rows.length - pass;
console.log(`\n🚦 GATE กล่องสี L1/L2/L3 (G1+G4) — 🟢 ${pass} ผ่าน · 🔴 ${fail} ไม่ผ่าน · รวม ${rows.length} เกณฑ์`);
for (const r of rows) console.log(`  ${r.pass ? "🟢" : "🔴"} [${r.flag}] ${r.name} — ${r.detail}`);
if (fail) {
  console.log(`\n→ 🔴 ${fail} ข้อยังไม่ผ่าน (ก่อนแก้ = ปกติ · หลัง dev ต้องเขียวครบ)`);
  process.exit(1);
}
console.log("\n✅ ผ่านทุกเกณฑ์ = กล่องสี G1/G4 เหมือนดราฟ");
process.exit(0);
