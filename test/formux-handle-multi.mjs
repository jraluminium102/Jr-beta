// FORMUX verify: มือจับ multi-toggle (block 3) — คลิก toggle จริงผ่าน UI ใหม่
// พิสูจน์ว่า: ติ๊กดิจิตอล+สแตนอร่ามพร้อมกัน → sub โผล่ + ราคาบวกสะสมถูก + ปิดตัวเดียวเหลืออีกตัว
// หลักการ UI-sync: toggle/chip ต้อง sync ค่าเข้า .o-* เดิม + fire change → readItem อ่านได้
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
function setField(ch, sel, value) {
  const el = ch.querySelector(sel); if (!el) throw new Error("ไม่พบ " + sel);
  el.value = String(value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  return el;
}

// --- add บานเลื่อน ยูโร (digihandle:1) ---
w.addItem();
const d = doc.querySelector("#items .ch");
setField(d, ".i-group", "1");
setField(d, ".i-prod", "sliding_euro");
setField(d, ".i-w", "2.0");
setField(d, ".i-h", "2.2");
const qtyEl = d.querySelector(".i-qty"); if (qtyEl) setField(d, ".i-qty", "1");

const baseSell = w.readItem(d).r.sell;
want("baseline ราคา > 0", baseSell > 0, "sell=" + baseSell);

// --- กล่องมือจับโผล่ + มี toggle ดิจิตอล/สแตนอร่าม ---
const wrap = d.querySelector(".handle-brand-wrap");
want("กล่องมือจับ render", !!wrap);
const btnDigital = d.querySelector('.handle-brand-wrap [data-hbrand="digital"]');
const btnStainless = d.querySelector('.handle-brand-wrap [data-hbrand="stainless"]');
want("มี toggle ดิจิตอล", !!btnDigital);
want("มี toggle สแตนอร่าม", !!btnStainless);

// --- ก่อนติ๊ก: sub ซ่อน ---
const subDigital = d.querySelector(".hsub-digital");
const subStainless = d.querySelector(".hsub-stainless");
want("ก่อนติ๊ก sub ดิจิตอลซ่อน", subDigital && subDigital.style.display === "none");

// --- ติ๊กดิจิตอล + สแตนอร่าม ---
w.toggleHandleBrand(btnDigital);
w.toggleHandleBrand(btnStainless);
want("ติ๊กแล้ว sub ดิจิตอลโผล่", subDigital.style.display !== "none");
want("ติ๊กแล้ว sub สแตนอร่ามโผล่", subStainless.style.display !== "none");

// --- เลือกค่าใน sub: DIGI[0] +10,000 / STAINLESS[0] +1,500 ---
setField(d, ".o-digi", "0");
setField(d, ".o-stainless", "0");
const both = w.readItem(d);
want("readItem อ่าน digi ได้", both.optSel.digi === "0", "digi=" + both.optSel.digi);
want("readItem อ่าน stainless ได้", both.optSel.stainless === "0", "stainless=" + both.optSel.stainless);

const sellBoth = both.r.sell;
const delta = sellBoth - baseSell;
// บวกสะสม 10,000 + 1,500 = 11,500 (roundUp ±1000 ได้)
want("ราคาบวกสะสมทั้งสองแบรนด์ (~11,500)", delta >= 11000 && delta <= 12500, "delta=" + delta);
const msgs = (both.r.msgs || []).join(" | ");
want("ใบมีข้อความดิจิตอล", /S1 ก้านโยก|มือจับ.*ดิจิ|ดิจิตอล/.test(msgs) || /10,000/.test(msgs), msgs.slice(0,120));
want("ใบมีข้อความสแตนอร่าม", /สแตนอร่าม/.test(msgs), msgs.slice(0,120));

// --- ปิดดิจิตอล → เหลือสแตนอร่ามอย่างเดียว ---
w.toggleHandleBrand(btnDigital);
const afterOff = w.readItem(d);
want("ปิดดิจิตอลแล้ว digi ถูกเคลียร์", afterOff.optSel.digi === "" || afterOff.optSel.digi == null, "digi=" + afterOff.optSel.digi);
const deltaStainOnly = afterOff.r.sell - baseSell;
want("เหลือเฉพาะสแตนอร่าม (~1,500)", deltaStainOnly >= 1000 && deltaStainOnly <= 2500, "delta=" + deltaStainOnly);
want("ไม่มี JS error", errors.length === 0, errors.slice(0,2).join(" / "));

// --- report ---
let pass = 0;
console.log("\n=== FORMUX มือจับ multi-toggle ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.name + (c.detail ? "  [" + c.detail + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
