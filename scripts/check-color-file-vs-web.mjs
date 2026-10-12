#!/usr/bin/env node
/**
 * check-color-file-vs-web — ไฟล์ เทียบค่าอบสี.xlsx (ข้อมูลเก่า) ตรงกับเว็บตอนนี้ไหม
 *   node --experimental-strip-types scripts/check-color-file-vs-web.mjs [--stock stock-live.json] [--json out.json]
 *
 * เจ้าของถาม 12 ต.ค.69 "ได้ตรวจมั่งไหมว่า เทียบค่าอบสี.xlsx อันเก่าอันใหม่ตรงกันไหม พวกน้ำหนัก ข้อมูล"
 * เทียบ 4 เรื่องต่อรุ่น:
 *   ① น้ำหนักอลู (คอลัมน์ D) — ไฟล์นิยาม = "น้ำหนักที่สูตรคิดค่าอบสีใช้จริง" (บาน: ถอดจาก (ทุนลายไม้อบพิเศษ − ทุนอบพิเศษ) ÷ 17)
 *        ↔ เว็บ = กก. ที่เข้ากองค่าอบตอนสีลายไม้อบพิเศษ (aluKg) · และน้ำหนักบานที่ตัดใช้จริง
 *   ② อลูที่ใช้ (คอลัมน์ E) — รหัส/ไซส์กล่องที่ไฟล์เขียน ↔ รหัสที่สูตรเว็บเรียกจริง
 *   ③ ทุนสีที่เพิ่ม (คอลัมน์ I) — ไฟล์ R4.0 เดิม ↔ เว็บ
 *   ④ ค่าสีที่บวก (J) + ราคาขายรวม (M) — ไฟล์ R4.0 เดิม ↔ เว็บ
 */
import fs from "node:fs";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { resolveAluColor } from "../src/lib/calculator40/alu-colors.ts";
import { stockColorOfCalc, buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";
import { IDOF, KEYOF, baseInput } from "./color-compare-config.mjs";

const SRC = process.argv.find((a) => a.endsWith(".xlsx")) || "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PB0 = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let PB = PB0;
if (arg("--stock")) {
  const raw = JSON.parse(fs.readFileSync(arg("--stock"), "utf8"));
  PB = applyPriceOverride(JSON.parse(JSON.stringify(PB0)), buildPriceOverride(raw.rows ?? raw, PB0));
}
const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) {
    cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), kgFile: num(cell(r, "D")), spec: cell(r, "E"), base40: num(cell(r, "M")), rows: [] };
    items.push(cur); continue;
  }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ type: f, color: cell(r, "G"), costTxt: cell(r, "I"), cost40: num(cell(r, "I")), add40: num(cell(r, "J")), total40: num(cell(r, "M")) });
}
const webOpt = (key) => {
  const rc = resolveAluColor(key);
  return { color: rc.bake, colorName: rc.label, stockColor: stockColorOfCalc(key), colorKey: key,
    profitPct: 100, profitMat: 100, profitProd: 100, profitInst: 200, profitManual: false };
};
// รหัสในข้อความไฟล์ → คีย์เทียบ (ตัดตัวห้อย B/C · กล่องเทียบด้วยไซส์)
const normBox = (s) => String(s).replace(/[″”"]/g, "").replace(/×/g, "x").replace(/\s+/g, "").toLowerCase();
function codesInText(t) {
  const out = new Set();
  for (const m of String(t).matchAll(/\b([BF]?\d{4,5})[A-Za-z]?\b|\b(E-\d+[a-zA-Z]?)\b|\b(OPK-A\d+|XSW\d+)\b/g)) {
    const c = (m[1] || m[2] || m[3]).toUpperCase();
    out.add(/^\d{4}$/.test(c) && c.startsWith("7") ? "F" + c : c.replace(/^(E-\d+)[A-Z]$/i, "$1"));
  }
  for (const m of String(t).matchAll(/(\d+(?:\.\d+)?)\s*["″”]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*["″”]?/g)) out.add("BOX:" + m[1] + "x" + m[2]);
  return out;
}
function codesInWeb(c) {
  const out = new Set();
  for (const l of c.lines || []) {
    if (l.cat !== "alu" && !/กล่อง|ใบระแนง|เพลา|จันทัน|แป|ฉาก|แซด|เฟรม/.test(l.name || "")) continue;
    for (const s of [l.code, l.name]) for (const k of codesInText(s || "")) out.add(k);
  }
  return out;
}
const out = [];
for (const it of items) {
  const id = IDOF[it.name], p = id && PRODUCTS[id];
  if (!p) continue;
  const base = baseInput(id, p, it.size, it.panels);
  const run = (k) => computeCost(PB, p, { ...base, ...webOpt(k) });
  const wh = run("white"), sp = run("special"), ws = run("wood_special");
  const fileCodes = codesInText(it.spec), webCodes = codesInWeb(wh);
  const onlyFile = [...fileCodes].filter((c) => !webCodes.has(c));
  const onlyWeb = [...webCodes].filter((c) => !fileCodes.has(c));
  const r = { name: it.name, id, kgFile: it.kgFile,
    kgBakeWS: Math.round((ws.aluKg || 0) * 10) / 10, kgBakeSP: Math.round((sp.aluKg || 0) * 10) / 10,
    kgFromCost: Math.round(((ws.cost.total - sp.cost.total) / 17) * 10) / 10,
    kgUsed: Math.round((wh.weight?.alu || 0) * 10) / 10,
    onlyFile, onlyWeb, base40: it.base40, baseWeb: wh.sell?.withInstall, colors: [] };
  for (const cr of it.rows) {
    const k = KEYOF(cr.color);
    if (!k || cr.color === "—" || /ไม่มีสีนี้ขาย/.test(cr.costTxt)) continue;
    const c = run(k);
    r.colors.push({ color: cr.color, cost40: cr.cost40, costWeb: Math.round(c.cost.total - wh.cost.total),
      add40: cr.add40, addWeb: (c.sell?.withInstall || 0) - (wh.sell?.withInstall || 0), total40: cr.total40, totalWeb: c.sell?.withInstall || 0 });
  }
  out.push(r);
}
if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify(out));
const pc = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : "—");
for (const r of out) {
  console.log(`\n■ ${r.name} (${r.id}) · กก.ไฟล์ ${r.kgFile} · เว็บอบ(ลายไม้พิเศษ) ${r.kgBakeWS} · เว็บอบ(สีพิเศษ) ${r.kgBakeSP} · เว็บถอดแบบไฟล์ ${r.kgFromCost} · น้ำหนักบานใช้จริง ${r.kgUsed}`);
  if (r.onlyFile.length || r.onlyWeb.length) console.log(`   รหัส: มีแต่ในไฟล์ [${r.onlyFile.join(", ")}] · มีแต่ในเว็บ [${r.onlyWeb.join(", ")}]`);
  console.log(`   ฐานขาว ขาย: ไฟล์ ${r.base40} · เว็บ ${r.baseWeb} (${pc(r.baseWeb, r.base40)}%)`);
  for (const c of r.colors) console.log(`   ${c.color.padEnd(16)} ทุนสี ไฟล์ ${c.cost40} เว็บ ${c.costWeb} (${pc(c.costWeb, c.cost40)}%) · ค่าสีขาย ไฟล์ ${c.add40} เว็บ ${c.addWeb} · ขายรวม ไฟล์ ${c.total40} เว็บ ${c.totalWeb} (${pc(c.totalWeb, c.total40)}%)`);
}
