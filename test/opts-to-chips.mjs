// 18 dropdowns → ชิป (rfChips) — ตรวจ: render ชิป, default ตรง select, กดชิป sync value, ราคาคำนวณ, ล็อกธรณีเมื่อรางยู
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) throw new Error("no " + sel); e.value = String(v); e.dispatchEvent(new w.Event("input", { bubbles: true })); e.dispatchEvent(new w.Event("change", { bubbles: true })); return e; }
function add(group, prod) { w.addItem(); const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1]; sf(d, ".i-group", group); if (prod) sf(d, ".i-prod", prod); return d; }
// helper: ตรวจ select ซ่อน + มีชิป + default chip.on ตรง select.value
function chipCase(d, cls, expectDefault, nOpts) {
  const sel = d.querySelector("." + cls);
  const chips = d.querySelectorAll('.chip[onclick*="' + cls + '"]');
  want(cls + ": select ซ่อน", sel && sel.style.display === "none", sel ? "disp=" + sel.style.display : "no select");
  want(cls + ": มีชิป " + nOpts + " ตัว", chips.length === nOpts, "n=" + chips.length);
  want(cls + ": default = '" + expectDefault + "'", sel && sel.value === expectDefault, "val=" + (sel && sel.value));
  const onChip = [].find.call(chips, (c) => c.classList.contains("on"));
  want(cls + ": ชิป .on ตรง default", onChip && onChip.dataset.val === expectDefault, onChip ? onChip.dataset.val : "none on");
  return { sel, chips };
}
// helper: กดชิปตัวที่ไม่ใช่ default → select.value เปลี่ยนตาม
function clickOther(d, cls, val) {
  const chip = [].find.call(d.querySelectorAll('.chip[onclick*="' + cls + '"]'), (c) => c.dataset.val === String(val));
  chip.click();
  const sel = d.querySelector("." + cls);
  want(cls + ": กดชิป '" + val + "' → select.value ตรง", sel.value === String(val), "val=" + sel.value);
  want(cls + ": กดแล้ว .on ย้ายมาชิปนี้", chip.classList.contains("on"));
}

// ===== บานเปิด: o-thresh =====
const dKp = add("1", "casement_euro");
chipCase(dKp, "o-thresh", "std", 2);
const sell0 = w.readItem(dKp).r.sell;
clickOther(dKp, "o-thresh", "turtle");
want("o-thresh: turtle +1,000 → ราคาเพิ่ม", w.readItem(dKp).r.sell === sell0 + 1000, "0=" + sell0 + " turtle=" + w.readItem(dKp).r.sell);
// ล็อกเมื่อติ๊กรางยู
const uch = dKp.querySelector(".o-uchannel");
want("มี o-uchannel (ฝังรางยู)", !!uch);
uch.checked = true; uch.dispatchEvent(new w.Event("change", { bubbles: true }));
want("รางยู: o-thresh ถูกบังคับ std", dKp.querySelector(".o-thresh").value === "std", "val=" + dKp.querySelector(".o-thresh").value);
const lockedChip = [].find.call(dKp.querySelectorAll('.chip[onclick*="o-thresh"]'), (c) => c.dataset.val === "turtle");
want("รางยู: ชิปหลังเต่าถูกล็อก (pointer-events:none)", lockedChip.style.pointerEvents === "none", "pe=" + lockedChip.style.pointerEvents);
want("รางยู: ชิป std กลับมา .on", [].find.call(dKp.querySelectorAll('.chip[onclick*="o-thresh"]'), (c) => c.dataset.val === "std").classList.contains("on"));
uch.checked = false; uch.dispatchEvent(new w.Event("change", { bubbles: true }));
want("ปลดรางยู: ชิปหลังเต่าปลดล็อก", lockedChip.style.pointerEvents === "");

// ===== บานเฟี้ยม: o-threshf =====
const dF = add("1", "folding");
chipCase(dF, "o-threshf", "outer", 2);
clickOther(dF, "o-threshf", "inner");

// ===== shower =====
const dSh = add("1", "shower");
chipCase(dSh, "o-shtype", "door_fixed", 3);
chipCase(dSh, "o-shdoortype", "swing", 2);
clickOther(dSh, "o-shtype", "fixed_only");

// ===== frameless =====
const dFr = add("1", "frameless_door");
chipCase(dFr, "o-frametype", "swing", 2);
chipCase(dFr, "o-framecolor", "ขาว", 6);
clickOther(dFr, "o-framecolor", "ดำ");

// ===== roof_laminate =====
const dL = add("3", "roof_laminate");
chipCase(dL, "o-lamfilm", "กันร้อน", 3);
chipCase(dL, "o-lamthick", "4+4", 2);

// ===== glass_replace =====
const dGr = add("1", "glass_replace");
if (dGr.querySelector(".o-glassmode")) { chipCase(dGr, "o-glassmode", "auto", 2); clickOther(dGr, "o-glassmode", "manual"); }
else want("o-glassmode: glass_replace มี select", false, "no o-glassmode (prod id?)");

// ===== ฝ้า-ผนัง =====
const dIso = add("3", "isowall");
if (dIso.querySelector(".o-wallframe")) { chipCase(dIso, "o-wallframe", "", 2); chipCase(dIso, "o-isothick", "10", 3); }
else want("isowall: มี o-wallframe", false, "prod?");
const dCs = add("3", "ceiling_smooth");
if (dCs.querySelector(".o-ceilfinish")) chipCase(dCs, "o-ceilfinish", "ทาสีขาว", 3);
else want("ceiling_smooth: มี o-ceilfinish", false, "prod?");

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 3).join(" / "));

let pass = 0;
console.log("\n=== opts-to-chips (18 dropdowns → ชิป) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
