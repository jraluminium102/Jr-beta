// audit-misplaced-sections.mjs — ตรวจ "บล็อก/ปุ่ม/อุปกรณ์เสริมโผล่ผิดกลุ่ม" ในหน้าใบเสนอราคา
// render index.html ของจริงด้วย jsdom → ต่อสินค้าทุกตัวทุกกลุ่ม ดูว่าบล็อกไหน "มองเห็นจริง"
// ออก: docs/AUDIT-misplaced-sections.json (ground truth ให้ทีมตรวจอ่าน) + สรุป terminal
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");

const vc = new VirtualConsole();
vc.on("jsdomError", () => {});
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// บล็อกที่จะเช็คว่าโผล่ผิดที่ไหม (selector ภายในการ์ด .ch)
const SECTIONS = [
  { key: "ผสมบาน(เพิ่มบาน)", sel: ".subitem-wrap" },
  { key: "ผลิตส่ง", sel: "label.chk input.i-ship" },
  { key: "ประเภท(ประตู/หน้าต่าง)", sel: ".itype-seg" },
  { key: "OPTION-chips", sel: ".oc-block" },
  { key: "อุปกรณ์เสริม(optbox)", sel: ".optbox" },
  { key: "หมายเหตุมาตรฐาน", sel: ".rk-box,.rk-wrap,[class*='remark']" },
  { key: "สีอลู", sel: ".i-color-wrap" },
  { key: "กระจก", sel: ".i-glass-wrap" },
];

// มองเห็นจริงไหม: ไม่มี ancestor (ถึง .ch) ที่ inline display:none + ไม่โดน g6room ซ่อน
function visible(el, ch) {
  if (!el) return false;
  let node = el;
  while (node && node !== ch.parentNode) {
    if (node.style && node.style.display === "none") return false;
    // g6room ซ่อน note-opt-group + subitem-wrap ผ่าน CSS class
    if (ch.classList.contains("g6room") &&
        node.classList && (node.classList.contains("note-opt-group") || node.classList.contains("subitem-wrap"))) return false;
    node = node.parentNode;
  }
  // ถ้า el เองคือ input (i-ship) เช็ค label ครอบ
  return true;
}

function sectionVisible(ch, sel) {
  const el = ch.querySelector(sel);
  if (!el) return false;
  // i-ship: เช็ค label ครอบ
  const target = sel.includes("i-ship") ? el.closest("label") : el;
  return visible(target || el, ch);
}

const GROUPS = ["1", "2", "3", "4", "5", "6", "7"];
const GROUP_NAME = { "1": "บาน/กระจก", "2": "ระแนง·รั้ว·ราว", "3": "หลังคา·ฝ้า-ผนัง", "4": "ตู้อลู", "5": "มุ้ง", "6": "กั้นห้องกระจก", "7": "ม่านซิป" };

const out = {};
for (const g of GROUPS) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { continue; }
  const ch0 = doc.querySelector("#items .ch");
  const gs = ch0.querySelector(".i-group");
  gs.value = g; fire(gs, "change");
  const prods = Array.from(ch0.querySelector(".i-prod").options).map(o => ({ v: o.value, t: o.textContent })).filter(o => o.v);
  out[g] = { name: GROUP_NAME[g], products: [] };
  for (const p of prods) {
    doc.getElementById("items").innerHTML = "";
    w.addItem(doc.getElementById("items"));
    const ch = doc.querySelector("#items .ch");
    const gsel = ch.querySelector(".i-group"); gsel.value = g; fire(gsel, "change");
    const ps = ch.querySelector(".i-prod");
    if (!ps.querySelector('option[value="' + p.v + '"]')) continue;
    ps.value = p.v; fire(ps, "change");
    const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
    if (wi) { wi.value = "1.2"; fire(wi, "input"); fire(wi, "change"); }
    if (hi) { hi.value = "2.2"; fire(hi, "input"); fire(hi, "change"); }
    const vis = {};
    SECTIONS.forEach(s => { vis[s.key] = sectionVisible(ch, s.sel); });
    // OPTION chips ที่โผล่ + อุปกรณ์เสริม opt ที่โผล่
    const ocChips = Array.from(ch.querySelectorAll(".oc-catchips .chip")).filter(c => visible(c, ch)).map(c => (c.textContent || "").trim());
    const opts = Array.from(ch.querySelectorAll(".i-opts .opt")).filter(o => visible(o, ch)).map(o => (o.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40));
    out[g].products.push({ id: p.v, name: p.t.trim(), visible: vis, optionChips: ocChips, accessories: opts });
  }
}

writeFileSync(join(ROOT, "docs/AUDIT-misplaced-sections.json"), JSON.stringify(out, null, 2), "utf8");

// สรุป terminal: บล็อกที่ "น่าจะผิดที่" — ผสมบาน/ประเภทประตู/ผลิตส่ง โผล่ในกลุ่มที่ไม่ใช่บาน
console.log("=== สรุป: บล็อกที่โผล่ต่อกลุ่ม (จำนวนสินค้าที่โผล่ / ทั้งหมด) ===");
for (const g of GROUPS) {
  if (!out[g]) continue;
  const ps = out[g].products; const n = ps.length;
  const counts = {};
  SECTIONS.forEach(s => { counts[s.key] = ps.filter(p => p.visible[s.key]).length; });
  console.log(`\nG${g} ${out[g].name} (${n} สินค้า):`);
  SECTIONS.forEach(s => { if (counts[s.key] > 0) console.log(`   ${s.key}: ${counts[s.key]}/${n}`); });
}
console.log("\n→ docs/AUDIT-misplaced-sections.json");
