#!/usr/bin/env node
/**
 * verify-file-calc — เว็บต้องเท่า "Excel จริง" ของไฟล์ ถอดทุน_รวมทั้งหมด (12 พ.ย.69) ทุกช่อง ทุกเคสในชุด
 *   node --experimental-strip-types scripts/verify-file-calc.mjs
 *
 * ชุดเคส + ผล Excel อยู่ที่ scripts/fixtures/file-calc-excel.json (สร้างด้วย scripts/gen-file-calc-fixture.mjs + scripts/xl/xlcalc2.ps1)
 *   พื้นไม้เทียม (floor_wpc) · อลูทึบ (alu_solid) · ติดตาย นับเส้นแบบใหม่ (ข้อ 1-2) · ค่าแรงผลิตบานโซลิด + รุ่น 1 −25% (ข้อ 24, 29)
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/file-calc-excel.json", "utf8"));
let pass = 0, fail = 0;
const bad = [];
const near = (a, b, tol = 0.006) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
const chk = (id, label, web, xl, tol) => { if (near(web, xl, tol)) pass++; else { fail++; bad.push(`  ❌ ${id} ${label}: เว็บ ${web} · Excel ${xl}`); } };
const qty = (r, re) => (r.lines || []).filter((l) => re.test(l.name || "")).reduce((s, l) => s + (Number(l.qty) || 0), 0);
const price = (r, re) => ((r.lines || []).find((l) => re.test(l.name || "")) || {}).unitPrice || 0;
const C = (id, o, pb = PB) => computeCost(pb, PRODUCTS[id], { color: "white", colorKey: "white", spec: {}, addons: {}, ...o });

// สีในชีตอลูทึบ B8 → คีย์สี + หมวดค่าอบ ของเว็บ
const COLOR = {
  "อบขาว": ["white", "white"], "ดำ": ["black", "white"], "เทาซาฮาร่า": ["sahara", "sahara"], "สีดำซาฮาร่า": ["sahara_black", "sahara"],
  "แอทแทคเกรย์": ["aztec", "special"], "ลายไม้สักทอง": ["wood_teak", "woodStock"], "ลายไม้มะฮอกกานี": ["wood_maho", "woodStock"], "ลายไม้ไวท์โอ๊ค": ["wood_whiteoak", "woodStock"],
  "สีอบพิเศษ": ["special", "special"], "สีลายไม้อบพิเศษ": ["wood_special", "woodSpecial"],
};
const count = { floor: 0, solid: 0, fixed: 0, bansolid: 0 };

for (const c of FX.cases) {
  const x = c.excel, i = c.in; count[c.kind]++;
  if (c.kind === "floor") {
    const r = C("floor_wpc", { w: Math.round(i.w * 100), h: Math.round(i.h * 100), material: i.model,
      spec: { wpcH: String(i.fh), wpcJoist: String(i.joist), wpcCross: String(i.cross), wpcDir: i.dir, wpcEdge: i.edge, wpcEdgeW: String(i.ew), wpcEdgeL: String(i.el) } });
    const tag = `${c.id} ${i.w}×${i.h} ม. ${i.model} ${i.dir}`;
    chk(tag, "แผ่น B17", qty(r, /^แผ่นไม้เทียม/), x.B17); chk(tag, "ตงซอย B18", qty(r, /^ตงซอย/), x.B18); chk(tag, "ตงขวาง B19", qty(r, /^ตงขวาง/), x.B19);
    chk(tag, "คานรอบ B20", qty(r, /^คานรอบ/), x.B20); chk(tag, "ขา B21", qty(r, /^ขาเหล็ก/), x.B21); chk(tag, "คลิป B22", qty(r, /^คลิป/), x.B22); chk(tag, "ปิดขอบ B23", qty(r, /^ตัวปิดขอบ/), x.B23);
    chk(tag, "ทุนวัสดุ B29", r.cost.total, x.B29); chk(tag, "ค่าแรงผลิต E24", r.labor.prod, x.E24); chk(tag, "ค่าแรงติดตั้ง E25", r.labor.install, x.E25);
    chk(tag, "ทุนรวม E26", r.cost.total + r.labor.prod + r.labor.install, x.E26);
    chk(tag, "ขายผลิตอย่างเดียว B31", r.sell.mfgOnly, x.B31); chk(tag, "ขายผลิต+ติดตั้ง B32", r.sell.withInstall, x.B32);
  } else if (c.kind === "solid") {
    const [ck, bake] = COLOR[i.color];
    const material = i.kind === "คอมโพสิต" ? "คอมโพสิต " + i.thick : i.kind === "แผ่นอลูเรียบ" ? "แผ่นอลูเรียบ 3 มม." : i.kind;
    const r = C("alu_solid", { w: i.w, h: i.h, p: i.n, material, colorKey: ck, color: bake, spec: { corrDeg: String(i.deg), gridM: String(i.gridM), gridColor: i.gridColor } });
    const tag = `${c.id} ${material} ${i.w}×${i.h}×${i.n} ${i.color} มุม ${i.deg}° คาด ${i.gridM} ม. ${i.gridColor}`;
    chk(tag, "ลูกฟูก B17", qty(r, /^ลูกฟูก/), x.B17); if (x.B17 > 0) chk(tag, "ราคาลูกฟูก D17", price(r, /^ลูกฟูก/), x.D17);
    chk(tag, "คอมโพสิต B18", qty(r, /^แผ่นคอมโพสิต/), x.B18); chk(tag, "อลูเรียบ B19", qty(r, /^แผ่นอลูเรียบ/), x.B19);
    chk(tag, "กก.อบ B20", qty(r, /^ค่าอบสีแผ่น/), x.B20); if (x.B20 > 0) chk(tag, "เรตอบ D20", price(r, /^ค่าอบสีแผ่น/), x.D20);
    chk(tag, "เปิดตู้อบ B21", r.cost.openOven > 0 ? 1 : 0, x.B21);
    chk(tag, "เส้นคาด B22", qty(r, /^เส้นคาด/), x.B22); if (x.B22 > 0) chk(tag, "ราคาเส้นคาด D22", price(r, /^เส้นคาด/), x.D22);
    chk(tag, "ทุนรวม E24", r.cost.total, x.E24); chk(tag, "ขายรวม B31", r.sell.withInstall, x.B31);
    chk(tag, "ขายไส้+ขายเส้นคาด B29+B30", r.sell.beforeLabor, x.B29 + x.B30);
  } else if (c.kind === "fixed") {
    // ปิดเรตแบรนด์ = ราคาเส้นตามไฟล์ (กล่อง 1,240 · 9014 380) → ทุนต้องเท่า D20 เป๊ะ
    const r = C("fixed", { w: i.w, h: i.h, p: i.n, form: "กระจกล้วน", glassType: "เขียว 6มม." }, { ...PB, ALU_BRAND_ON: false });
    const tag = `${c.id} ติดตาย ${i.w}×${i.h}×${i.n}`;
    chk(tag, "กล่อง B13", qty(r, /^กล่อง 1\.6×3/), x.B13, 0.011); chk(tag, "9014 B14", qty(r, /^9014/), x.B14, 0.011);
    chk(tag, "ทุนรวม D20", r.cost.total, x.D20, 0.011);
  } else if (c.kind === "bansolid") {
    const two = C("bansolid", { w: i.w, h: i.h, p: i.n, form: "มีธรณี", spec: { solidLayer: "โซลิด 2 ชั้น" } });
    const r = C("bansolid", { w: i.w, h: i.h, p: i.n, form: "มีธรณี", spec: { solidLayer: i.model === "โซลิด 1" ? "โซลิด 1 ชั้น" : "โซลิด 2 ชั้น" } });
    const tag = `${c.id} บานโซลิด ${i.w}×${i.h}×${i.n} ${i.model}`;
    chk(tag, "ค่าแรงผลิต D36", r.labor.prod, x.D36, 0.011);
    // ค่าติดตั้ง: ไฟล์นี้ตั้งฐานคนละเลขกับเว็บ (เว็บยึดไฟล์รวม v1 · บันทึกการแก้ไขข้อ 29 เขียนว่า "ติดตั้งไม่แตะ") → ตรวจเฉพาะตัวคูณรุ่น 1 = 0.75
    chk(tag, "ค่าติดตั้ง ตัวคูณรุ่น", r.labor.install, two.labor.install * (i.model === "โซลิด 1" ? 0.75 : 1), 0.011);
  }
}
for (const b of bad.slice(0, 60)) console.log(b);
console.log(`เคส: พื้นไม้เทียม ${count.floor} · อลูทึบ ${count.solid} · ติดตาย ${count.fixed} · บานโซลิด ${count.bansolid}  (Excel: ${FX.source})`);
console.log(`═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
