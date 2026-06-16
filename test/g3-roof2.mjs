// ธง E: roof2 ต่อปลายวัสดุที่ 2 — ชิป path ต้องได้ราคา engine เท่า direct path (calc FIX-12 ไม่เปลี่ยน)
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

function mkRoof() {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  ch.querySelector(".i-group").value = "3"; fire(ch.querySelector(".i-group"), "change");
  ch.querySelector(".i-prod").value = "imp7"; fire(ch.querySelector(".i-prod"), "change");
  ch.querySelector(".i-w").value = "4"; fire(ch.querySelector(".i-w"), "input");
  ch.querySelector(".i-h").value = "3"; fire(ch.querySelector(".i-h"), "input");
  return ch;
}

// Path A: ผ่านชิป (กดชิป ชินโค → imp15 · ยาว2×ยื่น2=4 ตร.ม.)
const chA = mkRoof();
const shincoChip = Array.from(chA.querySelectorAll('.chip[data-r2]')).find(b => b.dataset.r2 === 'ชินโค');
want("มีชิปกลุ่ม ชินโค", !!shincoChip, shincoChip ? shincoChip.dataset.r2 : "ไม่เจอ");
if (shincoChip) shincoChip.click();
const bodyVis = chA.querySelector('.o-roof2-body').style.display !== 'none';
want("กดชิป → body roof2 โผล่", bodyVis, "display=" + chA.querySelector('.o-roof2-body').style.display);
want("o-roof2 ถูก set = imp15", chA.querySelector('.o-roof2').value === 'imp15', "ได้ " + chA.querySelector('.o-roof2').value);
const r2w = chA.querySelector('.o-r2w'), r2h = chA.querySelector('.o-r2h');
r2w.value = "2"; fire(r2w, "input"); r2h.value = "2"; fire(r2h, "input");
want("ยาว2×ยื่น2 → o-roof2area auto = 4.00", chA.querySelector('.o-roof2area').value === '4.00', "ได้ " + chA.querySelector('.o-roof2area').value);
const headPrice = chA.querySelector('#g3-roof2-head-price').textContent;
want("ราคาหัวกล่องโชว์ ฿ (ไม่ใช่ ฿0)", headPrice !== '฿0' && headPrice.startsWith('฿'), "ได้ " + headPrice);
const priceVal = chA.querySelector('.o-r2-priceval').textContent;
want("ราคาวัสดุ2 preview โชว์ ฿", priceVal !== '฿—' && priceVal.startsWith('฿'), "ได้ " + priceVal);
const sellA = w.readItem(chA).r.sell;

// Path B: เซ็ต select + area ตรงๆ (จำลองพฤติกรรมเดิม)
const chB = mkRoof();
const selB = chB.querySelector('.o-roof2'); selB.value = 'imp15'; fire(selB, "change");
const areaB = chB.querySelector('.o-roof2area'); areaB.value = "4"; fire(areaB, "input"); fire(areaB, "change");
const sellB = w.readItem(chB).r.sell;

want("ราคา engine: ชิป path === direct path (calc ไม่เปลี่ยน)", sellA === sellB && sellA > 0, "ชิป=" + sellA + " direct=" + sellB);

let pass = 0; for (const c of C) { console.log((c.ok ? "✅" : "❌") + " " + c.n + "  [" + c.d + "]"); if (c.ok) pass++; }
console.log(`\n${pass}/${C.length} ผ่าน` + (jsErrors.length ? `  · jsErrors: ${jsErrors.length}` : ""));
if (jsErrors.length) console.log("JSERR:", jsErrors.slice(0, 3).join(" | "));
process.exit(pass === C.length ? 0 : 1);
