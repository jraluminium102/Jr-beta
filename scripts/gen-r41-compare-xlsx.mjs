#!/usr/bin/env node
/**
 * gen-r41-compare-xlsx — ตารางเทียบ "ราคาเว็บ ↔ ★ ตารางราคาขาย R4.1" ทุกแถว
 *   node scripts/gen-r41-compare-xlsx.mjs
 *   ออก: docs/เทียบราคาเว็บ-R4.1.xlsx
 *
 * ข้อมูลตาราง R4.1 = scripts/fixtures/r41-rows.json (ถอดจาก PDF ด้วย gen-r41-table.mjs)
 * เว็บ = computeCost ด้วยอินพุตเดียวกับที่ตารางใช้ (ช่อง inputs ในแต่ละแถว)
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { writeXlsx, S } from "./xlsxwrite.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8"));
const rows = FX.rows || FX;
const n0 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : "");
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : "");

const HEAD = ["รุ่น (ตาราง R4.1)", "รหัสรุ่น", "ขนาด", "บาน",
  "ขายรวม — ตาราง", "ขายรวม — เว็บ", "ต่าง (บาท)", "ต่าง %",
  "ค่าผลิต ขาย — ตาราง", "ค่าผลิต ขาย — เว็บ", "ค่าติดตั้ง ขาย — ตาราง", "ค่าติดตั้ง ขาย — เว็บ",
  "ทุนรวม — ตาราง", "ทุนรวม — เว็บ", "ทุนค่าแรงตรงตารางไหม", "สถานะ", "หมายเหตุ"];
const out = [], bad = [];
for (const r of rows) {
  const p = PRODUCTS[r.id];
  const size = `${r.w}×${r.h}`;
  if (!p) { out.push([r.head, r.id || "—", size, r.p || "", n0(r.pdf?.sT), "", "", "", n0(r.pdf?.sP), "", n0(r.pdf?.sI), "", n0(r.pdf?.cT), "", "—", "เทียบไม่ได้", "ไม่มีรุ่นนี้ในคิดราคา 4.0"]); continue; }
  let c;
  try { c = computeCost(PB, p, { ...(r.inputs || {}), spec: r.inputs?.spec || {}, addons: {} }); }
  catch (e) { out.push([r.head, r.id, size, r.p || "", n0(r.pdf?.sT), "", "", "", "", "", "", "", "", "", "—", "เทียบไม่ได้", String(e.message).slice(0, 60)]); continue; }
  const sT = r.pdf?.sT, webT = c.sell?.withInstall;
  const d = (webT || 0) - (sT || 0), dp = pct(webT || 0, sT || 0);
  const dP = Math.abs((c.labor?.prod||0) - (r.pdf?.cP||0)), dI = Math.abs((c.labor?.install||0) - (r.pdf?.cI||0));
  const labOk = (r.pdf?.cP==null&&r.pdf?.cI==null) ? "—" : (dP <= 2 && dI <= 2) ? "ตรง" : "ไม่ตรง (สูตรค่าแรง)";
  const st = !(sT > 0) ? "ตารางไม่มีราคา" : Math.abs(dp) <= 1 ? "ตรง" : Math.abs(dp) <= 5 ? "ต่างน้อยกว่า 5%" : "ต่างเกิน 5%";
  const row = [r.head, r.id, size, r.p || "", n0(sT), n0(webT), n0(d), dp, n0(r.pdf?.sP), n0(c.sell?.parts?.prod),
    n0(r.pdf?.sI), n0(c.sell?.parts?.inst), n0(r.pdf?.cT), n0(c.cost?.total), labOk, st, r.note || ""];
  out.push(row);
  if (st === "ต่างเกิน 5%") bad.push(row);
}
const STY = { "ตรง": S.GREEN, "ต่างน้อยกว่า 5%": S.YELLOW, "ต่างเกิน 5%": S.RED, "เทียบไม่ได้": S.GREY, "ตารางไม่มีราคา": S.GREY };
const sty = (rs) => [0, ...rs.map((r) => STY[r[15]] ?? 0)];
const W = [30, 14, 12, 6, 14, 13, 11, 8, 16, 15, 17, 16, 14, 12, 20, 16, 40];
// สรุปต่อรุ่น
const byProd = new Map();
for (const r of out) {
  const k = r[1];
  const e = byProd.get(k) || { name: r[0], n: 0, ok: 0, near: 0, off: 0, na: 0 };
  e.n++;
  if (r[15] === "ตรง") e.ok++; else if (r[15] === "ต่างน้อยกว่า 5%") e.near++;
  else if (r[15] === "ต่างเกิน 5%") e.off++; else e.na++;
  byProd.set(k, e);
}
const sum = [["รุ่น", "รหัส", "แถวทั้งหมด", "ตรง", "ต่าง <5%", "ต่าง >5%", "เทียบไม่ได้"]];
for (const [k, e] of [...byProd].sort((a, b) => b[1].off - a[1].off)) sum.push([e.name, k, e.n, e.ok, e.near, e.off, e.na]);
const howto = [["ช่อง", "แปลว่าอะไร"],
  ["ขายรวม — ตาราง", "ราคาขายในไฟล์ ★ ตารางราคาขาย R4.1 (ช่องราคาขายรวมทั้งชุด)"],
  ["ขายรวม — เว็บ", "ราคาที่คิดราคา 4.0 คิดได้ ด้วยขนาด/จำนวนบานเดียวกัน (สีขาว ไม่มีของเสริม)"],
  ["ตรง", "ต่างไม่เกิน 1% — ถือว่าตรงตาราง"],
  ["ต่างน้อยกว่า 5%", "ยังอยู่ในช่วงที่ยอมรับได้ (กำไรค่าของตั้งต้นจูนไว้ที่ ±5%)"],
  ["ต่างเกิน 5%", "ต้องดู — อาจต้องจูน % กำไรค่าของของรุ่นนั้น หรือสูตรค่าแรงไม่ตรงตาราง"],
  ["เทียบไม่ได้", "เว็บยังไม่มีรุ่น/ขนาดนั้น หรือค่าแรงยังรวมอยู่ในค่าวัสดุ"],
  ["ทุนค่าแรงตรงตารางไหม", "ไม่ตรง = สูตรค่าแรงของรุ่นนั้นคิดคนละทางกับตาราง — แก้ด้วยกำไรค่าของไม่ได้ ต้องแก้สูตรค่าแรง"]];
writeXlsx("docs/เทียบราคาเว็บ-R4.1.xlsx", [
  { name: "อ่านยังไง", rows: howto, widths: [26, 80] },
  { name: "สรุปต่อรุ่น", rows: sum, widths: [30, 14, 11, 8, 10, 10, 12] },
  { name: "🔴 ต่างเกิน 5%", rows: [HEAD, ...bad], widths: W, rowStyles: sty(bad) },
  { name: "ทุกแถว", rows: [HEAD, ...out], widths: W, rowStyles: sty(out) },
]);
const c = (k) => out.filter((r) => r[15] === k).length;
console.log("docs/เทียบราคาเว็บ-R4.1.xlsx · แถวทั้งหมด", out.length,
  "· ตรง", c("ตรง"), "· ต่าง<5%", c("ต่างน้อยกว่า 5%"), "· ต่าง>5%", c("ต่างเกิน 5%"), "· เทียบไม่ได้", out.length - c("ตรง") - c("ต่างน้อยกว่า 5%") - c("ต่างเกิน 5%"));
