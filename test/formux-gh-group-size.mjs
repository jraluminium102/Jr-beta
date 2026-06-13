// ALLG-v2 regression: (1) กดกั้นห้องแล้วชิปกลุ่มงานต้องไม่หาย (2) ช่องกว้าง/สูง ต้องเล็ก (≤120px) ไม่เต็มจอ
// + selector ไม่ซ้อน (fam-prodsel คงที่ 1 อันเมื่อกดสลับ)
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

// ===== บั๊ก 1: กดกั้นห้อง (GH side) → ชิปกลุ่มงานต้องยังอยู่ (เดิมซ่อน .full ที่มีชิป) =====
doc.getElementById("items").innerHTML = "";
const box = w.addGlasshouseSet();
const gch = box.querySelector(".set-parts .ch");
const gGroupChip = gch.querySelector('.chip[onclick*="i-group"]');
want("GH side: ชิปกลุ่มงานยังมีอยู่ (ไม่ถูก remove)", !!gGroupChip);
const gWrap = gch.querySelector(".i-group").closest(".full");
want("GH side: แถวกลุ่มงานไม่ถูกซ่อน (display ไม่ none)", gWrap && gWrap.style.display !== "none", gWrap ? "disp=" + gWrap.style.display : "no wrap");

// ===== บั๊ก 2: selector ไม่ซ้อน — กดสลับชนิดบานหลายรอบ fam-prodsel ต้อง = 1 =====
doc.getElementById("items").innerHTML = "";
w.addItem(doc.getElementById("items"));
const ch = doc.querySelector("#items .ch");
function clickFam(cat) { const b = [...ch.querySelectorAll(".fam-prodsel .chip")].find((c) => c.dataset.cat === cat); if (b) b.click(); }
clickFam("บานเปิด"); clickFam("บานเฟี้ยม"); clickFam("บานเลื่อน"); clickFam("บานเปิด");
want("ไม่ซ้อน: fam-prodsel = 1 อัน หลังกดสลับ 4 รอบ", ch.querySelectorAll(".fam-prodsel").length === 1, "got " + ch.querySelectorAll(".fam-prodsel").length);

// ===== ขนาด: ช่องกว้าง/สูง ต้องมี width แคบ (style width:92px) ไม่ full =====
const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
want("ช่องกว้าง width แคบ (style 92px ไม่เต็มจอ)", /width:\s*92px/.test(wi.getAttribute("style") || ""), wi.getAttribute("style"));
want("ช่องสูง width แคบ (style 92px)", /width:\s*92px/.test(hi.getAttribute("style") || ""), hi.getAttribute("style"));

// ===== รุ่นอยู่ใต้รูปแบบบาน (container block ไม่ flex) — เช็คผ่าน class chip-grid 2 ชุดใน fam =====
clickFam("บานเลื่อน");
const fam = ch.querySelector(".fam-prodsel");
const grids = fam.querySelectorAll(".chip-grid");
want("fam-prodsel มี chip-grid (รูปแบบ + รุ่น)", grids.length >= 2, "grids=" + grids.length);

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== formux GH group + size (ALLG-v2 regression) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
