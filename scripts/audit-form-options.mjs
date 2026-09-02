/**
 * audit-form-options — ตรวจ "ทุกตัวเลือกที่เว็บให้กด" ตามกฎ 3 ข้อของเจ้าของ (2 ก.ย.69)
 *
 *   ① มีในไฟล์ตัดประกอบ · ไม่มีในไฟล์คิดราคา  → ดึงของจากใบตัดมาใส่คิดราคา
 *   ② ไม่มีในไฟล์ตัดประกอบ · มีในไฟล์คิดราคา  → ใช้ได้ ไม่ต้องไปกรอกอะไรในใบตัด
 *   ③ ไม่มีทั้งคู่                              → ไม่ต้องสะเออะให้เลือก (เอาตัวเลือกออก)
 *
 * ── รอบแรกตรวจไม่ครบ เจ้าของสั่งตรวจซ้ำ "ให้แน่ชัดว่าตรงตามเงื่อนไข ไม่นอกเหนือ" — อุดแล้ว 3 รู ──
 *   รูที่ 1  ตรวจแต่ dropdown "รูปแบบ" (forms) — ยังมี dropdown อื่นที่กดได้อีกเพียบ (specOpts)
 *            เช่น ธรณี · แป · สีอุปกรณ์ · ชนิดแผ่น · ราง — กฎ ③ ต้องคุมพวกนี้ด้วย
 *   รูที่ 2  ข้ามตัวที่ "เว็บใช้ค่าอยู่แล้ว" ไปเลย — ผิด เพราะถ้าเว็บคิดเงินจากตัวเลือกที่ไม่มีในไฟล์ไหนเลย
 *            = คิดเลขเอาเอง ยิ่งอันตรายกว่าปุ่มที่กดแล้วไม่มีอะไรเกิด → ต้องตรวจไฟล์ทุกตัวเลือก
 *   รูที่ 3  คำสั้น ๆ ("นอน" "ตั้ง" "มี") ชนคำอื่นในไฟล์ได้ ("แนวนอน" "ติดตั้ง" "มีธรณี")
 *            → แยกเป็นกลุ่ม "ต้องดูด้วยตา" ไม่เหมาโมเมว่าเจอ
 *
 * วิธีตรวจ (ไม่เดาจากความจำ — ค้นในไฟล์จริงเสมอ)
 *   ฝั่งใบตัด   = ทุกไฟล์ .xlsx ใน "ตัดประกอบ อัพเดท 30-7-2026"   (ค่าเซลล์ + ตัวสูตร)
 *   ฝั่งคิดราคา = "ถอดทุน_รวมทั้งหมด v20.xlsx" ทุกชีต (ค่าเซลล์ + ตัวสูตร) + pricebook.json
 *
 * รัน: node scripts/audit-form-options.mjs [--csv] [--all]
 */
import fs from "node:fs";
import path from "node:path";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import PRICEBOOK from "../src/lib/calculator40/pricebook.json" with { type: "json" };
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { openXlsx, readFormulas } from "./dumpxlsx.mjs";
import { writeXlsx, sheetName, S } from "./xlsxwrite.mjs";

const ROOT = path.resolve(process.cwd());
const CUT_DIR = path.join(ROOT, "ตัดประกอบ อัพเดท 30-7-2026");
// ฝั่ง "ไฟล์คิดราคา" มี 3 แหล่ง ไม่ใช่แค่ถอดทุน — ตกแหล่งไหนไปจะสรุปผิดว่า "คิดเอาเอง"
//   (เจอตอนตรวจซ้ำ: ฉนวน rockwool 3" ไม่มีในถอดทุน แต่อยู่ในชีต "ราคางานเสริม" ของราคาอัปเดตล่าสุด)
const COST_XLSX = [path.join(ROOT, "ถอดทุน_รวมทั้งหมด v20.xlsx"), path.join(ROOT, "ราคาอัพเดทล่าสุด.xlsx")];

const blobOf = (file) => {
  const x = openXlsx(file);
  const parts = [];
  for (const s of x.sheets) {
    parts.push(s.name);
    for (const r of x.read(s.path)) parts.push(Object.values(r.cells).join(" "));
    // ⚠ ต้องเก็บ "ตัวสูตร" ด้วย — ตัวเลือกหลายอันโผล่แค่ข้างใน IF(...) ไม่ได้เป็นค่าในเซลล์ไหนเลย
    //   (หลังคาเลื่อน "เลื่อนเปิดกลาง" อยู่ใน =IF(B3="เลื่อนเปิดกลาง",…) อย่างเดียว)
    for (const r of readFormulas(x.zip, s.path)) parts.push(Object.values(r.cells).join(" "));
  }
  return parts.join("\n");
};

process.stdout.write("อ่านไฟล์ใบตัด... ");
const CUT_BLOBS = fs.existsSync(CUT_DIR)
  ? fs.readdirSync(CUT_DIR).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
      .map((f) => ({ name: f, text: blobOf(path.join(CUT_DIR, f)) }))
  : [];
console.log(`${CUT_BLOBS.length} ไฟล์`);
process.stdout.write("อ่านไฟล์คิดราคา (ถอดทุน + pricebook)... ");
const COST_TEXT = COST_XLSX.filter((f) => fs.existsSync(f)).map(blobOf).join("\n") + "\n" + JSON.stringify(PRICEBOOK);
console.log("เสร็จ\n");

const squash = (s) => String(s).replace(/\s+/g, "");
const CUT_SQ = CUT_BLOBS.map((b) => ({ name: b.name, text: squash(b.text) }));
const COST_SQ = squash(COST_TEXT);

/** ป้ายบนเว็บกับคำในไฟล์เขียนคนละแบบ — ต้องแปลงก่อนค้น ไม่งั้นสรุปผิดว่า "ไม่มีในไฟล์"
 *  ตรวจของจริงมาแล้วทั้ง 2 เคส:
 *    เฟี้ยม "4บาน: รวบเปิดซ้าย (4-0)" → ใบตัดเขียนเป็นรหัสคอนฟิก "4L0R"
 *    กระทุ้ง "เปิดล่าง"              → ใบตัด FUJI เขียน "กระทุ้ง" (ชีต "บานเปิด" หัวข้อ ⑤ = เปิดข้าง/กระทุ้ง) */
function aliasesOf(word) {
  const out = [word];
  const m = /\((\d+)\s*-\s*(\d+)\)\s*$/.exec(String(word));
  if (m) {
    const [L, R] = [Number(m[1]), Number(m[2])];
    out.push(`${L}L${R}R`);
    // ใบตัดเฟี้ยมตั้งชื่อชีตเป็น 240_4Panel(4L) / (L) เวลารวบไปข้างเดียว (ไม่เขียน 4L0R)
    if (R === 0) out.push(`Panel(${L}L)`, `${L}Panel(L)`);
    if (L === 0) out.push(`Panel(${R}R)`, `${R}Panel(R)`);
  }
  if (/^เปิดล่าง$/.test(String(word).trim())) out.push("กระทุ้ง");
  return out;
}
const inCut = (w) => CUT_SQ.filter((b) => aliasesOf(w).some((a) => b.text.includes(squash(a)))).map((b) => b.name);
const inCost = (w) => aliasesOf(w).some((a) => COST_SQ.includes(squash(a)));

/** คำสั้น/ตัวเลขล้วน = เสี่ยงชนคำอื่นในไฟล์ → อย่าเชื่อผลค้นดื้อ ๆ */
const isAmbiguous = (w) => squash(w).length < 6 || /^[\d.\s+-]+$/.test(String(w));

/** สูตรของรุ่นนี้อ้างถึงตัวเลือกนั้นไหม (form หรือ spec.<key>) */
function srcOf(p) {
  return JSON.stringify([p.vars, p.alu, p.hardware, p.consum, p.glass, p.addons,
    p.areaExpr, p.sellRate, p.sellInstallRate, p.materials, p.sheetColors]);
}
/** เว็บ "ใช้" ตัวเลือกนี้จริงไหม — ต้องเช็ค 2 ทาง ทางเดียวไม่พอ
 *   ก) ค้นคำในตัวสูตรตรง ๆ (จับกรณีที่ค่าตั้งต้นบังเอิญทำให้ผลเท่ากัน เช่น หลังคาเลื่อน กว้าง=ยื่น=150)
 *   ข) ลองคิดราคาจริงทีละตัวเลือกแล้วเทียบผล (จับกรณีที่สูตรอ่านค่าผ่านทางอ้อม เช่น ตารางราคา/addons
 *      — ซิปสกรีน Z100/Z120 ไม่มีคำว่า form ในสูตร แต่เปลี่ยนแล้วราคาขยับจริง) */
const priceSig = (p, over) => {
  const d = p.defaults || { w: 150, h: 150, p: 1 };
  const spec = {};
  for (const so of p.specOpts || []) if (so.def !== undefined) spec[so.key] = Array.isArray(so.def) ? so.def[0] : so.def;
  try {
    const r = computeCost(PRICEBOOK, p, {
      w: d.w, h: d.h, p: d.p || 1, form: p.defForm, color: "white", colorKey: "white",
      ...over, spec: { ...spec, ...(over.spec || {}) },
    });
    return `${r.cost}|` + (r.lines || []).map((l) => `${l.name}:${l.qty}`).join(",");
  } catch { return "ERR"; }
};
const varies = (p, overs) => new Set(overs.map((o) => priceSig(p, o))).size > 1;

const usesForm = (p) => /\bform\b/.test(srcOf(p)) || varies(p, (p.forms || []).map((f) => ({ form: f })));
const usesSpec = (p, so) => new RegExp(`spec\\s*[.\\[]\\s*['"]?${so.key}\\b`).test(srcOf(p))
  || varies(p, so.opts.map((o) => ({ spec: { [so.key]: Array.isArray(o) ? o[0] : o } })));

// ── รวบรวม "ทุกตัวเลือกที่เว็บให้กด" ──
const items = [];
for (const p of Object.values(PRODUCTS)) {
  if (!p || !p.id) continue;
  for (const f of p.forms || [])
    items.push({ id: p.id, name: p.name, group: "รูปแบบ", key: "form", opt: f, used: usesForm(p) || !!p.sellDirect });
  for (const so of p.specOpts || []) {
    if (so.type === "number" || !Array.isArray(so.opts)) continue;   // ช่องกรอกตัวเลข ไม่ใช่ dropdown ให้เลือก
    for (const o of so.opts) {
      const label = Array.isArray(o) ? o[0] : o;                     // บางอันเป็น [value, label]
      items.push({ id: p.id, name: p.name, group: so.label || so.key, key: so.key, opt: String(label), used: usesSpec(p, so) || !!p.sellDirect });
    }
  }
}

// ── ตัดสินทีละตัวเลือก (ตรวจไฟล์ "ทุกตัว" ไม่ข้ามตัวที่เว็บใช้แล้ว) ──
for (const it of items) {
  it.cut = inCut(it.opt);
  it.cost = inCost(it.opt);
  it.amb = isAmbiguous(it.opt);
  const found = it.cut.length || it.cost;
  it.bucket = found && !it.amb ? "OK"
    : found && it.amb ? "EYE_SHORT"
    : it.used ? "EYE_USED"
    : "RULE3";
  it.rule = it.cut.length && !it.cost ? "①" : !it.cut.length && it.cost ? "②" : it.cut.length ? "①②" : "③";
}

// ── รายงาน ──
const N = (b) => items.filter((x) => x.bucket === b);
console.log(`ตรวจ ${new Set(items.map((i) => i.id)).size} รุ่น · ${items.length} ตัวเลือก`);
console.log(`  (dropdown รูปแบบ ${items.filter((i) => i.key === "form").length} · dropdown อื่น ${items.filter((i) => i.key !== "form").length})\n`);
console.log(`  ✅ เจอในไฟล์ ชัดเจน                      ${N("OK").length}`);
console.log(`  ⚠  เจอในไฟล์ แต่คำสั้น อาจชนคำอื่น       ${N("EYE_SHORT").length}   ← ต้องดูด้วยตา`);
console.log(`  🔶 ไม่เจอในไฟล์ แต่เว็บคิดเงินจากมัน     ${N("EYE_USED").length}   ← ต้องดูด้วยตา (ไฟล์อาจเขียนคนละคำ)`);
console.log(`  ❌ ไม่เจอในไฟล์ + เว็บไม่ได้ใช้ → กฎ ③   ${N("RULE3").length}`);

const show = (b, head) => {
  const list = N(b);
  if (!list.length) return;
  console.log(`\n═══ ${head} — ${list.length} ═══`);
  for (const r of list)
    console.log(`  ${r.id.padEnd(17)} ${String(r.group).padEnd(14)} ${r.opt.padEnd(26)} ${r.cut.length ? "ใบตัด " + r.cut.length + " ไฟล์" : ""}${r.cost ? " · คิดราคา ✓" : ""}`);
};
show("RULE3", "❌ กฎ ③ ไม่มีในไฟล์ไหนเลย + เว็บไม่ได้ใช้ → เอาตัวเลือกออก");
show("EYE_USED", "🔶 เว็บคิดเงินจากตัวเลือกนี้ แต่ค้นชื่อในไฟล์ไม่เจอ → เช็คว่าไฟล์เขียนคนละคำ หรือคิดเอาเอง");
if (process.argv.includes("--all")) show("EYE_SHORT", "⚠ คำสั้น อาจชนคำอื่นในไฟล์");

if (process.argv.includes("--csv") || process.argv.includes("--xlsx")) {
  const HEAD = ["รุ่น", "ชื่อรุ่น", "กลุ่มตัวเลือก", "ตัวเลือก", "อยู่ในใบตัด", "อยู่ในคิดราคา", "เว็บใช้", "กฎ", "ผลตรวจ"];
  const LABEL = { OK: "✅ เจอในไฟล์", EYE_SHORT: "⚠ คำสั้น ดูด้วยตา", EYE_USED: "🔶 ไม่เจอ แต่เว็บใช้", RULE3: "❌ กฎ ③ เอาออก" };
  const ORDER = { RULE3: 0, EYE_USED: 1, EYE_SHORT: 2, OK: 3 };
  const sorted = [...items].sort((a, b) => (ORDER[a.bucket] - ORDER[b.bucket]) || a.id.localeCompare(b.id));
  const line = (r) => [r.id, r.name, r.group, r.opt, r.cut.join(" · "), r.cost ? "มี" : "", r.used ? "ใช้" : "", r.rule, LABEL[r.bucket]];

  fs.writeFileSync("audit-form-options.tsv", "﻿" + [HEAD.join("\t"), ...sorted.map((r) => line(r).join("\t"))].join("\n"), "utf8");
  console.log("\nเขียน audit-form-options.tsv แล้ว");

  // เจ้าของเปิด csv ใน Excel ไม่ได้ (บอกไว้ 30 ส.ค.) → ออกเป็น .xlsx ระบายสีตามผลตรวจให้เลย
  const TONE = { RULE3: S.RED, EYE_USED: S.ORANGE, EYE_SHORT: S.YELLOW, OK: S.GREEN };
  const rows = [HEAD, ...sorted.map(line)];
  const rowStyles = [S.HEAD, ...sorted.map((r) => TONE[r.bucket])];
  writeXlsx("ตรวจตัวเลือกทุกบาน.xlsx", [{
    name: sheetName("ตัวเลือกทั้งหมด"), rows, rowStyles,
    widths: [16, 34, 26, 30, 40, 12, 8, 6, 20],
  }]);
  console.log("เขียน ตรวจตัวเลือกทุกบาน.xlsx แล้ว (แดง=ต้องเอาออก · ส้ม=ดูด้วยตา · เหลือง=คำสั้น · เขียว=ผ่าน)");
}
