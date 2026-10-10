#!/usr/bin/env node
/**
 * check-rate-applied — ตรวจว่า "กดอัปเดตเรตต่อโลแล้ว ราคาขยับจริงไหม"
 *   node scripts/check-rate-applied.mjs            → พิมพ์ตารางเทียบ
 *   node scripts/check-rate-applied.mjs --json     → ส่ง JSON (เอาไปเทียบกับสโตร์จริงในเบราว์เซอร์)
 *
 * ที่ต้องตรงกัน 3 ชั้น (เจ้าของสั่งเทส 10 ต.ค.69 "เรายังไม่ตรวจกันเลยว่าอัพแล้วราคาเปลี่ยนจริงไหม")
 *   ① ตารางเรต  PB.ALU_BRAND[แบรนด์][สี]            = เลขที่เจ้าของส่งมา
 *   ② ราคา/เส้นในคิดราคา 4.0  = PB.ALU_KG[รหัส] × เรต   (เอนจินคูณให้)
 *   ③ ทุน/หน่วยในสโตร์        = weight_per_unit × price_per_kg (API alu-rates เขียนให้)
 * ①=②=③ → กดอัปเดตแล้วทั้งเว็บใช้ราคาเดียวกัน
 */
import { createRequire } from "node:module";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
const PB = createRequire(import.meta.url)("../src/lib/calculator40/pricebook.json");

const COLORS = [
  { key: "white", color: "white", name: "อบขาว" },
  { key: "black", color: "black", name: "ดำ" },
  { key: "sahara", color: "sahara", name: "เทาซาฮาร่า" },
  { key: "wood_teak", color: "woodStock", name: "ลายไม้สักทอง" },
];
// รุ่นตัวแทนของแต่ละแบรนด์ (ให้ครอบรหัส B / F / เมืองทอง)
const PICK = ["sms_slide", "fuji_slide", "bansolid", "roof", "bar_slide", "euro_bifold"];

const got = new Map();   // "รหัส|สี" → ราคา/เส้นที่เอนจินใช้
for (const id of PICK) {
  const prod = PRODUCTS[id];
  if (!prod) continue;
  for (const c of COLORS) {
    let r;
    try { r = computeCost(PB, prod, { w: 300, h: 220, p: 2, colorKey: c.key, color: c.color, colorName: c.name }); } catch { continue; }
    for (const l of r.lines ?? []) {
      if (l.cat !== "alu" || !l.code || !(l.unitPrice > 0)) continue;
      got.set(l.code + "|" + c.name, { code: l.code, color: c.name, price: l.unitPrice, kg: l.kg || 0, prod: id });
    }
  }
}

const RATE = PB.ALU_BRAND ?? {};
const BR = PB.ALU_BRAND_OF ?? {};
const KG = PB.ALU_KG ?? {};
const rows = [];
for (const v of got.values()) {
  const brand = BR[v.code];
  // ALUCODE_NOCOLOR = เส้นสีเงิน/ผิวเดิม ไม่อบสี → ราคาเดียวทุกสี (เรตขาว) ตามที่เจ้าของยืนยัน
  const noColor = (PB.ALUCODE_NOCOLOR ?? []).includes(v.code);
  const rate = brand && RATE[brand] ? (noColor ? RATE[brand]["อบขาว"] : RATE[brand][v.color]) : 0;
  const kg = Number(KG[v.code]) || 0;
  const want = rate > 0 && kg > 0 ? Math.round(kg * rate) : 0;
  rows.push({ ...v, brand: brand ?? "-", noColor, rate: rate || 0, kgTable: kg, want, ok: want > 0 && Math.abs(v.price - want) <= 1 });
}
rows.sort((a, b) => a.code.localeCompare(b.code) || a.color.localeCompare(b.color, "th"));

if (process.argv.includes("--json")) { console.log(JSON.stringify(rows)); process.exit(0); }

const byBrand = new Map();
for (const r of rows) byBrand.set(r.brand, (byBrand.get(r.brand) ?? 0) + 1);
console.log("บรรทัดเส้นอลูที่ตรวจ " + rows.length + " · " + [...byBrand.entries()].map(([b, n]) => b + " " + n).join(" · "));
const useRate = rows.filter((r) => r.want > 0);
const off = useRate.filter((r) => !r.ok);
console.log("\n① ตารางเรต (PB.ALU_BRAND)");
for (const [b, m] of Object.entries(RATE)) console.log("   " + b.padEnd(7) + Object.entries(m).map(([c, v]) => c + " " + v).join(" · "));
console.log("\n② ราคา/เส้นในคิดราคา = น้ำหนัก × เรต : ตรง " + (useRate.length - off.length) + "/" + useRate.length);
for (const r of off.slice(0, 12))
  console.log("   ⚠ " + r.code.padEnd(9) + r.color.padEnd(14) + "เอนจิน " + String(r.price).padStart(7) + " · ตาราง " + r.kgTable + "×" + r.rate + " = " + r.want + "  (" + r.prod + ")");
console.log("\nตัวอย่างที่ตรง:");
for (const r of useRate.filter((r) => r.ok).slice(0, 8))
  console.log("   " + r.code.padEnd(9) + r.color.padEnd(14) + String(r.price).padStart(7) + " = " + r.kgTable + " กก. × " + r.rate + " ฿/กก. (" + r.brand + ")");
console.log("\nบรรทัดที่ไม่ได้คิดจากเรตต่อโล (ซื้อเป็นเส้น / ราคาตรึงจากไฟล์): " + (rows.length - useRate.length));
process.exit(off.length ? 1 : 0);
