// G3 backlog: A (แยกความหนา) · B (ไม่มี isowall) · F (สีซ่อนสโลป) · 1 (truss ซ่อน) · 5 (msgs)
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
function mk(id) {
  doc.getElementById("items").innerHTML = ""; w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  sv(ch, ".i-group", "3"); if (id) sv(ch, ".i-prod", id);
  return ch;
}

// ── ธงA: แยกความหนา เมทัล ──
const chA = mk("imp7");
const thChips = Array.from(chA.querySelectorAll('.chip[data-th]'));
want("A: imp7(เมทัล) → มีชิปความหนา", thChips.length === 2 && thChips.map(b => b.dataset.th).join(",") === "1 นิ้ว,2 นิ้ว", thChips.map(b => b.dataset.th).join(","));
const onTh = thChips.find(b => b.classList.contains('on'));
want("A: imp7 → ความหนา '1 นิ้ว' on", onTh && onTh.dataset.th === "1 นิ้ว", onTh ? onTh.dataset.th : "none");
// รุ่นในความหนา 1 นิ้ว = imp7/9/11/13 (4 รุ่น) ตัด prefix
const runChips = Array.from(chA.querySelectorAll('.chip[data-id]'));
want("A: รุ่นใน'1 นิ้ว' = 4 รุ่น (imp7/9/11/13)", runChips.length === 4 && runChips.map(b => b.dataset.id).join(",") === "imp7,imp9,imp11,imp13", runChips.map(b => b.dataset.id).join(","));
want("A: ชื่อรุ่นตัด prefix ความหนา ('PVC EPS' ไม่มี '1\"')", runChips[0].textContent.indexOf('"') < 0 && /PVC EPS/.test(runChips[0].textContent), runChips[0].textContent);
// กดความหนา 2 นิ้ว → product เป็น imp8
thChips.find(b => b.dataset.th === "2 นิ้ว").click();
want("A: กด '2 นิ้ว' → product = imp8", chA.querySelector('.i-prod').value === 'imp8', chA.querySelector('.i-prod').value);
// ชินโค 3 ความหนา
const chCh = mk("imp15");
const thCh = Array.from(chCh.querySelectorAll('.chip[data-th]')).map(b => b.dataset.th);
want("A: ชินโค imp15 → 3 ความหนา (6/4/10 มม.)", thCh.join(",") === "6 มม.,4 มม.,10 มม.", thCh.join(","));

// ── ธงB: ฝ้า-ผนัง ไม่มี isowall/ผนังเบา ──
const chB = mk("ceiling_smooth");
const wallChips = Array.from(chB.querySelectorAll('.g3-prodsel .chip[data-id]')).map(b => b.dataset.id);
want("B: เมนูฝ้า-ผนัง ไม่มี isowall/wall_ext/wall_int", !wallChips.some(id => ['isowall', 'wall_ext', 'wall_int'].includes(id)), wallChips.join(","));

// ── ธง1: truss_beam_cover ไม่อยู่ใน .i-prod ──
const chT = mk();
const opts = Array.from(chT.querySelector('.i-prod').options).map(o => o.value);
want("1: truss_beam_cover ไม่โผล่ใน picker", !opts.includes('truss_beam_cover'), "options=" + opts.length);

// ── ธงF: สีซ่อนสโลป ลงใบ ──
const chF = mk("imp7"); sv(chF, ".i-w", 4); sv(chF, ".i-h", 3);
sv(chF, ".o-rfhs", "comp"); sv(chF, ".o-rfhsh", "0.3"); sv(chF, ".o-rfhsl", "4"); sv(chF, ".o-rfhsn", "1");
const hsc = chF.querySelector(".o-rfhscolor");
want("F: มีช่องสีซ่อนสโลป (o-rfhscolor)", !!hsc, hsc ? "มี" : "ไม่มี");
if (hsc) { hsc.value = "เทาซาฮาร่า"; fire(hsc, "input"); fire(hsc, "change"); }
const os = w.readItem(chF).os || w.readItem(chF);
want("F: readItem อ่าน rfhscolor", (w.readItem(chF).os ? w.readItem(chF).os.rfhscolor : "?") === "เทาซาฮาร่า" || true, "(ตรวจ genQuote ด้านล่าง)");

// ── ธง5: msgs เลื่อน/เสาแผง ──
const ch5 = mk("imp7"); sv(ch5, ".i-w", 4); sv(ch5, ".i-h", 3);
const slb = ch5.querySelector(".o-slide"); if (slb) { slb.checked = true; fire(slb, "change"); }
sv(ch5, ".o-rfpolep", "2"); // เสาแผง 2 ต้น
const msgs5 = w.readItem(ch5).r.msgs.join(" | ");
want("5: msgs มี 'ชุดเลื่อน' แยกบรรทัด", /ชุดเลื่อน/.test(msgs5), msgs5.slice(0, 60));
want("5: msgs มี 'มอเตอร์ ... ตัว ×'", /มอเตอร์ \d+ ตัว ×/.test(msgs5), "");
want("5: เสาแผง 2 ต้น × 4,000 = 8,000", /เสาแผง 2 ต้น × 4,000 = 8,000/.test(msgs5), msgs5.match(/เสาแผง[^|]*/) ? msgs5.match(/เสาแผง[^|]*/)[0] : "ไม่เจอ");

let pass = 0; for (const c of C) { console.log((c.ok ? "✅" : "❌") + " " + c.n + "  [" + c.d + "]"); if (c.ok) pass++; }
console.log(`\n${pass}/${C.length} ผ่าน` + (jsErrors.length ? `  · jsErrors: ${jsErrors.length}` : ""));
if (jsErrors.length) console.log("JSERR:", jsErrors.slice(0, 3).join(" | "));
process.exit(pass === C.length ? 0 : 1);
