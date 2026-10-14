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
import { withSpecDefaults } from "./color-compare-config.mjs";

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
  const base = { head: r.head, id: r.id || null, name: p ? p.name : (HEADFIX[r.head] || r.head), vk: r.vk || "", w: r.w, h: r.h, p: r.p, small: !!r.small, target: r.target ?? null, pdf: r.pdf };
  if (!p || !r.inputs) { out.push({ ...base, na: p ? "ไม่มีอินพุต" : "เว็บรวมค่าแรงไว้ในวัสดุ ยังเทียบ 3 ก้อนไม่ได้" }); continue; }
  let c; try { c = computeCost(PB, p, withSpecDefaults(p, r.inputs)); } catch (e) { out.push({ ...base, na: "คิดไม่ได้: " + String(e.message).slice(0, 60) }); continue; }
  const P = c.sell.parts || { mat: c.sell.beforeLabor, prod: 0, inst: 0 };
  // รายการค่าของ (เจ้าของ 14 ต.ค.69 "แจกแจงค่าของให้ดู ว่าใช้อะไรเท่าไหร่ กี่บาท") — [หมวด, ชื่อ, รหัส, จำนวน, หน่วย, ราคา/หน่วย, รวม]
  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  //   มอเตอร์/ของขายฟิก: บรรทัดเก็บ amount = ราคาขาย (30,000) แต่ที่เข้าทุนค่าของคือ cost (6,200) → ใช้ cost และบอกราคาขายแยกในชื่อ
  const bom = (c.lines || []).filter((l) => l.cat !== "warn" && l.cat !== "labor" && Math.abs(Number(l.amount) || 0) >= 0.005)
    .map((l) => {
      const fixed = !!l.fixedSell && l.cost != null;
      const amt = fixed ? r2(l.cost) : r2(l.amount), qty = r2(l.qty) || 1;
      const sell = fixed ? r2(l.sellFixed != null ? l.sellFixed : l.amount) : null;
      return [l.cat, l.name + (fixed ? ` (ทุน · ขายแยก ${Math.round(sell).toLocaleString("en-US")} ไม่ผ่านกำไร)` : ""), l.code || l.sku || "", qty, l.unit || "", fixed ? r2(amt / qty) : r2(l.unitPrice), amt];
    });
  out.push({ ...base, key: r41Key ? r41Key(r.id) : r.id, bom,
    web: { cM: R(c.cost.total), sM: R(P.mat), cP: R(c.labor?.prod), sP: R(P.prod), cI: R(c.labor?.install), sI: R(P.inst),
      cT: R(c.cost.total + (c.labor?.prod || 0) + (c.labor?.install || 0)), sT: R(c.sell.withInstall) } });
}
// ตัวคูณค่าของในตาราง R4.1 (ขายค่าของ ÷ ทุนค่าของ) เกือบคงที่ต่อรุ่น → ใช้ median ของกลุ่ม (ตัดแถวไซซ์เล็กราคาตายตัว)
//   "ขายถ้าตัวคูณเท่าตาราง" = ปัดร้อย(ทุนเว็บ × ตัวคูณตาราง + ค่าแรงขายตาราง) — เจ้าของ 13 ต.ค.69 "ค่าแรงและการคูณกำไรควรเท่ากัน"
const ceil100 = (v) => Math.ceil(v / 100) * 100;
const grp = new Map();
for (const r of out) { if (!r.web || r.small) continue; const k = (r.key || r.id) + "|" + (r.vk || ""); (grp.get(k) || grp.set(k, []).get(k)).push(r.pdf.sM / r.pdf.cM); }
for (const r of out) {
  if (!r.web) continue;
  const ms = (grp.get((r.key || r.id) + "|" + (r.vk || "")) || []).slice().sort((x, y) => x - y);
  // ตัวคูณที่ใช้คิด = ตัวเดียวกับที่โชว์ (ปัด 2 ตำแหน่ง) → เจ้าของคิดมือแล้วตรงช่อง (ผู้ตรวจบัญชี 13 ต.ค.69)
  const mult = Math.round((ms.length ? ms[ms.length >> 1] : r.pdf.sM / r.pdf.cM) * 100) / 100;
  r.tableMult = mult;
  r.webMult = r.web.cM ? Math.round((r.web.sM / r.web.cM) * 100) / 100 : null;
  // ค่าแรงขายใช้ของเว็บ (= ตารางเมื่อทุนค่าแรงเท่ากัน · รุ่นที่กฎค่าแรงเว็บต่างจากตาราง เช่น หลังคาเลื่อน ใช้ของเว็บ)
  r.sellTM = r.small ? r.pdf.sT : ceil100(r.web.cM * mult + r.web.sP + r.web.sI);
}
const file = arg("--out") || "r41-compare.json";
fs.writeFileSync(file, JSON.stringify({ builtAt: new Date().toISOString(), rows: out }));
console.log(file, "· แถว", out.length, "· คิดได้", out.filter((x) => x.web).length);
