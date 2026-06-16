// ธง H/3: เมทัล/ชินโค imp7-20 ใส่ min — ราคาพื้นที่เล็กต้องติด min
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

function priceAt(id, W, H) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = "3"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps || !ps.querySelector('option[value="' + id + '"]')) return null;
  ps.value = id; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  wi.value = String(W); fire(wi, "input"); fire(wi, "change");
  hi.value = String(H); fire(hi, "input"); fire(hi, "change");
  // อ่านยอดขายต่อชิ้นจาก readItem
  const r = w.readItem(ch);
  return r && r.r ? r.r.sell : null;
}

// imp15 ชินโค Heat Cut: min 48,000
// พื้นที่เล็ก 1×1=1 ตร.ม. → ต้องติด min 48,000
const a1 = priceAt('imp15', 1, 1);
want("imp15 1×1 (เล็ก) → ติด min 48,000", a1 === 48000, "ได้ " + a1);
// imp7 เมทัล: min 28,000 — 1×1 → 28,000
const a2 = priceAt('imp7', 1, 1);
want("imp7 1×1 (เล็ก) → ติด min 28,000", a2 === 28000, "ได้ " + a2);
// imp19 ชินโค Prime: min 61,000 — 1×1
const a3 = priceAt('imp19', 1, 1);
want("imp19 1×1 (เล็ก) → ติด min 61,000", a3 === 61000, "ได้ " + a3);
// imp20 = ราคา Prime (IMP19) แต่ min 61,000 เท่ากัน
const a4 = priceAt('imp20', 1, 1);
want("imp20 1×1 (เล็ก) → ติด min 61,000 (=Prime)", a4 === 61000, "ได้ " + a4);
// imp15 พื้นที่ใหญ่ 6 ตร.ม. (2×3) → ราคา = 6×rate > min (ไม่ติด min)
const a5 = priceAt('imp15', 2, 3);
want("imp15 2×3=6 ตร.ม. → เกิน min (ราคาตามเรต > 48,000)", a5 !== null && a5 > 48000, "ได้ " + a5);

let pass = 0; for (const c of C) { console.log((c.ok ? "✅" : "❌") + " " + c.n + "  [" + c.d + "]"); if (c.ok) pass++; }
console.log(`\n${pass}/${C.length} ผ่าน` + (jsErrors.length ? `  · jsErrors: ${jsErrors.length}` : ""));
if (jsErrors.length) console.log("JSERR:", jsErrors.slice(0, 3).join(" | "));
process.exit(pass === C.length ? 0 : 1);
