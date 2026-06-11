// FIX-13 verify: รวมรางน้ำเป็นชุดเดียวใต้ "ปลายหลังคา=รางน้ำ"
// - เลือกรางน้ำ → ยาว auto = กว้าง · คิดเงิน = เรต × ยาว
// - ใบมีบรรทัดรางน้ำเดียว (มีชนิด อลู/สแตนเลส) ไม่ซ้ำ
// - สลับกลับ "ปล่อย" → ยาว=0 ไม่คิดเงิน
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
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) throw new Error("no " + sel); e.value = String(v); e.dispatchEvent(new w.Event("input", { bubbles: true })); e.dispatchEvent(new w.Event("change", { bubbles: true })); return e; }

// หาแบบหลังคาตัวแรก (cat หลังคา) จาก dropdown
w.addItem();
const d = doc.querySelector("#items .ch");
sf(d, ".i-group", "3"); // 3 = หลังคา/ฝ้า-ผนัง
sf(d, ".i-prod", "roof_vinyl");
sf(d, ".i-w", "6.0");
sf(d, ".i-h", "3.0");
const qtyEl = d.querySelector(".i-qty"); if (qtyEl) sf(d, ".i-qty", "1");

want("เลือกแบบหลังคาได้", (w.readItem(d).p.cat) === "หลังคา", "cat=" + w.readItem(d).p.cat);

// ช่องรางน้ำในของเสริมถูกย้าย → o-rfgut อยู่ในกล่อง guttersys-wrap
const wrap = d.querySelector(".o-guttersys-wrap");
const rfgutInWrap = wrap && wrap.querySelector(".o-rfgut");
want("ชนิดราง (.o-rfgut) อยู่ในกล่องระบบรางน้ำ", !!rfgutInWrap);
want("มี .o-rfgut ตัวเดียวทั้งฟอร์ม", d.querySelectorAll(".o-rfgut").length === 1, "n=" + d.querySelectorAll(".o-rfgut").length);

const baseSell = w.readItem(d).r.sell;
want("baseline (ปล่อย) ราคา > 0", baseSell > 0, "sell=" + baseSell);

// --- เลือกปลายหลังคา = รางน้ำ → ยาว auto = กว้าง 6 ---
sf(d, ".o-roofend", "รางน้ำ");
const gl = d.querySelector(".o-rfgutlen");
want("ยาว auto = กว้าง (6)", parseFloat(gl.value) === 6, "len=" + gl.value);
want("กล่องระบบรางน้ำโผล่", wrap.style.display === "block");

const sellAlu = w.readItem(d).r.sell;
const deltaAlu = sellAlu - baseSell;
want("อลู S: +1,000×6 = 6,000", deltaAlu === 6000, "delta=" + deltaAlu);

// genQuote → ตรวจบรรทัดรางน้ำในใบ
w.genQuote();
const qc = doc.querySelector("#quoteContent").textContent;
const gutterCount = (qc.match(/รางน้ำ/g) || []).length;
want("ใบมีคำ 'รางน้ำ' (บรรทัดรวม)", qc.includes("รางน้ำอลูมิเนียม"), "");
want("ใบไม่มีบรรทัดรางน้ำซ้ำ (≤2 ครั้ง: หัวข้อ+บรรทัด)", gutterCount <= 2, "count=" + gutterCount);
want("ใบโชว์ชนิดท่อ", qc.includes("รางน้ำอลูมิเนียม (ท่อ"), "");

// --- เปลี่ยนชนิดเป็นสแตนเลส M (2000) ---
sf(d, ".o-rfgut", "2000");
const sellSS = w.readItem(d).r.sell;
want("สแตนเลส M: +2,000×6 = 12,000", (sellSS - baseSell) === 12000, "delta=" + (sellSS - baseSell));
w.genQuote();
want("ใบเปลี่ยนเป็น 'รางน้ำสแตนเลส'", doc.querySelector("#quoteContent").textContent.includes("รางน้ำสแตนเลส"), "");

// --- สลับกลับ ปล่อย → ยาว=0 ไม่คิดเงิน ---
sf(d, ".o-roofend", "ปล่อย");
want("สลับปล่อย → ยาว=0", parseFloat(gl.value) === 0, "len=" + gl.value);
want("ปล่อย → ราคากลับ baseline", w.readItem(d).r.sell === baseSell, "sell=" + w.readItem(d).r.sell);

const realErrors = errors.filter((e) => !/Not implemented:|scrollTo/.test(e)); // กรอง noise jsdom
want("ไม่มี JS error", realErrors.length === 0, realErrors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== FIX-13 รางน้ำชุดเดียว ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
