#!/usr/bin/env node
/**
 * gen-r41-compare-data — เว็บตอนนี้ เทียบ ★ ตารางราคาขาย R4.1 ทุกแถว (ทุน/ขาย แยก 3 ก้อน)
 *   node --experimental-strip-types scripts/gen-r41-compare-data.mjs [--stock stock-live.json] [--out data.json]
 *   ข้อมูลตาราง = scripts/fixtures/r41-rows.json (ถอดจาก PDF ด้วย gen-r41-table.mjs)
 *   เว็บ = เอนจินตอนนี้ + ราคาทับจากสโตร์จริง (--stock) · ใช้ในหน้า เทียบค่าอบสี/R4.1 (gen-color-compare-html)
 */
import fs from "node:fs";
import { computeCost, r41Key } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PB0 = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let PB = PB0;
if (arg("--stock")) { const raw = JSON.parse(fs.readFileSync(arg("--stock"), "utf8")); PB = applyPriceOverride(JSON.parse(JSON.stringify(PB0)), buildPriceOverride(raw.rows ?? raw, PB0)); }
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8"));
const R = (v) => Math.round(Number(v) || 0);
// ชื่อหัวตารางที่ฟอนต์ PDF ถอดสระหาย (เฉพาะแถวที่ยังไม่ผูกรุ่น)
const HEADFIX = { "ฝายิปซัมฉาบเรียบ": "ฝ้ายิปซัมฉาบเรียบ", "ฝายิปซัมฉาบเรียบ+ฉนวนrockwool3นิว": "ฝ้ายิปซัมฉาบเรียบ + ฉนวน rockwool 3 นิ้ว", "ฝาไม้เทียม": "ฝ้าไม้เทียม", "พืนสมาร์ทบอร์ด(ไม่รวมเสริมคานทําชันลอย)": "พื้นสมาร์ทบอร์ด (ไม่รวมเสริมคานทำชั้นลอย)", "งานไฟ(ดาวน์ไลท์+สายไฟ)": "งานไฟ (ดาวน์ไลท์ + สายไฟ)" };
const out = [];
for (const r of FX.rows) {
  const p = r.id && PRODUCTS[r.id];
  const base = { head: r.head, id: r.id || null, name: p ? p.name : (HEADFIX[r.head] || r.head), vk: r.vk || "", w: r.w, h: r.h, p: r.p, small: !!r.small, pdf: r.pdf };
  if (!p || !r.inputs) { out.push({ ...base, na: p ? "ไม่มีอินพุต" : "เว็บรวมค่าแรงไว้ในวัสดุ ยังเทียบ 3 ก้อนไม่ได้" }); continue; }
  let c; try { c = computeCost(PB, p, { ...r.inputs }); } catch (e) { out.push({ ...base, na: "คิดไม่ได้: " + String(e.message).slice(0, 60) }); continue; }
  const P = c.sell.parts || { mat: c.sell.beforeLabor, prod: 0, inst: 0 };
  out.push({ ...base, key: r41Key ? r41Key(r.id) : r.id,
    web: { cM: R(c.cost.total), sM: R(P.mat), cP: R(c.labor?.prod), sP: R(P.prod), cI: R(c.labor?.install), sI: R(P.inst),
      cT: R(c.cost.total + (c.labor?.prod || 0) + (c.labor?.install || 0)), sT: R(c.sell.withInstall) } });
}
const file = arg("--out") || "r41-compare.json";
fs.writeFileSync(file, JSON.stringify({ builtAt: new Date().toISOString(), rows: out }));
console.log(file, "· แถว", out.length, "· คิดได้", out.filter((x) => x.web).length);
