#!/usr/bin/env node
/**
 * gen-color-panel-xlsx — เทียบ "ค่าสี" แบบบานสำเร็จ (ขนาด/สินค้าเดียวกับไฟล์ เทียบค่าอบสี.xlsx)
 *   node scripts/gen-color-panel-xlsx.mjs ["C:/.../เทียบค่าอบสี.xlsx"]
 *   ออก: docs/เทียบค่าสี-บานสำเร็จ.xlsx
 *
 * เจ้าของสั่ง 21 ก.ย.69: "เทียบราคาสีอยากเทียบเป็นบานสำเร็จแบบนี้ เอาขนาดและราคาที่เอาไว้เทียบตามไฟล์นี้เลย"
 * แต่ละบรรทัด = สินค้า × สี → น้ำหนักอลู · ทุนสีที่เพิ่ม · ค่าสีที่บวกในราคาขาย · ราคาขายรวม
 *   แล้วเทียบกับเลขในไฟล์ (คอลัมน์ R4.0 ของไฟล์) ว่าตอนนี้เว็บเปลี่ยนไปเท่าไร
 */
import fs from "node:fs";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { writeXlsx, S } from "./xlsxwrite.mjs";

const SRC = process.argv[2] || "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));

// ชื่อในไฟล์ → รหัสรุ่นในคิดราคา 4.0
const IDOF = {
  "บานเลื่อน SMS": "sms_slide", "บานเลื่อน ยูโร": "euro_slide", "บานเลื่อน SlimLux": "slimlux",
  "บานเลื่อนรางบน": "topslide", "บานเลื่อน E-series": "eseries", "บานระแนงเลื่อน": "bar_slide",
  "บานเปิด": "open_door", "บานหมุน": "pivot", "บานกระทุ้ง": "awning", "เฟี้ยม": "folding",
  "เฟี้ยมยูโร": "fold_euro", "ติดตาย": "fixed", "PC Door": "pcdoor", "บานยก": "banyok",
  "เปิดดัดโค้ง": "curve_open", "บานเกล็ด": "banklet", "บานโซลิด": "bansolid", "Velora": "velora",
  "หลังคาเพิง ไวนิล": "roof", "ระแนง": "louver", "ระแนงหมุน": "louver_rotate", "ระแนงสลับ": "louver_slip",
  "ประตูรั้ว": "gate",
};
// ชื่อสีในไฟล์ → (คีย์ราคาสี, กองค่าอบ)
const COLOF = (s) => {
  const t = String(s).replace(/\s+/g, "");
  if (/มะฮอกกานี/.test(t)) return ["wood_maho", "woodStock", "ลายไม้มะฮอกกานี"];
  if (/ไวท์โอ/.test(t)) return ["wood_whiteoak", "woodStock", "ลายไม้ไวท์โอ็ค"];
  if (/ลายไม้อบพิเศษ|สีลายไม้อบพิเศษ/.test(t)) return ["special", "woodSpecial", "ลายไม้อบพิเศษ"];
  if (/อบพิเศษ|สีพิเศษ/.test(t)) return ["special", "special", "สีอบพิเศษ"];
  if (/ลายไม้/.test(t)) return ["wood_teak", "woodStock", "ลายไม้สักทอง (สต็อก)"];
  return null;
};
// อ่านไฟล์ต้นทาง
const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) { cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), kg: num(cell(r, "D")), rows: [] }; items.push(cur); continue; }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ type: f, color: cell(r, "G"), rate: cell(r, "H"),
    costAdd: num(cell(r, "I")), sellAdd: num(cell(r, "J")), total: num(cell(r, "M")) });
}
const n0 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : "");
const pc = (a, b) => (b > 0 && typeof a === "number" ? Math.round(((a - b) / b) * 1000) / 10 : "");

const HEAD = ["สินค้า", "รหัสรุ่น", "ขนาด (ซม.)", "บาน", "สี", "เรต บาท/กก.",
  "กก. ที่คิดค่าอบ — เว็บ", "น้ำหนักบาน — เว็บ", "กก. — ไฟล์",
  "ทุนค่าสี — เว็บ", "ทุนค่าสี — ไฟล์", "ค่าสีในราคาขาย — เว็บ", "ค่าสีในราคาขาย — ไฟล์",
  "ขายรวม — เว็บ", "ขายรวม — ไฟล์", "ต่าง (บาท)", "ต่าง %", "หมายเหตุ"];
const out = [];
for (const it of items) {
  const id = IDOF[it.name];
  const p = id && PRODUCTS[id];
  if (!p) { out.push([it.name, id || "—", it.size, it.panels, "", "", "", "", it.kg, "", "", "", "", "", "", "", "", "ยังไม่ได้แมปรุ่นนี้"]); continue; }
  const [w, h] = String(it.size).split(/\s*x\s*/i).map((v) => Number(v));
  const pn = Number(it.panels) || 1;
  const base = { w, h, p: pn, form: p.defForm, material: id === "roof" ? "ไวนิล" : p.defMaterial, glassType: p.defGlass, spec: {}, addons: {} };
  let wh; try { wh = computeCost(PB, p, { ...base, color: "white", colorKey: "white" }); } catch (e) { out.push([it.name, id, it.size, pn, "", "", "", "", it.kg, "", "", "", "", "", "", "", "", "คิดไม่ได้: " + e.message.slice(0, 40)]); continue; }
  out.push([it.name, id, it.size, pn, "อบขาว/ดำ (ฐาน)", 0, 0, Math.round(wh.weight?.alu * 10) / 10, it.kg, 0, 0, 0, 0, n0(wh.sell?.withInstall), "", "", "", "แถวฐาน — ไว้หักออกเป็นค่าสี"]);
  for (const cr of it.rows) {
    const m = COLOF(cr.color);
    if (!m) { out.push([it.name, id, it.size, pn, cr.color, cr.rate, "", "", "", "", cr.costAdd, "", cr.sellAdd, "", cr.total, "", "", "ไฟล์บอกว่าไม่มีสีนี้ขาย"]); continue; }
    const [ck, bake, label] = m;
    let c; try { c = computeCost(PB, p, { ...base, color: bake, colorKey: ck }); } catch { continue; }
    const costAdd = c.cost.total - wh.cost.total, sellAdd = (c.sell?.withInstall || 0) - (wh.sell?.withInstall || 0);
    const d = (c.sell?.withInstall || 0) - (cr.total || 0);
    out.push([it.name, id, it.size, pn, label, PB.BAKE?.[bake] ?? "", Math.round((c.aluKg || 0) * 10) / 10, Math.round((c.weight?.alu || 0) * 10) / 10, it.kg,
      n0(costAdd), n0(cr.costAdd), n0(sellAdd), n0(cr.sellAdd), n0(c.sell?.withInstall), n0(cr.total),
      cr.total ? n0(d) : "", pc(c.sell?.withInstall || 0, cr.total || 0), ""]);
  }
}
const STY = (r) => {
  const p = r[16];
  if (typeof p !== "number") return S.GREY;
  return Math.abs(p) <= 1 ? S.GREEN : Math.abs(p) <= 5 ? S.YELLOW : S.RED;
};
const W = [22, 13, 12, 6, 24, 12, 17, 15, 12, 14, 14, 20, 20, 13, 13, 11, 8, 34];
const howto = [["ช่อง", "แปลว่าอะไร"],
  ["แถวฐาน", "สีอบขาว/ดำ — ราคามาตรฐาน · ค่าสีของสีอื่นคิดจาก (ราคาสีนั้น − ราคาฐาน)"],
  ["ทุนค่าสี", "ทุนที่เพิ่มขึ้นจากแถวฐาน (ค่าอบ × กก. + ค่าเปิดตู้อบ หรือราคาเส้นสีสำเร็จที่แพงกว่า)"],
  ["ค่าสีในราคาขาย", "ราคาขายรวมของสีนั้น − ราคาขายรวมของแถวฐาน = เงินที่ลูกค้าจ่ายเพิ่ม"],
  ["— เว็บ", "คิดราคา 4.0 บนเว็บตอนนี้"],
  ["— ไฟล์", "เลขในไฟล์ เทียบค่าอบสี.xlsx (คอลัมน์ R4.0 ที่ทำไว้ก่อนหน้า)"],
  ["กก. ที่คิดค่าอบ", "น้ำหนักที่เข้ากองค่าอบจริง (เส้นที่ยังไม่รวมสีในราคา) — ลายไม้สต็อกเป็น 0 เพราะซื้อเส้นสีสำเร็จ"],
  ["กก. — ไฟล์", "เลขในไฟล์เดิม ถอดกลับจากทุนค่าสี — ไม่ใช่ตัวเลขที่เว็บใช้ตรง ๆ"],
  ["ต่าง %", "เขียว ≤1% · เหลือง ≤5% · แดง เกิน 5% (เว็บเปลี่ยนไปจากตอนทำไฟล์)"]];
writeXlsx("docs/เทียบค่าสี-บานสำเร็จ.xlsx", [
  { name: "อ่านยังไง", rows: howto, widths: [24, 86] },
  { name: "เทียบค่าสี", rows: [HEAD, ...out], widths: W, rowStyles: [0, ...out.map(STY)] },
]);
const off = out.filter((r) => typeof r[16] === "number" && Math.abs(r[16]) > 5).length;
console.log("docs/เทียบค่าสี-บานสำเร็จ.xlsx · แถว", out.length, "· ต่างจากไฟล์เกิน 5%:", off);
