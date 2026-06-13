// SPEC-G3-roof-formux verify — FIX A (กล่องหลังคา) · B (OPTION กรอง) · C (slide ชนิด/ติดตาย/พื้นที่) · D (label ยาว/ยื่น, ซ่อน i-type)
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
function addRoof(prod) {
  w.addItem();
  const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1];
  sf(d, ".i-group", "3"); sf(d, ".i-prod", prod || "roof_vinyl"); sf(d, ".i-w", "6.0"); sf(d, ".i-h", "3.0");
  if (d.querySelector(".i-qty")) sf(d, ".i-qty", "1");
  return d;
}
function boxNames(d) { return [].map.call(d.querySelectorAll(".i-opts .gh-opt-cat-det > summary"), (s) => s.textContent.replace(/\s*\(\d+\)\s*$/, "")); }

// ===== FIX A: roof boxes =====
const d = addRoof("roof_vinyl");
const names = boxNames(d);
want("FIX A: กล่องวัสดุมุงอยู่บนสุด", /วัสดุมุง/.test(names[0]), names[0]);
want("FIX A: หลังคาเลื่อน อยู่ก่อนรางน้ำ", names.findIndex((x) => /หลังคาเลื่อน/.test(x)) < names.findIndex((x) => /รางน้ำ/.test(x)) && names.some((x) => /หลังคาเลื่อน/.test(x)), names.join(" | "));
want("FIX A: มีกล่อง ของเสริมหลังคา", names.some((x) => /ของเสริมหลังคา/.test(x)));
want("FIX A: catch-all = งานพิเศษ/รื้อของเดิม (ไม่มีครอบวงกบ) [G3-round2 B⑥]", names.some((x) => /งานพิเศษ|รื้อ/.test(x)) && !names.some((x) => /ครอบวงกบ/.test(x)), names.join(" | "));
want("FIX A④: ไม่มี details.optbox ซ้อน", d.querySelectorAll(".i-opts details.optbox").length === 0);

// non-roof ยังใช้ CATS เดิม
w.addItem();
const chs = doc.querySelectorAll("#items .ch"); const ds = chs[chs.length - 1];
sf(ds, ".i-group", "1"); sf(ds, ".i-prod", "sliding_euro"); sf(ds, ".i-w", "2"); sf(ds, ".i-h", "2");
// G1G6-D (2026-06-13): non-roof จัดใหม่ 7 หมวด — บานเลื่อนใช้ชุด 7 หมวด (มี ธรณี) ไม่ใช่ชุดหลังคา
want("FIX A: บานเลื่อน ใช้กล่อง 7 หมวด (ธรณี — ไม่ใช่ชุดหลังคา)", boxNames(ds).some((x) => /ธรณี/.test(x)) && !boxNames(ds).some((x) => /วัสดุมุง/.test(x)), boxNames(ds).join(" | "));

// ===== FIX D: label ยาว/ยื่น + ซ่อน i-type =====
const wlab = d.querySelector(".i-w").previousElementSibling.textContent;
const hlab = d.querySelector(".i-h").previousElementSibling.textContent;
want("FIX D①: หลังคา label ยาว/ยื่น", /ยาว/.test(wlab) && /ยื่น/.test(hlab), wlab + " / " + hlab);
want("FIX D①: บานเลื่อน label กว้าง/สูง (ไม่เปลี่ยน)", /กว้าง/.test(ds.querySelector(".i-w").previousElementSibling.textContent));
const itypeWrap = d.querySelector(".i-type") && d.querySelector(".i-type").closest(".full");
want("FIX D②: หลังคา ซ่อน .i-type", itypeWrap && itypeWrap.style.display === "none");

// ===== FIX B: OPTION cascade กรองหมวด =====
w.ocAddRow(d.querySelector(".oc-add"));
const ocRow = d.querySelector(".oc-row .oc-cat");
const ocVals = [].map.call(ocRow.options, (o) => o.value).filter(Boolean);
want("FIX B: หลังคา OPTION ไม่มี กระจก/มุ้ง/มือจับ", !ocVals.includes("glass") && !ocVals.includes("mosq") && !ocVals.includes("handle"), ocVals.join(","));
want("FIX B: หลังคา OPTION มี สี/หลังคา/อื่นๆ", ocVals.includes("color") && ocVals.includes("roof") && ocVals.includes("other"), ocVals.join(","));
w.ocAddRow(ds.querySelector(".oc-add"));
const ocVals2 = [].map.call(ds.querySelector(".oc-row .oc-cat").options, (o) => o.value).filter(Boolean);
want("FIX B: บานเลื่อน OPTION ยังมี กระจก/มุ้ง/มือจับ", ocVals2.includes("glass") && ocVals2.includes("mosq") && ocVals2.includes("handle"), ocVals2.join(","));

// ===== FIX C: slide ชนิด/ติดตาย/พื้นที่ =====
const slChk = d.querySelector(".o-slide"); slChk.checked = true; slChk.dispatchEvent(new w.Event("change", { bubbles: true }));
want("FIX C: เปิดเลื่อน → มีชิปชนิดเลื่อน", d.querySelectorAll('.chip[onclick*="o-slidetype"]').length === 2);
want("FIX C: มีช่องพื้นที่เลื่อน ยาว×ยื่น", !!d.querySelector(".o-sareaw") && !!d.querySelector(".o-sareah"));
want("FIX C: มีช่องบานติดตาย", !!d.querySelector(".o-sfixed"));
const sellSlide0 = w.readItem(d).r.sell;
// เปลี่ยนชนิดเลื่อน → ราคาไม่เปลี่ยน (label only)
d.querySelector('.chip[onclick*="o-slidetype"][data-val="เลื่อนข้าง"]').click();
want("FIX C①: เปลี่ยนชนิดเลื่อน ราคาไม่เปลี่ยน", w.readItem(d).r.sell === sellSlide0, "0=" + sellSlide0 + " ข้าง=" + w.readItem(d).r.sell);
want("FIX C①: readItem slidetype=เลื่อนข้าง", w.readItem(d).optSel.slidetype === "เลื่อนข้าง");
// บานติดตาย → ราคาไม่เปลี่ยน (label only)
sf(d, ".o-sfixed", "2");
want("FIX C③: บานติดตาย ราคาไม่เปลี่ยน (label)", w.readItem(d).r.sell === sellSlide0, "sell=" + w.readItem(d).r.sell);
want("FIX C③: readItem sfixed=2", String(w.readItem(d).optSel.sfixed) === "2");
// พื้นที่เลื่อน ยาว×ยื่น → sarea = คูณ
sf(d, ".o-sareaw", "3"); sf(d, ".o-sareah", "4");
want("FIX C②: sarea = ยาว×ยื่น = 12", w.readItem(d).optSel.sarea === 12, "sarea=" + w.readItem(d).optSel.sarea);
// genQuote ลงใบ
w.genQuote();
const qc = doc.querySelector("#quoteContent").textContent;
want("FIX C: ใบมี 'ระบบหลังคาเลื่อนแบบเลื่อนข้าง'", qc.includes("ระบบหลังคาเลื่อนแบบเลื่อนข้าง"), "");
want("FIX C: ใบมี 'บานติดตาย'", qc.includes("บานติดตาย"));

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== SPEC-G3-roof-formux (FIX A/B/C/D) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
