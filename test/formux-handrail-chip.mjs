// FORMUX verify: ราวจับ + ความหนากระจก (G2 ราวกันตก) แปลง dropdown → ชิป
// พิสูจน์: คลิกชิปจริง → sync เข้า .o-handrail/.o-railglass เดิม + recalc + ราคา addon ถูก
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
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(ch, sel, v) { const e = ch.querySelector(sel); e.value = String(v); e.dispatchEvent(new w.Event("input", { bubbles: true })); e.dispatchEvent(new w.Event("change", { bubbles: true })); return e; }

w.addItem();
const d = doc.querySelector("#items .ch");
sf(d, ".i-group", "2");
sf(d, ".i-prod", "imp6");
sf(d, ".i-w", "6.0");
sf(d, ".i-h", "1.0");
const q = d.querySelector(".i-qty"); if (q) sf(d, ".i-qty", "1");

// ชิป render + select เดิมถูกซ่อน
const hrChips = d.querySelectorAll('.chip[onclick*="o-handrail"]');
const rgChips = d.querySelectorAll('.chip[onclick*="o-railglass"]');
want("ราวจับ render เป็นชิป (3 ปุ่ม)", hrChips.length === 3, "n=" + hrChips.length);
want("ความหนากระจก render เป็นชิป (2 ปุ่ม)", rgChips.length === 2, "n=" + rgChips.length);
const hrSel = d.querySelector(".o-handrail");
want("select .o-handrail ยังอยู่ + ซ่อน", hrSel && hrSel.style.display === "none");

// baseline (ไม่มีราวจับ)
const base = w.readItem(d).r.sell;
want("baseline = 44,000 (6×7,200 roundUp)", base === 44000, "sell=" + base);

// คลิกชิป "ยู 5 หุน"
const btnU5 = Array.from(hrChips).find((b) => b.dataset.val === "u5");
btnU5.click();
const afterU5 = w.readItem(d);
want("ชิปยู5หุน sync เข้า select", hrSel.value === "u5", "val=" + hrSel.value);
want("readItem อ่าน handrail=u5", afterU5.optSel.handrail === "u5");
want("ราคา +3,000 (47,000)", afterU5.r.sell === 47000, "sell=" + afterU5.r.sell);
want("ใบมีข้อความราวจับ ยู 5 หุน", (afterU5.r.msgs || []).join(" ").includes("ยู 5 หุน"), (afterU5.r.msgs||[]).join(" "));
want("ชิปยู5หุน ติดสถานะ on", btnU5.classList.contains("on"));

// คลิกชิป "กล่อง" → ต้องสลับ ไม่ใช่บวกซ้ำ
const btnBox = Array.from(hrChips).find((b) => b.dataset.val === "box");
btnBox.click();
const afterBox = w.readItem(d);
want("สลับเป็นกล่อง (handrail=box)", afterBox.optSel.handrail === "box", "val=" + hrSel.value);
want("กล่อง 600×6=3,600 → 6×7,200+3,600=46,800 → 47,000", afterBox.r.sell === 47000, "sell=" + afterBox.r.sell);
want("ชิปยู5หุน เลิก on แล้ว", !btnU5.classList.contains("on"));

// คลิกกลับ "ไม่มี"
const btnNone = Array.from(hrChips).find((b) => b.dataset.val === "");
btnNone.click();
want("กลับไม่มี → 44,000", w.readItem(d).r.sell === 44000, "sell=" + w.readItem(d).r.sell);

// ความหนากระจก ชิป (ราคาไม่ขึ้นกับความหนา)
const btn12 = Array.from(rgChips).find((b) => b.dataset.val === "12");
btn12.click();
const rg = w.readItem(d);
want("railglass=12 sync", rg.optSel.railglass === "12", "val=" + d.querySelector(".o-railglass").value);
want("เปลี่ยนความหนา ราคาไม่เปลี่ยน (44,000)", rg.r.sell === 44000, "sell=" + rg.r.sell);

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== FORMUX ราวจับ/ความหนากระจก เป็นชิป (G2) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
