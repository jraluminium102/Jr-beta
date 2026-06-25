// dump-controls.mjs — READ-ONLY: dump control ที่ render จริง "ตามลำดับ DOM" ต่อชนิด/สินค้า ของกลุ่ม G ใดก็ได้
//   → ใช้เทียบดราฟทีละบล็อก (รายการ/ลำดับโซน/ปุ่มซ้ำ-เกิน) แบบที่ตาเห็นจริง
// ใช้:  node scripts/dump-controls.mjs <group> [prod1,prod2,...]
//   group  = เลขกลุ่ม i-group ("1".."7")
//   prods  = (ไม่ใส่ = auto: ดึงทุก product ใน i-prod ของกลุ่มนั้น) · cascade groups (G2 ระแนง/G5/G6) ใส่ list เองให้ครบ
// ตัวอย่าง: node scripts/dump-controls.mjs 1
//          node scripts/dump-controls.mjs 4 cabinet_alu,future_tech
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const GROUP = process.argv[2] || "1";
const PRODS = (process.argv[3] || "").split(",").map(s => s.trim()).filter(Boolean);
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole(); vc.on("jsdomError", () => {});
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
doc.querySelectorAll("section").forEach(s => { if (s.id === "m-quote") s.classList.remove("hide"); }); // calc อยู่ในแท็บ .hide → ถอดก่อนวัด visible

// เดิน ancestor หา display:none เอง (offsetParent ใน jsdom = 0 ทุกตัว ใช้ไม่ได้)
function vis(el) { let n = el; while (n && n !== doc.body) { if (n.style && n.style.display === "none") return false; n = n.parentElement; } return true; }
function renderProd(id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = GROUP; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (id && (!ps || !ps.querySelector('option[value="' + id + '"]'))) return { ch, ok: false, ps };
  if (id) { ps.value = id; fire(ps, "change"); }
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = "2.0"; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = "2.1"; fire(hi, "input"); fire(hi, "change"); }
  ch.querySelectorAll("details").forEach(dt => { dt.open = true; }); // เปิด z3/พับ ให้เห็น control ครบ
  return { ch, ok: true, ps };
}
// dump control ตามลำดับ DOM: heading(b/.lbl) → chip(● on/○) · select(▼class+จำนวน option) · checkbox(☐) · input(⌨)
function dump(ch) {
  const seq = [];
  ch.querySelectorAll("b,.lbl,button.chip,select,input,summary").forEach(el => {
    if (!vis(el)) return;
    const tag = el.tagName, cls = el.className || "";
    if (tag === "BUTTON" && cls.indexOf("chip") >= 0) {
      const t = el.textContent.trim().slice(0, 20);
      // ตัดแถบเลือกกลุ่มสินค้า (บาน/กระจก·ระแนง·หลังคา·ตู้·มุ้ง·กั้นห้อง·ม่านซิป) ออก — ไม่ใช่ control ของฟอร์ม
      if (!/บาน\/กระจก|ระแนง·รั้ว|งานหลังคา|ตู้อลู$|🦟 มุ้ง|กั้นห้องกระจ|ม่านซิป$/.test(t)) seq.push((el.classList.contains("on") ? "●" : "○") + t);
    } else if (tag === "SELECT") {
      const cl = cls.split(" ").filter(x => x.indexOf("o-") === 0 || x.indexOf("i-") === 0)[0] || "sel";
      seq.push("▼" + cl + "(" + el.options.length + ")");
    } else if (tag === "INPUT") {
      const k = cls.split(" ").find(x => x.indexOf("o-") === 0 || x.indexOf("g1") === 0 || x.indexOf("i-") === 0) || cls.split(" ")[0];
      if (el.type === "checkbox") seq.push("☐" + k);
      else if (el.type === "number" || el.type === "text") seq.push("⌨" + k);
    }
  });
  return seq;
}
// auto: ถ้าไม่ระบุ prods → ดึงทุก product ใน i-prod ของกลุ่มนี้
let prods = PRODS;
if (!prods.length) {
  const r = renderProd(null);
  if (r && r.ps) prods = Array.from(r.ps.options).map(o => o.value).filter(Boolean);
}
console.log(`# dump-controls G${GROUP} — ${prods.length} สินค้า (เทียบดราฟทีละบล็อก: รายการ/ลำดับโซน/ปุ่มซ้ำ-เกิน)`);
for (const id of prods) {
  const r = renderProd(id);
  if (!r) { console.log(`\n### ${id} — RENDER FAIL`); continue; }
  if (!r.ok) { console.log(`\n### ${id} — ไม่มีใน i-prod (อาจเป็น cascade · ใส่ผ่าน selector เฉพาะกลุ่ม)`); continue; }
  console.log(`\n### ${id}`);
  console.log(dump(r.ch).join("  "));
}
