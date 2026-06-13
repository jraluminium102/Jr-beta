// ALLG-v2: คิดเร็ว — เทียบราคาสีอลู/กระจก + ระแนงมีสีอลู (finish) · ราคาต้องตรง engine (ห้ามเพี้ยน)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const checks = []; const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function fire(el, t) { el.dispatchEvent(new w.Event(t, { bubbles: true })); }

doc.getElementById("q-items").innerHTML = "";
w.addQuickItem();
const d = doc.querySelector("#q-items .ch");
function group(g) { const b = [...d.querySelectorAll(".qi-groupchips .chip")].find((c) => c.dataset.g === g); if (b) b.click(); }
function setV(s, v) { const e = d.querySelector(s); e.value = v; fire(e, "input"); }

// ===== งานบาน: เลือกสีอลู (ซาฮาร่า) + กระจกอัปเกรด → ราคาตรง engine + เทียบโชว์ =====
setV(".qi-w", "2"); setV(".qi-h", "2");
const cs = d.querySelector(".qi-color");
const paidColor = [...cs.options].find((o) => /ซาฮาร|ลายไม้|อบพิเศษ/.test(o.textContent));
if (paidColor) { cs.value = paidColor.value; fire(cs, "input"); }
let it = w.readQuickItem(d);
const p1 = it.p;
want("งานบาน: ราคาคิดเร็ว = engine (สีอลูจริง)", it.u.sell === w.calcUnit(p1, "2", "2", 0, parseInt(cs.value), 1, {}, false).sell, "qi=" + it.u.sell);
want("งานบาน: เทียบสีอลู โชว์ delta > 0", it.colorDelta > 0, "colorDelta=" + it.colorDelta);

// กระจกอัปเกรด
const gs = d.querySelector(".qi-glass");
const upGlass = [...gs.options].find((o) => /เทมเปอร์/.test(o.textContent));
if (upGlass) { gs.value = upGlass.value; fire(gs, "input"); }
it = w.readQuickItem(d);
want("งานบาน: เทียบกระจก โชว์ delta > 0", it.glassDelta > 0, "glassDelta=" + it.glassDelta);
want("งานบาน: ราคา = engine (สี+กระจก)", it.u.sell === w.calcUnit(p1, "2", "2", parseInt(gs.value), parseInt(cs.value), 1, {}, false).sell, "qi=" + it.u.sell);

// ===== ระแนง: qi-finish (สีอลู) โผล่ + ราคา = engine + เทียบโชว์ =====
group("2"); // ระแนง·ราว → default ระแนงบังตา
const fw = d.querySelector(".qi-finish-wrap");
want("ระแนง: qi-finish (สีอลู) โผล่", fw && fw.style.display !== "none", fw ? "disp=" + fw.style.display : "no fw");
const fsel = d.querySelector(".qi-finish");
want("ระแนง: qi-finish มีตัวเลือกอบสี > 3", fsel && fsel.options.length > 3, "opts=" + (fsel ? fsel.options.length : 0));
if (fsel && fsel.options.length > 3) { fsel.selectedIndex = fsel.options.length - 1; fire(fsel, "input"); }
it = w.readQuickItem(d);
const p2 = it.p;
const finV = parseFloat(fsel.value) || 0;
want("ระแนง: ราคา = engine (finish สีอลู)", it.u.sell === w.calcUnit(p2, d.querySelector(".qi-w").value, d.querySelector(".qi-h").value, 0, 0, 1, { finish: finV }, false).sell, "qi=" + it.u.sell);
want("ระแนง: เทียบสีอลู โชว์ delta > 0", it.finDelta > 0, "finDelta=" + it.finDelta);

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== คิดเร็ว เทียบสีอลู/กระจก + ระแนงสีอลู (ALLG-v2) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
