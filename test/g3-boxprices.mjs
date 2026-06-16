// ธง G: ราคาทุกกล่อง G3 — calcUnit ส่ง g3box · calcQuote เติม span (display === engine)
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
const sv = (ch, sel, v) => { const e = ch.querySelector(sel); if (e) { e.value = String(v); fire(e, "input"); fire(e, "change"); } };

doc.getElementById("items").innerHTML = ""; w.addItem(doc.getElementById("items"));
const ch = doc.querySelector("#items .ch");
sv(ch, ".i-group", "3"); sv(ch, ".i-prod", "imp7"); sv(ch, ".i-w", 4); sv(ch, ".i-h", 3);

// ปิดปลาย (roofend = ev = 4×1000 = 4,000)
const endChip = Array.from(ch.querySelectorAll('.chip[data-val="ปิดปลาย"]')).find(b => b.closest('.chip-group'));
if (endChip) endChip.click();
// ของเสริม: sealer 10 ม. → extras = 8,000
const cb = ch.querySelector(".o-rfsealer"); if (cb) { cb.checked = true; fire(cb, "change"); }
sv(ch, ".o-rfsealer-len", 10);
// เลื่อน
const sl = ch.querySelector(".o-slide"); if (sl) { sl.checked = true; fire(sl, "change"); }
// roof2 ชินโค + ยาว2×ยื่น2
const r2c = ch.querySelector('.chip[data-r2="ชินโค"]'); if (r2c) r2c.click();
sv(ch, ".o-r2w", 2); sv(ch, ".o-r2h", 2);
// ฝ้า โหมดรวม
const inB = Array.from(ch.querySelectorAll('[data-val="in"]')).find(b => b.closest('.chip-group')); if (inB) inB.click();

// อ่าน g3box จาก engine
const r = w.readItem(ch).r;
const box = r.g3box || {};
want("g3box.roofend = 4,000 (ปิดปลาย 4×1000)", box.roofend === 4000, "ได้ " + box.roofend);
want("g3box.extras = 8,000 (sealer 10ม.)", box.extras === 8000, "ได้ " + box.extras);
want("g3box.slide > 0 (เปิดเลื่อน)", box.slide > 0, "ได้ " + box.slide);
want("g3box.roof2 = 44,000 (ชินโค imp15 4ตร.ม.)", box.roof2 === 44000, "ได้ " + box.roof2);
want("g3box.ceil > 0 (ฝ้ารวม)", box.ceil > 0, "ได้ " + box.ceil);

// calcQuote เติม span
w.groupGHOpts(ch);
w.calcQuote();
const txt = (sel) => { const e = ch.querySelector(sel); return e ? e.textContent : "(no el)"; };
want("span #g3-slide-price เติมแล้ว (ไม่ ฿0)", txt('#g3-slide-price') !== '฿0' && txt('#g3-slide-price').startsWith('฿'), txt('#g3-slide-price'));
want("span #g3-roof2-head-price = ฿44,000", txt('#g3-roof2-head-price') === '฿44,000', txt('#g3-roof2-head-price'));
want("span #g3-ceil-addon-price เติมแล้ว", txt('#g3-ceil-addon-price') !== '฿0' && txt('#g3-ceil-addon-price').startsWith('฿'), txt('#g3-ceil-addon-price'));
want("summary roofend price = ฿4,000", txt('.gh-cat-price[data-pk="roofend"]') === '฿4,000', txt('.gh-cat-price[data-pk="roofend"]'));
want("summary extras price = ฿8,000", txt('.gh-cat-price[data-pk="extras"]') === '฿8,000', txt('.gh-cat-price[data-pk="extras"]'));

let pass = 0; for (const c of C) { console.log((c.ok ? "✅" : "❌") + " " + c.n + "  [" + c.d + "]"); if (c.ok) pass++; }
console.log(`\n${pass}/${C.length} ผ่าน` + (jsErrors.length ? `  · jsErrors: ${jsErrors.length}` : ""));
if (jsErrors.length) console.log("JSERR:", jsErrors.slice(0, 3).join(" | "));
process.exit(pass === C.length ? 0 : 1);
