#!/usr/bin/env node
/**
 * compare-alu-brand-switch — เทียบทุนทุกรุ่น "ก่อน vs หลัง" เปลี่ยนมาคิดราคาอลูจากน้ำหนัก × เรตแบรนด์
 *   node scripts/compare-alu-brand-switch.mjs [สมุดราคาเก่า.json]
 * ออกไฟล์ docs/เทียบทุน-ก่อนหลัง-ราคาอลู3แบรนด์.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeXlsx, S } from "./xlsxwrite.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEW = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
const OLD = JSON.parse(fs.readFileSync(process.argv[2] || path.join(ROOT, "tmp/scratch/pb-before-brand.json"), "utf8"));

const COLORS = [["white", "อบขาว"], ["black", "ดำ"], ["sahara", "เทาซาฮาร่า"], ["wood_teak", "ลายไม้สักทอง"]];
const list = Object.values(PRODUCTS).filter((p) => p && p.id && !p.pickerHide);
const rows = [];
let moved = 0, big = 0;
for (const p of list) {
  const spec = Object.fromEntries((p.specOpts || []).map((o) => [o.key, o.def ?? o.opts?.[0] ?? ""]));
  const d = p.defaults || { w: 200, h: 200, p: 1 };
  for (const [ck, cname] of COLORS) {
    const inp = { ...d, form: p.defForm, material: p.defMaterial, glassType: p.defGlass, spec, addons: {}, color: cname, colorKey: ck };
    let a, b;
    try { a = computeCost(OLD, p, inp); b = computeCost(NEW, p, inp); } catch { continue; }
    const oa = Number(a.cost?.total) || 0, ob = Number(b.cost?.total) || 0;
    if (!(oa > 0) && !(ob > 0)) continue;
    const pct = oa > 0 ? (ob - oa) / oa * 100 : 0;
    if (Math.abs(pct) >= 0.5) moved++;
    if (Math.abs(pct) >= 10) big++;
    rows.push([p.id, p.label || "", cname, Math.round(oa), Math.round(ob), Math.round(ob - oa), Math.round(pct * 10) / 10,
      Math.round(Number(a.cost?.alu) || 0), Math.round(Number(b.cost?.alu) || 0),
      Math.round(Number(a.cost?.bake) || 0), Math.round(Number(b.cost?.bake) || 0)]);
  }
}
rows.sort((x, y) => Math.abs(y[6]) - Math.abs(x[6]));
console.log("เทียบ " + rows.length + " เคส (" + list.length + " รุ่น × 4 สี)");
console.log("  ทุนขยับ ≥0.5% : " + moved + " เคส · ขยับ ≥10% : " + big + " เคส");
console.log("\n── 15 เคสที่ขยับมากสุด ──");
console.log("  รุ่น             สี            ทุนเดิม →  ทุนใหม่    ต่าง");
for (const r of rows.slice(0, 15))
  console.log("  " + String(r[0]).padEnd(16) + String(r[2]).padEnd(14) + String(r[3]).padStart(7) + " → " + String(r[4]).padStart(7) + "  " + (r[6] > 0 ? "+" : "") + r[6] + "%");

writeXlsx(path.join(ROOT, "docs/เทียบทุน-ก่อนหลัง-ราคาอลู3แบรนด์.xlsx"), [{
  name: "เทียบทุน",
  rowStyles: [S.HEAD, S.HEAD],
  widths: [16, 30, 14, 11, 11, 10, 9, 11, 11, 10, 10],
  rows: [
    ["ทุนก่อน/หลัง เปลี่ยนมาคิดราคาอลู = น้ำหนัก × เรตแบรนด์ (ขนาดตั้งต้นของแต่ละรุ่น)"],
    ["รุ่น", "ชื่อ", "สี", "ทุนเดิม", "ทุนใหม่", "ต่าง", "ต่าง %", "ค่าอลูเดิม", "ค่าอลูใหม่", "ค่าอบเดิม", "ค่าอบใหม่"],
    ...rows,
  ],
}]);
console.log("\nเขียน docs/เทียบทุน-ก่อนหลัง-ราคาอลู3แบรนด์.xlsx");
