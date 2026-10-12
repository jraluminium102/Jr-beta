#!/usr/bin/env node
/**
 * gen-color-r39-compare-xlsx — เทียบราคาแต่ละบาน ทุกสี "R4.0เว็บ ↔ R3.9" ตามไฟล์ เทียบค่าอบสี.xlsx ของเจ้าของ
 *   node --experimental-strip-types scripts/gen-color-r39-compare-xlsx.mjs [ไฟล์.xlsx] [--stock stock-live.json]
 *   ออก: docs/เทียบค่าสี-R4.0เว็บ-vs-R3.9.xlsx
 *
 * เจ้าของสั่ง 12 ต.ค.69: "เทียบราคาทุนค่าของแต่ละบาน ทุกสีตามไฟล์ เทียบกับ R3.9 ในไฟล์
 *   ย้ำว่าเอาแค่ R3.9 ในไฟล์ … ใส่ราคาใหม่เข้าไปใน R4.0 เรียกว่า R4.0เว็บ"
 *   → R3.9 = เลขในไฟล์ล้วน (คอลัมน์ K ค่าสี · N ขายรวม) · ไม่ใช้คอลัมน์ R4.0 เดิมของไฟล์
 *   → R4.0เว็บ = เอนจินตอนนี้ + ราคาทับจากสโตร์จริง (--stock = แถว stock_items ที่ดึงจากเว็บ)
 *     ส่งค่าสีเข้าเอนจินแบบเดียวกับหน้าคิดราคา (resolveAluColor + stockColorOfCalc + กำไรตามไฟล์)
 */
import fs from "node:fs";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { resolveAluColor } from "../src/lib/calculator40/alu-colors.ts";
import { stockColorOfCalc, buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";
import { writeXlsx, S } from "./xlsxwrite.mjs";
import { IDOF, KEYOF, baseInput } from "./color-compare-config.mjs";

const SRC = process.argv.find((a, i) => a.endsWith(".xlsx") && process.argv[i - 1] !== "--out") || "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
const si = process.argv.indexOf("--stock");
const STOCK = si > 0 ? process.argv[si + 1] : null;
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "docs/เทียบค่าสี-R4.0เว็บ-vs-R3.9.xlsx";

const PB0 = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let PB = PB0, stockNote = "ไม่ได้ทับราคาสโตร์ (pricebook ล้วน)";
if (STOCK) {
  const raw = JSON.parse(fs.readFileSync(STOCK, "utf8"));
  const rows = (raw.rows ?? raw).map((r) => Array.isArray(r)
    ? { name: r[0], sku: r[1], color: r[2], supplier: r[3], is_weight_based: !!r[4], unit_cost: r[5], price_per_kg: r[6] } : r);
  PB = applyPriceOverride(JSON.parse(JSON.stringify(PB0)), buildPriceOverride(rows, PB0));
  stockNote = `ทับราคาจากสโตร์จริง ${rows.length} แถว (ดึงจากเว็บ ${new Date().toLocaleDateString("th-TH")})`;
}


// ── อ่านไฟล์เจ้าของ ──
const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) {
    cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), kgFile: num(cell(r, "D")),
      spec: cell(r, "E").replace(/\r?\n/g, " · "), base39: num(cell(r, "N")), rows: [] };
    items.push(cur); continue;
  }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ type: f, color: cell(r, "G"), rateTxt: cell(r, "H"), costTxt: cell(r, "I"),
    add39: num(cell(r, "K")), total39: num(cell(r, "N")) });
}

// ── คิดแบบหน้าเว็บ ──
const webOpt = (key) => {
  const rc = resolveAluColor(key);
  return { color: rc.bake, colorName: rc.label, stockColor: stockColorOfCalc(key), colorKey: key,
    profitPct: 100, profitMat: 100, profitProd: 100, profitInst: 200, profitManual: false };
};
const r0 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : "");
const pct = (a, b) => (typeof a === "number" && typeof b === "number" && Math.abs(b) > 0.5 ? Math.round(((a - b) / b) * 1000) / 10 : "");
const pctTxt = (p) => (p === "" ? "—" : (p > 0 ? "+" : "") + p + "%");

const HEAD1 = ["", "", "", "", "", "", "", "", "ทุน (เราจ่าย)", "", "ค่าสีที่บวกในราคาขาย", "", "", "ราคาขายรวม (ผลิต+ติดตั้ง)", "", "", ""];
const HEAD2 = ["สินค้า", "ขนาด (ซม.)", "บาน", "น้ำหนักอลู กก. (เว็บ)", "อลูที่ใช้ · ความหนา (ไฟล์)", "ประเภทสี", "สี", "เรต บาท/กก.",
  "ทุนทั้งบาน R4.0เว็บ", "ทุนสีที่เพิ่ม R4.0เว็บ",
  "R4.0เว็บ", "R3.9", "ต่าง %",
  "R4.0เว็บ", "R3.9", "ต่าง %", "หมายเหตุ"];
const body = [], sty = [];
const style = (p) => (p === "" ? S.GREY : p > 2 ? S.RED : p < -2 ? S.GREEN : S.NORMAL);
let nUp = 0, nDn = 0, nEq = 0;
const json = [];

for (const it of items) {
  const id = IDOF[it.name], p = id && PRODUCTS[id];
  if (!p) { body.push([it.name, it.size, it.panels, "", it.spec, "", "", "", "", "", "", "", "", "", "", "", "ยังไม่ได้แมปรุ่นนี้"]); sty.push(S.GREY); continue; }
  const pn = Number(it.panels) || 1;
  const base = baseInput(id, p, it.size, it.panels);
  const wh = computeCost(PB, p, { ...base, ...webOpt("white") });
  const sellW = wh.sell?.withInstall || 0;
  const pB = pct(sellW, it.base39);
  body.push([it.name, it.size, pn, Math.round((wh.weight?.alu || 0) * 10) / 10, it.spec, "มาตรฐาน", "อบขาว / ดำ", "—",
    r0(wh.cost.total), "ฐาน", "ฐาน", "ฐาน", "—", r0(sellW), r0(it.base39), pctTxt(pB), ""]);
  sty.push(S.BLUE);
  json.push({ name: it.name, color: "อบขาว/ดำ", cost: r0(wh.cost.total), sell: r0(sellW), sell39: it.base39, pTot: pB });
  for (const cr of it.rows) {
    const key = KEYOF(cr.color);
    if (!key || /ไม่มีสีนี้ขาย/.test(cr.costTxt) || cr.color === "—") {
      body.push(["", "", "", "", "", cr.type, cr.color || "—", cr.rateTxt, "", "", "—", "—", "—", "—", "—", "—", "ไฟล์ระบุว่ารุ่นนี้ไม่มีสีนี้ขาย"]);
      sty.push(S.GREY); continue;
    }
    const c = computeCost(PB, p, { ...base, ...webOpt(key) });
    const sell = c.sell?.withInstall || 0;
    const add = sell - sellW;
    const pAdd = pct(add, cr.add39), pTot = pct(sell, cr.total39);
    const notes = [];
    const swapped = !p.euroColors && (key === "wood_maho" || key === "wood_whiteoak");
    if (swapped) notes.push("เว็บรุ่นนี้ไม่มีสีสต็อกนี้ → คิดเป็นลายไม้อบพิเศษ");
    if ((c.cost?.openOven || 0) > 0) notes.push("รวมค่าเปิดตู้อบ " + r0(c.cost.openOven));
    const rc = resolveAluColor(swapped ? "wood_special" : key);
    const rate = rc.bake === "woodStock" ? "ซื้อเส้นสำเร็จ" : (PB.BAKE?.[rc.bake] ?? "");
    if (pTot !== "") { if (pTot > 2) nUp++; else if (pTot < -2) nDn++; else nEq++; }
    body.push(["", "", "", "", "", cr.type, cr.color, rate,
      r0(c.cost.total), r0(c.cost.total - wh.cost.total),
      r0(add), r0(cr.add39), pctTxt(pAdd),
      r0(sell), r0(cr.total39), pctTxt(pTot), notes.join(" · ")]);
    sty.push(style(pTot));
    json.push({ name: it.name, color: cr.color, type: cr.type, cost: r0(c.cost.total), costAdd: r0(c.cost.total - wh.cost.total),
      add: r0(add), add39: cr.add39, pAdd, sell: r0(sell), sell39: cr.total39, pTot, notes: notes.join(" · ") });
  }
}

const title = [
  ["เทียบค่าอบสี — R4.0เว็บ เทียบ R3.9"],
  ["R4.0เว็บ = คิดราคา 4.0 บนเว็บตอนนี้ (เรตอลู 3 แบรนด์ · ค่าอบ · ตู้อบ · กำไรตามไฟล์ถอดทุน) · " + stockNote],
  ["R3.9 = เลขในไฟล์ เทียบค่าอบสี.xlsx ล้วน (ค่าสี = คอลัมน์ K · ขายรวม = คอลัมน์ N) · ขนาดและจำนวนบานตามไฟล์"],
  ["ต่าง % = (R4.0เว็บ − R3.9) ÷ R3.9 · แดง = R4.0เว็บ แพงกว่าเกิน 2% · เขียว = ถูกกว่าเกิน 2% · แถวฟ้า = สีอบขาว/ดำ (ฐาน)"],
  [],
];
writeXlsx(OUT, [{ name: "R4.0เว็บ vs R3.9", rows: [...title, HEAD1, HEAD2, ...body],
  widths: [20, 11, 6, 11, 46, 16, 18, 13, 13, 13, 12, 12, 9, 12, 12, 9, 40],
  rowStyles: [S.HEAD, 0, 0, 0, 0, S.HEAD, S.HEAD, ...sty] }]);
if (process.argv.includes("--json")) fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(json));
console.log(OUT, "· สินค้า", items.length, "· แถว", body.length, "· R4.0เว็บ แพงกว่า", nUp, "· ถูกกว่า", nDn, "· ใกล้กัน ±2%", nEq);
