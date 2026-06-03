// ทดสอบบั๊กกั้นห้องกระจก: product glasshouse มี area=0 แต่ sell=ghprice
// ก่อนแก้: filter it.r.a>0 ตัดทิ้ง → ใบไม่ออก  ·  หลังแก้: ต้องขึ้นในใบ + ยอดถูก
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
const setField = (root, sel, value) => { const el = root.querySelector(sel); if (!el) throw new Error("ไม่พบ " + sel); el.value = String(value); el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); return el; };
const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

// สร้าง 1 รายการ กั้นห้องกระจก (group 6)
doc.getElementById("items").innerHTML = "";
w.addItem(doc.getElementById("items"));
const ch = doc.querySelector("#items .ch");

setField(ch, ".i-group", "6");          // กั้นห้องกระจก → rebuild prod options
setField(ch, ".i-prod", "glasshouse");  // เลือก product glasshouse → build gh UI
// ตอนนี้ควรมีฟิลด์ .o-ghprice / .o-ghroom
const PRICE = 506000;
const priceEl = ch.querySelector(".o-ghprice");
want("มีช่องราคารวมกั้นห้องกระจก (.o-ghprice)", !!priceEl);
if (priceEl) setField(ch, ".o-ghprice", PRICE);
const roomEl = ch.querySelector(".o-ghroom");
if (roomEl) setField(ch, ".o-ghroom", "ห้องอเนกประสงค์");
const sideA = ch.querySelector(".o-ghside-A");
if (sideA) setField(ch, ".o-ghside-A", "ประตูบานเปิดคู่ + ติดตายข้าง");

// ปิดค่าบริการ
["svc-protect","svc-lift","svc-travel","svc-ship"].forEach((id)=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false; e.dispatchEvent(new w.Event("change",{bubbles:true}));} });

w.calcQuote();
w.genQuote();

const qc = doc.getElementById("quoteContent");
const t = txt(qc);

want("G1 ใบเสนอ 'ออก' (ไม่ถูกกรองทิ้ง)", t.length > 50, "ยาว " + t.length);
want("G2 มีคำว่า 'กั้นห้องกระจก' ในใบ", t.includes("กั้นห้องกระจก"), t.slice(0, 120));
want("G3 ราคา 506,000 ปรากฏในใบ", t.includes("506,000"), "หาไม่เจอ 506,000");
const gEl = doc.querySelector("#quoteContent .qtot .g");
const grand = gEl ? parseInt((gEl.textContent || "").replace(/[^\d]/g, ""), 10) : NaN;
want("G4 รวมทั้งสิ้น >= 506,000 (รวม VAT)", grand >= 506000, "grand=" + grand);

const jsErrs = errors.filter((e) => !/sheetjs|xlsx|external|Could not load|scrollTo|Not implemented/i.test(e));
want("G5 ไม่มี JS error", jsErrs.length === 0, jsErrs.join("; "));

let pass = 0;
console.log("=== TEST กั้นห้องกระจก (glasshouse) ===");
for (const c of checks) { console.log((c.ok ? "✅" : "❌") + " " + c.name + (c.ok ? "" : "  → " + c.detail)); if (c.ok) pass++; }
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
