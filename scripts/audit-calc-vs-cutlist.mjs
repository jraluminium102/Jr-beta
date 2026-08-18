/**
 * audit-calc-vs-cutlist — เทียบ "จำนวนเส้นอลู + จำนวนอุปกรณ์" ระหว่าง
 *   เครื่องคิดราคา 4.0 (src/lib/calculator40)  ↔  ใบตัด/BOQ (src/lib/cutlist)
 *
 * ทำไม: ใบตัดถอดมาจากไฟล์ Excel ตัดจริงและ QA เทียบแล้ว → ใช้เป็น "ของจริง"
 *   ถ้าเครื่องคิดราคานับเส้น/อุปกรณ์ไม่ตรงใบตัด = ตั้งราคาจากปริมาณที่ไม่ใช่ของจริง
 *
 * รัน: node --experimental-strip-types scripts/audit-calc-vs-cutlist.mjs
 *      (เติม --all เพื่อโชว์บรรทัดที่ตรงด้วย)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPECS } from "../src/lib/cutlist/products.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
const SHOW_ALL = process.argv.includes("--all");
const specById = Object.fromEntries((CUT_SPECS ?? []).map((s) => [s.id, s]));

/**
 * คู่ที่เทียบกันได้ — ต้องเป็น "งานเดียวกัน" จริง ๆ
 *   calc  = { id, in }  อินพุตเครื่องคิดราคา (ซม.)
 *   cut   = { id, in }  อินพุตใบตัด (ซม. เหมือนกัน) · sets = จำนวนชุด
 */
const PAIRS = [
  { label: "บานเลื่อน SMS 3 บาน อิสระ", calc: { id: "sms_slide", in: { w: 300, h: 220, p: 3, form: "อิสระ" } },
    cut: { id: "sms_slide_free", in: { W: 300, H: 220, N: 3 } } },
  { label: "บานเลื่อน SMS 2 บาน อิสระ", calc: { id: "sms_slide", in: { w: 200, h: 200, p: 2, form: "อิสระ" } },
    cut: { id: "sms_slide_free", in: { W: 200, H: 200, N: 2 } } },
  { label: "SlimLux 3 บาน", calc: { id: "slimlux", in: { w: 300, h: 240, p: 3, form: "อิสระ" } },
    cut: { id: "slimlux_slide", in: { W: 300, H: 240, N: 3 } } },
  { label: "บานติดตาย", calc: { id: "fixed", in: { w: 150, h: 200, p: 1, form: "กระจกล้วน" } },
    cut: { id: "fixed_panel", in: { W: 150, H: 200, N: 1 } } },
  { label: "Velora บานเปิด", calc: { id: "velora", in: { w: 220, h: 200, p: 1, form: "เดี่ยว" } },
    cut: { id: "velora_swing", in: { W: 220, H: 200, N: 1 } } },
  { label: "PC Door แบ่ง 2", calc: { id: "pcdoor", in: { w: 150, h: 200, p: 1, form: "แบ่ง 2" } },
    cut: { id: "pc_door", in: { W: 150, H: 200, N: 1 } } },
  { label: "บานโซลิด", calc: { id: "bansolid", in: { w: 150, h: 200, p: 1, form: "มีธรณี" } },
    cut: { id: "solid_door", in: { W: 150, H: 200, N: 1 } } },
  { label: "บานเลื่อนรางบน 2 บาน", calc: { id: "topslide", in: { w: 360, h: 240, p: 2, form: "เลื่อนซ้อน" } },
    cut: { id: "toprail_frame", in: { W: 360, H: 240, N: 2 } } },
  { label: "บานเฟี้ยมยก", calc: { id: "fold_lift", in: { w: 200, h: 120, p: 2, form: "" } },
    cut: { id: "euro_lift", in: { W: 200, H: 120, N: 2 } } },
  { label: "ประตูรั้วบานเลื่อน", calc: { id: "gate", in: { w: 350, h: 180, p: 1, form: "นอน" } },
    cut: { id: "gate_slide", in: { W: 350, H: 180, N: 1 } } },
];

const nz = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

/** เส้นต่อรหัสจาก "เครื่องคิดราคา" — รวมทุกบรรทัดที่ใช้รหัสเดียวกัน (คิดราคาปัดทีละบรรทัด) */
function calcBars(prod, input) {
  const r = computeCost(PB, prod, input);
  const byCode = new Map();
  const noCode = [];
  for (const l of (r.lines || []).filter((x) => x.cat === "alu")) {
    const it = (prod.alu || []).find((a) => l.name.startsWith(a.name));
    const code = it?.code ? String(it.code).toUpperCase() : "";
    if (!code) { noCode.push(`${l.name} (${l.qty} เส้น)`); continue; }
    byCode.set(code, (byCode.get(code) ?? 0) + Number(l.qty || 0));
  }
  const hw = new Map();
  for (const l of (r.lines || []).filter((x) => x.cat === "hardware" || x.cat === "consum")) {
    hw.set(l.name, (hw.get(l.name) ?? 0) + Number(l.qty || 0));
  }
  return { byCode, noCode, hw };
}

let issues = 0;
console.log("═".repeat(96));
console.log("เทียบ จำนวนเส้นอลู + จำนวนอุปกรณ์  :  เครื่องคิดราคา 4.0  ↔  ใบตัด/BOQ (ของจริง)");
console.log("═".repeat(96));

for (const pair of PAIRS) {
  const prod = PRODUCTS[pair.calc.id];
  const spec = specById[pair.cut.id];
  console.log(`\n▶ ${pair.label}   [คิดราคา: ${pair.calc.id} · ใบตัด: ${pair.cut.id}]`);
  if (!prod) { console.log("   ❌ ไม่พบรุ่นในเครื่องคิดราคา"); issues++; continue; }
  if (!spec) { console.log("   ❌ ไม่พบสเปกในใบตัด"); issues++; continue; }

  const c = calcBars(prod, pair.calc.in);
  const cut = computeCutList(spec, pair.cut.in, 1);
  const cutByCode = new Map(cut.barsByCode.map((b) => [String(b.code).toUpperCase(), b.bars]));

  // ── เส้นอลูต่อรหัส ──
  const codes = [...new Set([...c.byCode.keys(), ...cutByCode.keys()])].filter((x) => x && x !== "-").sort();
  const diff = codes.filter((k) => (c.byCode.get(k) ?? 0) !== (cutByCode.get(k) ?? 0));
  console.log(`   เส้นอลู: คิดราคา ${[...c.byCode.values()].reduce((a, b) => a + b, 0)} เส้น · ใบตัด ${cut.totalBars} เส้น`);
  if (c.noCode.length) {
    issues++;
    console.log(`   ⚠ คิดราคามีบรรทัดไม่มีรหัส เทียบไม่ได้: ${c.noCode.join(" · ")}`);
  }
  for (const k of codes) {
    const a = c.byCode.get(k) ?? 0, b = cutByCode.get(k) ?? 0;
    if (a === b && !SHOW_ALL) continue;
    if (a !== b) issues++;
    console.log(`      ${a === b ? "✅" : "❌"} ${pad(k, 10)} คิดราคา ${String(a).padStart(3)} เส้น | ใบตัด ${String(b).padStart(3)} เส้น` +
      (a !== b ? `   ← ต่าง ${a - b > 0 ? "+" : ""}${a - b}` : ""));
  }
  if (!diff.length && !c.noCode.length) console.log("      ✅ จำนวนเส้นตรงกันทุกรหัส");

  // ── อุปกรณ์ (เทียบด้วยชื่อ — คนละระบบตั้งชื่อ ตรงบ้างไม่ตรงบ้าง) ──
  const cutHw = new Map();
  for (const h of cut.hardware) cutHw.set(h.name, (cutHw.get(h.name) ?? 0) + Number(h.qty || 0));
  const both = [...cutHw.keys()].filter((n) => c.hw.has(n));
  const onlyCut = [...cutHw.keys()].filter((n) => !c.hw.has(n));
  const onlyCalc = [...c.hw.keys()].filter((n) => !cutHw.has(n));
  console.log(`   อุปกรณ์: คิดราคา ${c.hw.size} รายการ · ใบตัด ${cutHw.size} รายการ · ชื่อตรงกัน ${both.length}`);
  for (const n of both) {
    const a = nz(c.hw.get(n)), b = nz(cutHw.get(n));
    if (a === b && !SHOW_ALL) continue;
    if (a !== b) issues++;
    console.log(`      ${a === b ? "✅" : "❌"} ${pad(n, 34)} คิดราคา ${String(a).padStart(5)} | ใบตัด ${String(b).padStart(5)}`);
  }
  if (onlyCut.length) console.log(`      ⚠ มีในใบตัด แต่คิดราคาไม่มี: ${onlyCut.slice(0, 8).join(" · ")}${onlyCut.length > 8 ? ` …อีก ${onlyCut.length - 8}` : ""}`);
  if (onlyCalc.length) console.log(`      ⚠ มีในคิดราคา แต่ใบตัดไม่มี: ${onlyCalc.slice(0, 8).join(" · ")}${onlyCalc.length > 8 ? ` …อีก ${onlyCalc.length - 8}` : ""}`);
}

console.log("\n" + "═".repeat(96));
console.log(`สรุป: จุดที่ไม่ตรง/เทียบไม่ได้ ${issues} จุด  (รันด้วย --all เพื่อดูบรรทัดที่ตรงด้วย)`);
