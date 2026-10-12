#!/usr/bin/env node
/**
 * gen-color-compare-html — หน้าเทียบค่าอบสี อ่านง่าย (R3.9 · R4.0 เดิมในไฟล์ · R4.0 เว็บตอนนี้)
 *   node --experimental-strip-types scripts/gen-color-compare-html.mjs --stock stock-live.json --out page.html
 *   ข้อมูลเก่า = ไฟล์ เทียบค่าอบสี.xlsx ของเจ้าของ · ข้อมูลใหม่ = เอนจินคิดราคา 4.0 + ราคาทับจากสโตร์จริง
 *   ใช้ตัวเลือก/ขนาดชุดเดียวกับ gen-color-r39-compare-xlsx (color-compare-config.mjs)
 */
import fs from "node:fs";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { resolveAluColor } from "../src/lib/calculator40/alu-colors.ts";
import { stockColorOfCalc, buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";
import { IDOF, KEYOF, baseInput } from "./color-compare-config.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
const OUT = arg("--out") || "docs/เทียบค่าอบสี.html";
const PB0 = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let PB = PB0, nStock = 0;
if (arg("--stock")) {
  const raw = JSON.parse(fs.readFileSync(arg("--stock"), "utf8"));
  const rows = raw.rows ?? raw; nStock = rows.length;
  PB = applyPriceOverride(JSON.parse(JSON.stringify(PB0)), buildPriceOverride(rows, PB0));
}

// หมายเหตุรายรุ่น — สิ่งที่เจ้าของต้องรู้ตอนอ่านเทียบ (ตรวจแล้ว 12 ต.ค.69)
const NOTE = {
  "PC Door": { level: "file", text: "ไฟล์เดิมเขียนช่อง อลูที่ใช้ ผิด (ลอกของบานเปิดฟูจิมา) ของจริงเป็นเส้นเมืองทอง+SMS ตามไฟล์ถอดทุน v1 · น้ำหนักในไฟล์เดิมเชื่อไม่ได้" },
  "เฟี้ยม": { level: "file", text: "ไฟล์เดิมคิดราคาฐานแบบ 2 บาน ทั้งที่หัวข้อเขียน 6 บาน · เว็บคิด 6 บาน (อุปกรณ์ 14,000 ตามไฟล์ v1) ช่อง R4.0 เดิมจึงต่ำเกินจริง" },
  "บานเลื่อนรางบน": { level: "file", text: "ไฟล์เดิมเขียนคานรับราง 1.6\"×4\" · เว็บและใบตัดใช้ 2\"×4\"" },
  "บานระแนงเลื่อน": { level: "fix", text: "แก้ 12 ต.ค.69: ลูกฟูก 20 เส้นที่เป็นหน้าบานคิดตามสีแล้ว (เดิมราคาเดียวทุกสี)" },
  "บานโซลิด": { level: "rule", text: "เปิดมะฮอกกานี/ไวท์โอ๊คแบบสีสต็อก 12 ต.ค.69 · ใช้อลูหนักมาก (ลูกฟูก+เส้นคาดตาราง 2 ฝั่ง) ค่าสีจึงสูงกว่า R3.9 ที่บวกเหมา" },
  "บานหมุน": { level: "rule", text: "รุ่นนี้ไม่มีมะฮอกกานี/ไวท์โอ๊คสต็อก → เว็บคิดเป็นลายไม้อบพิเศษ (ไฟล์เดิมยังคิดสีสต็อก)" },
  "บานกระทุ้ง": { level: "rule", text: "รุ่นนี้ไม่มีมะฮอกกานี/ไวท์โอ๊คสต็อก → เว็บคิดเป็นลายไม้อบพิเศษ (ไฟล์เดิมยังคิดสีสต็อก)" },
  "บานเลื่อน SlimLux": { level: "info", text: "ราคามาตรฐานรวมค่าอบสีเทาไว้แล้ว ค่าสีพิเศษจึงบวกน้อย" },
  "บานเลื่อน E-series": { level: "info", text: "ราคามาตรฐานรวมค่าอบสีเทาไว้แล้ว ค่าสีพิเศษจึงบวกน้อย" },
  "Velora": { level: "info", text: "ราคามาตรฐานรวมค่าอบสีเทาไว้แล้ว · แก้ 12 ต.ค.69 ลูกฟูกตอนลายไม้อบพิเศษคิดค่าอบแล้ว" },
  "บานเลื่อน SMS": { level: "fix", text: "แก้ 12 ต.ค.69: ขวางบน/ล่าง B20054 ตอนสีพิเศษคิดค่าอบแล้ว (เดิมไม่คิด)" },
  "เปิดดัดโค้ง": { level: "info", text: "บานสั่งสำเร็จจากร้านอื่น ค่าสีคิดจากน้ำหนักเส้นอ้างอิง" },
};
const GROUP = (n) => /ระแนง|รั้ว/.test(n) && !/บานระแนงเลื่อน/.test(n) ? "ระแนง/รั้ว"
  : /หลังคา/.test(n) ? "หลังคา" : /เลื่อน/.test(n) ? "บานเลื่อน" : /เฟี้ยม/.test(n) ? "เฟี้ยม" : "บานเปิด/อื่น ๆ";

const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) {
    cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), kgFile: num(cell(r, "D")), spec: cell(r, "E").replace(/\r?\n/g, " · "),
      base40: num(cell(r, "M")), base39: num(cell(r, "N")), rows: [] };
    items.push(cur); continue;
  }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ type: f, color: cell(r, "G"), costTxt: cell(r, "I"),
    cost40: num(cell(r, "I")), add40: num(cell(r, "J")), add39: num(cell(r, "K")), total40: num(cell(r, "M")), total39: num(cell(r, "N")) });
}
const webOpt = (key) => { const rc = resolveAluColor(key);
  return { color: rc.bake, colorName: rc.label, stockColor: stockColorOfCalc(key), colorKey: key, profitPct: 100, profitMat: 100, profitProd: 100, profitInst: 200, profitManual: false }; };
const R = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

const data = [];
for (const it of items) {
  const id = IDOF[it.name], p = id && PRODUCTS[id];
  if (!p) continue;
  const base = baseInput(id, p, it.size, it.panels);
  const run = (k) => computeCost(PB, p, { ...base, ...webOpt(k) });
  const wh = run("white"), ws = run("wood_special");
  const prod = { name: it.name, group: GROUP(it.name), size: it.size, panels: it.panels, spec: it.spec,
    kgFile: it.kgFile, kgWeb: Math.round((ws.aluKg || 0) * 10) / 10, note: NOTE[it.name] || null,
    rows: [{ base: true, type: "มาตรฐาน", color: "อบขาว / ดำ", t39: it.base39, t40: it.base40, tWeb: R(wh.sell?.withInstall), costWeb: R(wh.cost.total) }] };
  for (const cr of it.rows) {
    const k = KEYOF(cr.color);
    if (!k || cr.color === "—" || /ไม่มีสีนี้ขาย/.test(cr.costTxt)) { prod.rows.push({ na: true, type: cr.type, color: cr.color || "—" }); continue; }
    const c = run(k);
    const swapped = !p.euroColors && !p.woodStockColors && (k === "wood_maho" || k === "wood_whiteoak");
    prod.rows.push({ type: cr.type, color: cr.color,
      t39: cr.total39, t40: cr.total40, tWeb: R(c.sell?.withInstall),
      a39: cr.add39, a40: cr.add40, aWeb: R((c.sell?.withInstall || 0) - (wh.sell?.withInstall || 0)),
      c40: cr.cost40, cWeb: R(c.cost.total - wh.cost.total),
      oven: (c.cost?.openOven || 0) > 0, swapped });
  }
  data.push(prod);
}
const meta = { builtAt: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }), nStock };

// ── แท็บ เทียบตาราง R4.1 (ข้อมูลจาก gen-r41-compare-data.mjs --out) ──
const r41rows = arg("--r41") ? JSON.parse(fs.readFileSync(arg("--r41"), "utf8")).rows : [];
// หมายเหตุรายรุ่น + ข้อสรุป "ควรทำอะไร" — วิเคราะห์ 12 ต.ค.69 (เว็บตอนนี้ เทียบตาราง R4.1)
const NOTES41 = {
  sms_slide: { level: "file", text: "ทุนค่าของสูงกว่าตาราง ~3% เพราะเรต SMS ต่อโล 188 สูงกว่าใบราคาเส้น SMS ในไฟล์ (ตกราว 164/กก.)" },
  bar_slide: { level: "file", text: "เรต SMS ต่อโล + ลูกฟูกคิดตามเรตแบรนด์ (491/เส้น แทน 432) ตั้งแต่ 12 ต.ค.69" },
  banyok: { level: "file", text: "เส้น SMS ทั้งชุด ทุนสูงกว่าตาราง ~13% จากเรต SMS ต่อโล" },
  folding: { level: "file", text: "เส้น SMS ทั้งชุด ทุนสูงกว่าตาราง ~9% จากเรต SMS ต่อโล" },
  velora: { level: "file", text: "ตาราง R4.1 ยังไม่มีค่าเปิดตู้อบ 2,000 (ไฟล์ v1 ใส่แล้ว) + ราคาเส้น Velora ในสโตร์ 1,500 / 1,000 สูงกว่าไฟล์ 768 / 720 และระบบใช้ราคาสโตร์" },
  cabinet_face: { level: "file", text: "ไฟล์ v1 ตั้ง ค่ากรีดราง 800 บาท/เมตร · บานกว้าง 40 ซม. ค่ากรีดอย่างเดียว 640 เกินทุนทั้งบานในตาราง (566)" },
  topslide: { level: "info", text: "ทุนบนเว็บโตตามขนาดไม่เท่าตาราง · บานเล็กแพงกว่า บานใหญ่ถูกกว่า ใช้ % เดียวคุมไม่ได้" },
  euro_slide: { level: "info", text: "ทุนบนเว็บโตตามขนาดไม่เท่าตาราง · ห่างคนละทางตามขนาด" },
  slimlux: { level: "info", text: "ทุนค่าของต่ำกว่าตาราง ~9% ทุกขนาด" },
  gate: { level: "info", text: "ห่างคนละทางตามขนาด" },
  roof_slide: { level: "rule", text: "ค่าแรงคิดบนผืนจริง (ใต้บานเลื่อนโล่ง ตามที่เคาะ 26 ก.ย.) · ตารางคิดผืนเต็ม+บานเลื่อน" },
  louver: { level: "rule", text: "ค่าแรงปัดขนาดตามไฟล์ v1 (ตารางทำตามกฎปัดขนาดรุ่นเก่า v20)" },
  louver_rotate: { level: "rule", text: "ค่าแรงปัดขนาดตามไฟล์ v1 (แก้ 12 ต.ค.69) · ตารางทำตามกฎเก่า" },
  shower: { level: "fix", text: "แก้ 12 ต.ค.69: ค่าติดตั้งตามไฟล์ v1 + จูน % ค่าของแล้ว" },
};
const FINDS41 = [
  { sev: "hi", tag: "เคาะก่อน", title: "เรต SMS ต่อโล 188 สูงกว่าใบราคาเส้นเดิม ~12%", why: "รุ่นที่ใช้เส้น SMS แพงกว่าตารางทุกขนาด: บานเลื่อน SMS +5% · ระแนงเลื่อน +7% · เฟี้ยม +7% · บานยก +9%", act: "ยืนยันเรต SMS อบขาว ถ้าซื้อจริงถูกกว่า ส่งเรตมา แล้วรุ่น SMS จะกลับเข้าตาราง" },
  { sev: "hi", tag: "เคาะก่อน", title: "บานตู้ Futuretech แพงกว่าตาราง 30–40%", why: "ไฟล์ v1 ตั้งค่ากรีดราง 800 บาท/เมตร (บาน 40 ซม. = 640 บาท) · ตารางคิดทั้งบานแค่ 566", act: "เช็คว่า 800 คือต่อเมตร ต่อเส้น หรือต่องาน" },
  { sev: "hi", tag: "เคาะก่อน", title: "Velora แพงกว่าตาราง 13–15%", why: "ตารางยังไม่มีค่าเปิดตู้อบ 2,000 · ราคาเส้นในสโตร์ (1,500 / 1,000) สูงกว่าไฟล์ (768 / 720) และระบบหยิบราคาสโตร์", act: "เคาะว่าราคาเส้น Velora ที่ถูกคือไฟล์หรือสโตร์" },
  { sev: "mid", tag: "ทำได้เลย", title: "จูน % ค่าของใหม่ให้ยอดรวมชนตาราง", why: "ทุนเปลี่ยนไปหลังทำตาราง (เรตต่อโล · น้ำหนัก · สี) · จูนแล้วเกือบทุกรุ่นเข้า ±2%", act: "ทำหลังเคาะ 3 ข้อบน — คำสั่งเดียว ไม่แตะค่าแรง" },
  { sev: "mid", tag: "เลือกแนว", title: "รุ่นที่ห่างตามขนาด (% เดียวคุมไม่ได้)", why: "บานเลื่อนรางบน ±16% · บานเลื่อนยูโร ±7% · ประตูรั้ว ±9% · หลังคาเลื่อน ±10%", act: "ยอมรับช่วงนี้ หรือให้ตั้ง % แยกตามช่วงขนาด" },
  { sev: "lo", tag: "รับทราบ", title: "ค่าแรงบางรุ่นตามไฟล์ v1 แต่ตารางทำตามกฎเก่า", why: "หลังคาเลื่อน · ระแนง · ระแนงหมุน", act: "ถ้ายึดไฟล์ v1 ควรออกตาราง R4.1 ใหม่ตามกฎปัจจุบัน" },
  { sev: "lo", tag: "รับทราบ", title: "ฝ้า ผนัง พื้น งานไฟ เทียบ 3 ก้อนไม่ได้", why: "เว็บยังรวมค่าแรงไว้ในวัสดุ ตารางแยกค่าแรงออกมา", act: "" },
];
const r41 = { rows: r41rows, notes: NOTES41, finds: FINDS41 };
const tpl = fs.readFileSync("scripts/color-compare.template.html", "utf8");
const json = JSON.stringify({ meta, data, r41 }).replace(/</g, "\\u003c");
fs.writeFileSync(OUT, tpl.replace("/*__DATA__*/null", json));
console.log(OUT, "· สินค้า", data.length, "· แถวสี", data.reduce((a, p) => a + p.rows.length, 0));
