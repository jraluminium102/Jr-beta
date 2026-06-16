// ธง 4: วัสดุปิดรอยต่อ (rfsealer) คิดเงิน max(5000, 800×ยาว)
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

// render หลังคาเมทัล imp7 ขนาด 4×3 (พื้นที่ใหญ่ > min ไม่ติด min หลังคา) + sealer
function priceWithSealer(sealerLen) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  const gs = ch.querySelector(".i-group"); gs.value = "3"; fire(gs, "change");
  const ps = ch.querySelector(".i-prod"); ps.value = "imp7"; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  wi.value = "4"; fire(wi, "input"); fire(wi, "change");
  hi.value = "3"; fire(hi, "input"); fire(hi, "change");
  if (sealerLen !== null) {
    const cb = ch.querySelector(".o-rfsealer");
    if (!cb) return { err: "no o-rfsealer" };
    cb.checked = true; fire(cb, "change");
    const ln = ch.querySelector(".o-rfsealer-len");
    if (!ln) return { err: "no o-rfsealer-len" };
    ln.value = String(sealerLen); fire(ln, "input"); fire(ln, "change");
  }
  const r = w.readItem(ch);
  return { sell: r && r.r ? r.r.sell : null };
}

const base = priceWithSealer(null);           // ไม่ติ๊ก sealer
const len10 = priceWithSealer(10);            // 10 ม. → +8,000
const len4 = priceWithSealer(4);              // 4 ม. → +5,000 (min)
const len0 = priceWithSealer(0);              // ติ๊กแต่ 0 ม. → +5,000 (min)

want("ฐาน imp7 4×3 (ไม่มี sealer)", base.sell !== null && !base.err, "ได้ " + base.sell + (base.err || ""));
want("sealer 10 ม. → +8,000 (800×10)", len10.sell - base.sell === 8000, "Δ=" + (len10.sell - base.sell));
want("sealer 4 ม. → +5,000 (ติด min)", len4.sell - base.sell === 5000, "Δ=" + (len4.sell - base.sell));
want("sealer ติ๊ก 0 ม. → +5,000 (min)", len0.sell - base.sell === 5000, "Δ=" + (len0.sell - base.sell));

let pass = 0; for (const c of C) { console.log((c.ok ? "✅" : "❌") + " " + c.n + "  [" + c.d + "]"); if (c.ok) pass++; }
console.log(`\n${pass}/${C.length} ผ่าน` + (jsErrors.length ? `  · jsErrors: ${jsErrors.length}` : ""));
if (jsErrors.length) console.log("JSERR:", jsErrors.slice(0, 3).join(" | "));
process.exit(pass === C.length ? 0 : 1);
