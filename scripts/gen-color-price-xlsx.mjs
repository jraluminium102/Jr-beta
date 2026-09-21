#!/usr/bin/env node
/**
 * gen-color-price-xlsx — ตารางอัปเดต "ราคาสีพิเศษ" ของเส้นอลูทุกเส้นที่คิดราคา 4.0 ใช้
 *   node scripts/gen-color-price-xlsx.mjs
 *   ออก: docs/ราคาสีพิเศษ-อัปเดต.xlsx
 *
 * แต่ละเส้น: ราคาขาว → ราคาสีที่เว็บใช้จริงตอนนี้ของแต่ละสี + "ราคามาจากไหน"
 *   ① ตารางราคาสี (ไฟล์ตั้งราคาสีไว้ตรง ๆ)  ② ราคาขาว + ค่าอบ × กก.  ③ ราคาขาว × ตัวคูณสีกล่อง
 *   ④ ยังไม่มีข้อมูล = เว็บใช้ราคาขาวไปก่อน → ต้องเติม
 */
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { writeXlsx, S } from "./xlsxwrite.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const COLORS = [["sahara", "เทาซาฮาร่า", "sahara"], ["sahara_black", "ดำซาฮาร่า", "sahara"], ["aztec", "Aztec gray", "sahara"],
  ["wood_teak", "ลายไม้สักทอง", "woodStock"], ["wood_maho", "มะฮอกกานี", "woodStock"], ["wood_whiteoak", "ไวท์โอ็ค", "woodStock"],
  ["special", "สีพิเศษ (สั่งอบ)", "special"]];
const n2 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : "");

// เส้นอลูที่สูตรใช้จริง (รวมรหัสที่เป็นสูตรเลือกตามสี/ความหนากระจก)
const used = new Map();   // code → { name, prods:Set, kgm, box }
for (const [id, p] of Object.entries(PRODUCTS)) for (const a of (p.alu || [])) {
  const raw = String(a.code || "");
  const codes = raw.includes("'") ? [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [raw];
  for (const c of codes) {
    if (!c || c === "-") continue;
    const e = used.get(c) || { name: a.name, prods: new Set(), box: a.box || "", kgm: 0, formulaPrice: 0 };
    e.prods.add(p.name);
    if (a.box) e.box = String(a.box);
    const kgm = (PB.ALUWEIGHT_KGM || {})[c] || (Number(a.kg) > 0 ? Number(a.kg) / (Number(a.stockLen) || 6.4) : 0);
    if (kgm > e.kgm) e.kgm = kgm;
    const fp = Number(a.price) || 0; if (fp > e.formulaPrice) e.formulaPrice = fp;
    used.set(c, e);
  }
}
const HEAD = ["รหัสเส้น", "ชื่อ (ตามสูตร)", "ใช้ในรุ่น", "กก./ม.", "ราคาขาว"];
for (const [, label] of COLORS) HEAD.push(label, "ที่มา");
HEAD.push("สรุป");
const rows = [], todo = [];
for (const [code, e] of [...used].sort()) {
  const white = (PB.ALUCODE || {})[code] ?? (e.formulaPrice > 0 ? e.formulaPrice : "");
  const stockLen = e.box ? 6 : 6.4;
  const r = [code, e.name, [...e.prods].slice(0, 3).join(" · ") + (e.prods.size > 3 ? ` (+${e.prods.size - 3})` : ""),
    n2(e.kgm), n2(white)];
  let needFill = 0;
  for (const [key, , bakeKey] of COLORS) {
    const fileP = (PB.ALUCOLOR_KEY?.[key] || {})[code];
    const rate = PB.BAKE?.[bakeKey] ?? 0;
    const cf = PB.BOX_CF?.[bakeKey] ?? 0;
    if (fileP > 0) { r.push(n2(fileP), "ตารางราคาสี"); continue; }
    if (e.box && cf > 0 && white > 0) { r.push(n2(white * cf), `ราคาขาว × ${cf} (กล่อง)`); continue; }
    if (e.kgm > 0 && rate > 0 && white > 0) { r.push(n2(white + rate * e.kgm * stockLen), `ราคาขาว + ค่าอบ ${rate}/กก.`); continue; }
    r.push(n2(white), "⚠ ยังไม่มี — ใช้ราคาขาว"); needFill++;
  }
  r.push(!(white > 0) ? "ยังไม่มีราคาขาวเลย" : needFill ? `ต้องเติม ${needFill} สี` : "ครบ");
  rows.push(r);
  if (needFill || !(white > 0)) todo.push(r);
}
const sty = (rs) => [0, ...rs.map((r) => (String(r[r.length - 1]) === "ครบ" ? S.GREEN : String(r[r.length - 1]).startsWith("ยังไม่มีราคาขาว") ? S.RED : S.YELLOW))];
const W = [12, 30, 42, 8, 10, ...COLORS.flatMap(() => [12, 22]), 14];
const rate = [["สี", "เรตค่าอบ (บาท/กก.)", "ตัวคูณราคากล่องเมืองทอง", "หมายเหตุ"],
  ...COLORS.map(([k, label, bk]) => [label, PB.BAKE?.[bk] ?? "", PB.BOX_CF?.[bk] ?? "", `คีย์ในระบบ: ${k} · กองค่าอบ: ${bk}`])];
const howto = [["ช่อง", "แปลว่าอะไร"],
  ["ราคาขาว", "ราคาต่อเส้นของสีอบขาว (ตารางราคาอลูในระบบ)"],
  ["ตารางราคาสี", "ไฟล์ตั้งราคาสีนั้นไว้ตรง ๆ แล้ว — แก้ที่ตารางราคาสีในไฟล์ถอดทุน"],
  ["ราคาขาว + ค่าอบ", "ไม่มีราคาสี → เว็บคิด ราคาขาว + เรตค่าอบ × น้ำหนักเส้น"],
  ["ราคาขาว × ตัวคูณ (กล่อง)", "กล่อง/ฉากเมืองทอง — สโตร์ไม่มีราคาสี เว็บใช้ตัวคูณตามชีตประตูรั้ว/ระแนง"],
  ["⚠ ยังไม่มี — ใช้ราคาขาว", "ไม่มีทั้งราคาสีและน้ำหนัก → เว็บคิดเท่าราคาขาว (คิดต่ำกว่าจริง) ต้องเติมราคาหรือน้ำหนัก"]];
writeXlsx("docs/ราคาสีพิเศษ-อัปเดต.xlsx", [
  { name: "อ่านยังไง", rows: howto, widths: [30, 80] },
  { name: "เรตค่าอบ", rows: rate, widths: [22, 20, 26, 44] },
  { name: "⚠ ต้องเติม", rows: [HEAD, ...todo], widths: W, rowStyles: sty(todo) },
  { name: "ทุกเส้น", rows: [HEAD, ...rows], widths: W, rowStyles: sty(rows) },
]);
console.log("docs/ราคาสีพิเศษ-อัปเดต.xlsx · เส้นทั้งหมด", rows.length, "· ต้องเติม", todo.length);
