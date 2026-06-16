// ธง C: ฝ้าออปชั่นในหลังคา — ราคา addon ต้อง === ฝ้า standalone ที่พื้นที่เดียวกัน (ceilCalc reuse calcUnit)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const jsErrors = [];
vc.on("jsdomError", e => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) jsErrors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const C = []; const want = (n, ok, d) => C.push({ n, ok: !!ok, d: d || "" });
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const sv = (ch, sel, v, ev) => { const e = ch.querySelector(sel); if (e) { e.value = String(v); fire(e, ev || "input"); fire(e, "change"); } };

// ฝ้า standalone ที่พื้นที่ A (w=A, h=1) — เป็น "เป้า"
function ceilStandalone(id, A, color, insul) {
  doc.getElementById("items").innerHTML = ""; w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  let found = false;
  for (const g of ['1', '3', '6']) { const gs = ch.querySelector(".i-group"); gs.value = g; fire(gs, "change"); if (ch.querySelector('.i-prod').querySelector('option[value="' + id + '"]')) { found = true; break; } }
  const ps = ch.querySelector(".i-prod"); if (!ps.querySelector('option[value="' + id + '"]')) return null;
  ps.value = id; fire(ps, "change");
  sv(ch, ".i-w", A); sv(ch, ".i-h", 1);
  if (color) { const ck = ch.querySelector(".o-ckolor"); if (ck) { ck.value = color; fire(ck, "change"); } }
  if (insul) { const ib = ch.querySelector(".o-insul"); if (ib) { ib.checked = true; fire(ib, "change"); } }
  return w.readItem(ch).r.sell;
}

// หลังคา imp7 12 ตร.ม. (4×3) + ฝ้า addon
function roofWithCeil(ceilType, area, color, insul) {
  doc.getElementById("items").innerHTML = ""; w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  sv(ch, ".i-group", "3", "change"); sv(ch, ".i-prod", "imp7", "change");
  sv(ch, ".i-w", 4); sv(ch, ".i-h", 3);
  const base = w.readItem(ch).r.sell;
  // เปิดฝ้า โหมดรวม
  const inBtn = Array.from(ch.querySelectorAll('[data-val]')).find(b => b.dataset.val === 'in' && b.closest('.chip-group'));
  if (!inBtn) return { err: "no in-mode btn" };
  inBtn.click();
  // ชนิดฝ้า
  const tBtn = ch.querySelector('.chip[data-cid="' + ceilType + '"]'); if (!tBtn) return { err: "no type btn" }; tBtn.click();
  if (color) sv(ch, ".o-ceilcolor", color, "change");
  if (insul) { const ib = ch.querySelector(".o-ceilinsul"); if (ib) { ib.checked = true; fire(ib, "change"); } }
  if (area != null) sv(ch, ".o-ceilarea", area);
  const withCeil = w.readItem(ch).r.sell;
  return { base, withCeil, delta: withCeil - base };
}

// 1) ceil_cshape ขาว-ดำ 15 ตร.ม. → 32,000
want("ฝ้า cshape ขาว-ดำ 15 → delta === standalone", roofWithCeil('ceil_cshape', 15, 'ขาว-ดำ').delta === ceilStandalone('ceil_cshape', 15, 'ขาว-ดำ'), "addon=" + roofWithCeil('ceil_cshape', 15, 'ขาว-ดำ').delta + " standalone=" + ceilStandalone('ceil_cshape', 15, 'ขาว-ดำ'));
// 2) ceil_cshape ลายไม้ 4 ตร.ม. (ติด min 10) → 27,000
want("ฝ้า cshape ลายไม้ 4 (min10) → delta === standalone", roofWithCeil('ceil_cshape', 4, 'ลายไม้').delta === ceilStandalone('ceil_cshape', 4, 'ลายไม้'), "addon=" + roofWithCeil('ceil_cshape', 4, 'ลายไม้').delta + " standalone=" + ceilStandalone('ceil_cshape', 4, 'ลายไม้'));
// 3) ceiling_smooth 15 → 18,000
want("ฝ้าฉาบเรียบ 15 → delta === standalone", roofWithCeil('ceiling_smooth', 15, '').delta === ceilStandalone('ceiling_smooth', 15, ''), "addon=" + roofWithCeil('ceiling_smooth', 15, '').delta + " standalone=" + ceilStandalone('ceiling_smooth', 15, ''));
// 4) ceiling_smooth 4 (min 12,000)
want("ฝ้าฉาบเรียบ 4 (min12k) → delta === standalone", roofWithCeil('ceiling_smooth', 4, '').delta === ceilStandalone('ceiling_smooth', 4, ''), "addon=" + roofWithCeil('ceiling_smooth', 4, '').delta + " standalone=" + ceilStandalone('ceiling_smooth', 4, ''));
// 5) ceiling_smooth + ฉนวน 15 → 18,000 + 600×15
want("ฝ้าฉาบเรียบ+ฉนวน 15 → delta === standalone+ฉนวน", roofWithCeil('ceiling_smooth', 15, '', true).delta === ceilStandalone('ceiling_smooth', 15, '', true), "addon=" + roofWithCeil('ceiling_smooth', 15, '', true).delta + " standalone=" + ceilStandalone('ceiling_smooth', 15, '', true));
// 6) auto area (ceilarea ว่าง) = พื้นที่หลังคา 12 → cshape ขาว-ดำ 12
want("auto area (ว่าง=12 ตร.ม.) → delta === standalone 12", roofWithCeil('ceil_cshape', null, 'ขาว-ดำ').delta === ceilStandalone('ceil_cshape', 12, 'ขาว-ดำ'), "addon=" + roofWithCeil('ceil_cshape', null, 'ขาว-ดำ').delta + " standalone12=" + ceilStandalone('ceil_cshape', 12, 'ขาว-ดำ'));

let pass = 0; for (const c of C) { console.log((c.ok ? "✅" : "❌") + " " + c.n + "  [" + c.d + "]"); if (c.ok) pass++; }
console.log(`\n${pass}/${C.length} ผ่าน` + (jsErrors.length ? `  · jsErrors: ${jsErrors.length}` : ""));
if (jsErrors.length) console.log("JSERR:", jsErrors.slice(0, 3).join(" | "));
process.exit(pass === C.length ? 0 : 1);
