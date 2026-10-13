#!/usr/bin/env node
/**
 * diff-r41-rows — บรรทัดทุน (อลู/กระจก/อุปกรณ์/วัสดุสิ้นเปลือง) ของรุ่นหนึ่ง เรียงเทียบกันทุกขนาดในตาราง R4.1
 *   node --experimental-strip-types scripts/diff-r41-rows.mjs <id> [vk] [--stock stock-live.json]
 *   เช่น  node --experimental-strip-types scripts/diff-r41-rows.mjs euro_slide
 *         node --experimental-strip-types scripts/diff-r41-rows.mjs roof_gable "ชินโคร์ Shade 4มม"
 *
 * ไว้ตอบคำถามแบบ "ทำไม 400×240 4 บาน ทุนโดดเกิน 15% จากตาราง" — ดูว่าเส้น/อุปกรณ์ตัวไหนโผล่/หายหรือโตผิดสัดส่วนกับพื้นที่
 *   แถวล่างสุดบอก ทุนเว็บ vs ทุนตาราง R4.1 (pdf.cM) และ % ต่าง · บรรทัดที่ qty เป็น "-" = ไม่มีในขนาดนั้น
 *   แถวข้อมูล = scripts/fixtures/r41-rows.json (อินพุตเดียวกับหน้า ตรวจราคา 4.0 · ใส่ specOpts default เหมือน UI)
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { applyBootstrap } from "../src/lib/calculator40/bootstrap.mjs";
import { buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";
import { withSpecDefaults } from "./color-compare-config.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const [id, vk = ""] = args;
if (!id || !PRODUCTS[id]) { console.log("ใช้: diff-r41-rows.mjs <id> [vk] · ไม่รู้จักรุ่น " + id); process.exit(1); }
applyBootstrap(PRODUCTS, JSON.parse(fs.readFileSync("src/lib/calculator40/r39-data.json", "utf8")));
let PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
if (arg("--stock")) { const raw = JSON.parse(fs.readFileSync(arg("--stock"), "utf8")); PB = applyPriceOverride(PB, buildPriceOverride(raw.rows ?? raw, PB)); }
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows.filter((r) => r.id === id && (r.vk || "") === vk && r.inputs);
if (!FX.length) { console.log("ไม่มีแถวตาราง R4.1 ของ " + id + (vk ? "|" + vk : "")); process.exit(1); }
const p = PRODUCTS[id];
const cols = FX.map((r) => ({ r, c: computeCost(PB, p, withSpecDefaults(p, r.inputs)) }));
const key = (l) => `${l.cat}|${l.name}|${l.code ?? l.sku ?? ""}`;
const order = []; const seen = new Set();
for (const { c } of cols) for (const l of c.lines) { if (["labor", "warn", "addon"].includes(l.cat)) continue; const k = key(l); if (!seen.has(k)) { seen.add(k); order.push({ k, l }); } }
const R = (v) => Math.round(Number(v) || 0);
const W = 44;
const hdr = cols.map(({ r }) => `${r.w}×${r.h}${r.p ? "/" + r.p : ""}`.padStart(16)).join("");
console.log(`■ ${p.name} (${id}${vk ? " · " + vk : ""}) — qty (จำนวนเส้น/ตร.ม./ชิ้น) · บาท`);
console.log("".padEnd(W + 11) + hdr);
for (const { k, l } of order) {
  const cells = cols.map(({ c }) => { const x = c.lines.find((q) => key(q) === k); return x ? `${(Math.round(x.qty * 100) / 100 + "").padStart(6)} ${String(R(x.amount)).padStart(8)}` : "-".padStart(15); });
  console.log(`${l.cat.padEnd(5)}${l.name.slice(0, W - 2).padEnd(W)}${String(l.code ?? l.sku ?? "").padEnd(6)} ${cells.join(" ")}`);
}
console.log("".padEnd(W + 11) + "-".repeat(cols.length * 16));
const rowOf = (label, f) => console.log(label.padEnd(W + 11) + cols.map((x) => String(f(x)).padStart(16)).join(""));
rowOf("ทุนอลู", ({ c }) => R(c.cost.alu));
rowOf("ค่าอบ+ตู้อบ", ({ c }) => R(c.cost.bake + c.cost.openOven));
rowOf("กระจก", ({ c }) => R(c.cost.glass));
rowOf("อุปกรณ์+สิ้นเปลือง", ({ c }) => R(c.cost.hardware + c.cost.consum));
rowOf("ทุนค่าของ เว็บ", ({ c }) => R(c.cost.total));
rowOf("ทุนค่าของ ตาราง R4.1", ({ r }) => r.pdf?.cM ?? "-");
rowOf("ต่าง %", ({ r, c }) => r.pdf?.cM ? ((c.cost.total / r.pdf.cM - 1) * 100).toFixed(1) + "%" : "-");
rowOf("ทุน/ตร.ม. เว็บ", ({ r, c }) => R(c.cost.total / ((r.w / 100) * (r.h / 100))));
rowOf("ทุน/ตร.ม. ตาราง", ({ r }) => r.pdf?.cM ? R(r.pdf.cM / ((r.w / 100) * (r.h / 100))) : "-");
