// dump-g1-controls.mjs — READ-ONLY: dump control ที่ render จริงต่อชนิดบาน G1 (เทียบดราฟ GROUNDTRUTH ด้วยตา)
// ใช้: node scripts/dump-g1-controls.mjs   → พิมพ์ลำดับ control ต่อชนิด (zone/box + chip/select/checkbox/input)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole(); vc.on("jsdomError", () => {});
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
doc.querySelectorAll("section").forEach(s => { if (s.id === "m-quote") s.classList.remove("hide"); });

function vis(el) { let n = el; while (n && n !== doc.body) { if (n.style && n.style.display === "none") return false; n = n.parentElement; } return true; }
function renderProd(id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = "1"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps || !ps.querySelector('option[value="' + id + '"]')) return { ch, ok: false };
  ps.value = id; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = "2.0"; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = "2.1"; fire(hi, "input"); fire(hi, "change"); }
  // เปิด details ทุกอันให้เห็น control ใน z3
  ch.querySelectorAll("details").forEach(dt => { dt.open = true; });
  return { ch, ok: true };
}
function dump(ch) {
  const seq = [];
  ch.querySelectorAll("b,.lbl,button.chip,select,input,summary").forEach(el => {
    if (!vis(el)) return;
    const tag = el.tagName, cls = el.className || "";
    if (tag === "BUTTON" && cls.indexOf("chip") >= 0) {
      const t = el.textContent.trim().slice(0, 18);
      if (!/บาน\/กระจก|ระแนง·รั้ว|งานหลังคา|ตู้อลู|🦟 มุ้ง|กั้นห้องกระจ|ม่านซิป/.test(t)) seq.push((el.classList.contains("on") ? "●" : "○") + t);
    } else if (tag === "SELECT") {
      const cl = cls.split(" ").filter(x => x.indexOf("o-") === 0 || x.indexOf("i-") === 0)[0] || "sel";
      seq.push("▼" + cl + "(" + el.options.length + ")");
    } else if (tag === "INPUT") {
      if (el.type === "checkbox") seq.push("☐" + (cls.split(" ").find(x => x.indexOf("o-") === 0 || x.indexOf("g1") === 0 || x.indexOf("i-") === 0) || cls.split(" ")[0]));
      else if (el.type === "number" || el.type === "text") seq.push("⌨" + (cls.split(" ").find(x => x.indexOf("o-") === 0 || x.indexOf("i-") === 0) || cls.split(" ")[0]));
    }
  });
  return seq;
}
const SHAPES = [
  ["1.บานเลื่อน", "sliding_sms"], ["2.เลื่อนภายใน", "inner_top_stack"], ["3.บานเปิด", "casement_euro"],
  ["4.บานกระทุ้ง", "awning_euro"], ["5.บานหมุน", "pivot"], ["6.บานเฟี้ยม", "folding"],
  ["7.ติดตาย", "fixed_glass"], ["8.บานเปลือย-ติดตาย", "frameless_fixed"], ["8b.บานเปลือย-ประตู", "frameless_door"],
  ["9.ผนัง", "wall_ext"], ["10.ดัดโค้ง", "curved_double"], ["11.PCDoor", "pc_door_2"],
  ["12.YKK", "ykk_vent"], ["13.บานยก", "lift_sms"], ["14.shower", "shower"],
];
for (const [name, id] of SHAPES) {
  const r = renderProd(id);
  if (!r) { console.log(`\n### ${name} (${id}) — RENDER FAIL`); continue; }
  if (!r.ok) { console.log(`\n### ${name} (${id}) — ไม่มีใน i-prod`); continue; }
  console.log(`\n### ${name} (${id})`);
  console.log(dump(r.ch).join("  "));
}
