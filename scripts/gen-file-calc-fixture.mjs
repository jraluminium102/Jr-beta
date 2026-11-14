#!/usr/bin/env node
/**
 * gen-file-calc-fixture — ชุดเคสเทียบ "เว็บ ↔ Excel จริง" ของชีตที่พอร์ต 14 พ.ย.69 (ไฟล์ ถอดทุน_รวมทั้งหมด 12 พ.ย.69)
 *   คิดทุน พื้นไม้เทียม · คิดทุน อลูทึบ · คิดทุน ติดตาย (ข้อ 1-2) · คิดทุน บานโซลิด ค่าแรง (ข้อ 24, 29)
 *
 *   ① node scripts/gen-file-calc-fixture.mjs --jobs jobs.json
 *   ② powershell -File scripts/xl/xlcalc2.ps1 -Book <สำเนาไฟล์.xlsx> -Jobs jobs.json -Out excel.json     (เปิด read-only · ใช้สำเนาเสมอ)
 *   ③ node scripts/gen-file-calc-fixture.mjs --merge excel.json     → scripts/fixtures/file-calc-excel.json
 *   แล้วรัน node --experimental-strip-types scripts/verify-file-calc.mjs (ไม่ต้องมี Excel)
 */
import fs from "node:fs";

const FLOOR = "คิดทุน พื้นไม้เทียม", SOLID = "คิดทุน อลูทึบ", FIXED = "คิดทุน ติดตาย", BANSOLID = "คิดทุน บานโซลิด";
const cases = [];

// ── พื้นไม้เทียม ──
const F_MODELS = ["Entrée", "DuraTECH+", "DuraTECH+ Commercial", "DuraTECH+ Anti-Slip", "DuraLIGHT+"];
const F_EDGES = ["Entrée 145 มม.", "Entrée 71 มม.", "DuraTECH+ 140 มม.", "DuraTECH+ 71 มม."];
const F_SIZES = [[3, 4], [2, 8], [5, 6], [2.8, 5.6], [4.2, 3.3], [1.5, 2.35], [6, 6], [8.4, 2.8], [3.35, 7.2], [1, 1], [10, 4.5], [2.35, 2.3], [0.9, 12], [7, 2.1]];
const floorCase = (o) => {
  const c = { w: 3, h: 4, fh: 30, joist: 30, cross: 100, model: "Entrée", edge: "Entrée 145 มม.", dir: "ตามความยาว", ew: 2, el: 2, ...o };
  cases.push({
    kind: "floor", in: c, sheet: FLOOR,
    set: { B4: c.w, B5: c.h, B6: c.fh, B8: c.joist, B9: c.cross, B10: c.model, B11: c.edge, B12: c.dir, B13: c.ew, B14: c.el },
    read: ["B17", "B18", "B19", "B20", "B21", "B22", "B23", "E24", "E25", "E26", "B29", "B31", "B32"],
  });
};
F_SIZES.forEach(([w, h], i) => {
  floorCase({ w, h });
  floorCase({ w, h, dir: "ตามความกว้าง", model: F_MODELS[i % 5], edge: F_EDGES[i % 4] });
});
for (const fh of [0, 10, 11, 50]) floorCase({ fh });
for (const joist of [20, 40, 45]) floorCase({ w: 5, h: 6, joist });
for (const cross of [0, 60, 150]) floorCase({ w: 5, h: 6, cross, dir: "ตามความกว้าง" });
for (const [ew, el] of [[1, 2], [0, 2], [2, 1], [0, 1], [0, 0], [1, 0]]) floorCase({ ew, el });
for (const model of F_MODELS) floorCase({ w: 4.5, h: 7.3, model });
for (const edge of F_EDGES) floorCase({ w: 4.5, h: 7.3, edge, fh: 45 });

// ── อลูทึบ ──
const S_COLORS = ["อบขาว", "ดำ", "เทาซาฮาร่า", "สีดำซาฮาร่า", "แอทแทคเกรย์", "ลายไม้สักทอง", "ลายไม้มะฮอกกานี", "ลายไม้ไวท์โอ๊ค", "สีอบพิเศษ", "สีลายไม้อบพิเศษ"];
const G_COLORS = ["อบขาว", "ดำ", "เทาซาฮาร่า", "ดำซาฮาร่า", "แอทแทคเกรย์", "ลายไม้สักทอง", "ลายไม้มะฮอกกานี", "ลายไม้ไวท์โอ๊ค", "อบสีพิเศษ", "อบลายไม้พิเศษ"];
const S_SIZES = [[90, 200], [150, 240], [120, 240], [60, 60], [240, 120], [300, 300], [110, 210], [80, 205], [45, 95], [250, 260], [130, 130], [200, 90]];
const solidCase = (o) => {
  const c = { kind: "ลูกฟูก เล็ก", thick: "3 มม.", w: 90, h: 200, n: 1, color: "อบขาว", deg: 90, gridM: 0, gridColor: "อบขาว", ...o };
  cases.push({
    kind: "solid", in: c, sheet: SOLID,
    set: { B4: c.kind, B5: c.w, B6: c.h, B7: c.n, B8: c.color, B9: c.thick, B10: c.gridM, B11: c.gridColor, B14: c.deg },
    read: ["B17", "D17", "B18", "B19", "B20", "D20", "B21", "B22", "D22", "E24", "B27", "B28", "B29", "B30", "B31"],
  });
};
const DEGS = [90, 0, 45, 30, 60, 15, 75, 89, 1];
S_SIZES.forEach(([w, h], i) => {
  for (const [j, deg] of DEGS.entries()) if ((i + j) % 3 === 0 || deg === 90 || deg === 0) solidCase({ kind: ["ลูกฟูก เล็ก", "ลูกฟูก กลาง", "ลูกฟูก ใหญ่"][(i + j) % 3], w, h, n: 1 + ((i + j) % 3), deg, color: S_COLORS[(i * 3 + j) % 10] });
  solidCase({ kind: "คอมโพสิต", thick: i % 2 ? "4 มม." : "3 มม.", w, h, n: 1 + (i % 4), color: S_COLORS[i % 10] });
  solidCase({ kind: "แผ่นอลูเรียบ", w, h, n: 1 + (i % 3), color: S_COLORS[(i + 4) % 10] });
});
for (const color of S_COLORS) {
  solidCase({ kind: "ลูกฟูก เล็ก", color }); solidCase({ kind: "ลูกฟูก กลาง", color }); solidCase({ kind: "ลูกฟูก ใหญ่", color });
  solidCase({ kind: "แผ่นอลูเรียบ", color });
}
G_COLORS.forEach((gridColor, i) => solidCase({ kind: i % 2 ? "คอมโพสิต" : "ลูกฟูก เล็ก", gridM: [10, 3.3, 6, 0.5, 25][i % 5], gridColor }));
solidCase({ kind: "คอมโพสิต", w: 120, h: 240, n: 3 }); solidCase({ kind: "แผ่นอลูเรียบ", w: 120, h: 240, n: 2 }); solidCase({ kind: "แผ่นอลูเรียบ", w: 150, h: 260, n: 1 });

// ── ติดตาย (ข้อ 1-2) — ขาว เขียว 6 มม. ──
for (const [w, h, n] of [[50, 50, 1], [150, 200, 1], [300, 250, 2], [450, 250, 3], [140, 35, 1], [600, 250, 4], [150, 150, 1], [90, 240, 1], [235, 185, 2]])
  cases.push({ kind: "fixed", in: { w, h, n }, sheet: FIXED, set: { B2: w, B3: h, B4: n, B5: "ขาว/ดำ", B6: "เขียว 6มม." }, read: ["B13", "B14", "D20"] });

// ── บานโซลิด ค่าแรง (ข้อ 24, 29) ──
for (const [w, h, n] of [[150, 200, 1], [90, 240, 1], [180, 220, 2], [80, 200, 1]])
  for (const model of ["โซลิด 2", "โซลิด 1"])
    cases.push({ kind: "bansolid", in: { w, h, n, model }, sheet: BANSOLID, set: { B3: w, B4: h, B5: n, B10: model }, read: ["B24", "D36", "D37"] });

cases.forEach((c, i) => { c.id = c.kind + "-" + i; });
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (arg("--jobs")) {
  fs.writeFileSync(arg("--jobs"), JSON.stringify(cases.map((c) => ({ id: c.id, sheet: c.sheet, set: c.set, read: c.read }))));
  console.log("jobs", cases.length, "→", arg("--jobs"));
} else if (arg("--merge")) {
  const raw = fs.readFileSync(arg("--merge"), "utf8").replace(/^﻿/, "");
  const res = new Map(JSON.parse(raw).map((r) => [r.id, r.vals]));
  const out = cases.map((c) => ({ id: c.id, kind: c.kind, in: c.in, excel: res.get(c.id) || null }));
  const miss = out.filter((o) => !o.excel).length;
  if (miss) { console.error("❌ ไม่มีผล Excel", miss, "เคส"); process.exit(1); }
  fs.writeFileSync("scripts/fixtures/file-calc-excel.json", JSON.stringify({ source: "ถอดทุน_รวมทั้งหมด_17.xlsx (12 พ.ย.69) · Excel จริงผ่าน scripts/xl/xlcalc2.ps1", generated: new Date().toISOString().slice(0, 10), cases: out }, null, 1));
  console.log("fixture", out.length, "เคส → scripts/fixtures/file-calc-excel.json");
} else console.log("ใช้: --jobs <out.json> | --merge <excel.json>");
