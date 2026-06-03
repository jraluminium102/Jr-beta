// Smoke test: โหลดเครื่องคิดราคา R3.9 ใน jsdom เช็คว่า JS โหลด + ฟังก์ชัน/ข้อมูลครบ
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");

const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: undefined,      // ไม่โหลด external (SheetJS CDN) — ไม่จำเป็นต่อ smoke
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});

// รอ DOMContentLoaded + inline scripts
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 1500); // fallback
});

const w = dom.window;
const checks = [];
const want = (name, ok) => checks.push({ name, ok: !!ok });

want("genQuote เป็นฟังก์ชัน", typeof w.genQuote === "function");
want("genQuoteQuick เป็นฟังก์ชัน", typeof w.genQuoteQuick === "function");
want("toggleSplit เป็นฟังก์ชัน", typeof w.toggleSplit === "function");
want("toggleGroupSplit เป็นฟังก์ชัน (แยกเฉพาะชุด)", typeof w.toggleGroupSplit === "function");
want("aiReviewQuote เป็นฟังก์ชัน (ปุ่ม AI)", typeof w.aiReviewQuote === "function");
want("sendToQuotation เป็นฟังก์ชัน (สะพาน)", typeof w.sendToQuotation === "function");
want("addSet เป็นฟังก์ชัน", typeof w.addSet === "function");
want("#items มีใน DOM", !!w.document.getElementById("items"));
want("#quoteContent มีใน DOM", !!w.document.getElementById("quoteContent"));
want("#aiReviewResult มีใน DOM", !!w.document.getElementById("aiReviewResult"));

const jsErrs = errors.filter((e) => !/sheetjs|xlsx|Could not load|external/i.test(e));
want("ไม่มี JS error ร้ายแรงตอนโหลด", jsErrs.length === 0);

let pass = 0;
console.log("=== SMOKE TEST เครื่องคิดราคา R3.9 ===");
for (const c of checks) { console.log((c.ok ? "✅" : "❌") + " " + c.name); if (c.ok) pass++; }
if (jsErrs.length) console.log("\nJS errors:\n" + jsErrs.join("\n"));
console.log(`\nผ่าน ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
