#!/usr/bin/env node
/**
 * audit-labor — ตรวจ "รูปทรงค่าแรง" ของทุกรุ่น เทียบสูตรจริงในไฟล์ถอดทุน
 *   node scripts/audit-labor.mjs
 *
 * ทำไมต้องมี: ค่าแรงในเว็บมี 3 ทรง
 *   rate       = ฐาน + เรต×ตร.ม.
 *   baseOnly   = ฐานอย่างเดียว (laborNoRate)
 *   ×จำนวนบาน = คูณจำนวนบาน (laborPerPanel)
 * เลข "ฐาน/เรต" มีเทสคุมอยู่แล้ว (verify-r40) แต่ "ทรง" ไม่เคยมีใครคุม
 * → 4 ก.ย.69 เจอบานเฟี้ยมยูโรลืม ×จำนวนบาน ค่าแรงขาดไปทั้งใบ
 *
 * วิธีตรวจ: อ่านสูตรช่อง "ค่าแรงผลิต/ติดตั้ง (จากชีทค่าแรง)" ในชีตคิดทุนของแต่ละรุ่น
 *   VLOOKUP("<คีย์ค่าแรง>",ค่าแรง!...,2,0)  → คอลัมน์ 2/4 = ฐาน · 3/5 = เรต/ตร.ม.
 *   ถ้ามี *B<n> ต่อท้าย → คูณเซลล์นั้น (ดูป้ายคอลัมน์ A ของแถวนั้นว่าใช่ "จำนวนบาน" ไหม)
 */
import { openXlsx, readFormulas } from "./dumpxlsx.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const FILE = "ถอดทุน_รวมทั้งหมด v20.1.xlsx";
const x = openXlsx(FILE);

// ป้ายชื่อแถว (คอลัมน์ A) ของแต่ละชีต — ไว้แปลว่า *B4 คือช่องอะไร
const labelsOf = (sh) => {
  const m = new Map();
  for (const r of x.read(sh.path)) if (r.cells.A) m.set(r.row, String(r.cells.A).trim());
  return m;
};

const rows = [];
for (const sh of x.sheets) {
  if (!/^คิดทุน /.test(sh.name)) continue;
  const F = readFormulas(x.zip, sh.path);
  const hit = { prod: null, inst: null };
  for (const r of F) {
    for (const [, f] of Object.entries(r.cells)) {
      if (!/VLOOKUP\(\s*"/.test(f) || !/ค่าแรง!/.test(f)) continue;
      const key = (f.match(/VLOOKUP\(\s*"([^"]+)"/) || [])[1];
      const col = Number((f.match(/ค่าแรง!\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+\s*,\s*(\d+)/) || [])[1]);
      const slot = (col === 2 || col === 3) ? "prod" : (col === 4 || col === 5) ? "inst" : null;
      if (!slot) continue;
      const mul = [...f.matchAll(/\*\s*\$?([A-Z]+)\$?(\d+)/g)].map((m) => m[1] + m[2]);
      const usesRate = /,\s*3\s*,\s*0\)|,\s*5\s*,\s*0\)/.test(f);
      hit[slot] = { key, row: r.row, mul, usesRate, f };
    }
  }
  if (!hit.prod && !hit.inst) continue;
  rows.push({ sheet: sh.name, hit, labels: labelsOf(sh) });
}

// ── เทียบกับเว็บ ──
const byKey = new Map();
for (const [id, p] of Object.entries(PRODUCTS)) {
  if (!p.laborKey) continue;
  if (!byKey.has(p.laborKey)) byKey.set(p.laborKey, []);
  byKey.get(p.laborKey).push(id);
}

let bad = 0, okc = 0, skip = 0;
console.log("═══ ตรวจทรงค่าแรง: ไฟล์ ↔ เว็บ ═══\n");
for (const r of rows) {
  const h = r.hit.prod || r.hit.inst;
  const key = h.key;
  const ids = byKey.get(key) || [];
  const mulCells = [...new Set([...(r.hit.prod?.mul || []), ...(r.hit.inst?.mul || [])])];
  const mulLabels = mulCells.map((c) => {
    const rw = Number(c.replace(/^[A-Z]+/, ""));
    return c + "=" + (r.labels.get(rw) || "?");
  });
  const filePerPanel = mulLabels.some((l) => /จำนวนบาน|จำนวนชุด|จำนวนช่อง/.test(l));
  const fileNoRate = !(r.hit.prod?.usesRate || r.hit.inst?.usesRate);
  if (!ids.length) {
    // ตั้งใจไม่ผูก = รุ่นที่ "ค่าแรงฝังอยู่ในราคาวัสดุ" (ชีตคิดทุนรวมค่าแรงไว้ในทุนรวมแล้ว)
    //   ชีตอื่นที่ไม่มีรุ่นผูก = ต้องขึ้นแดง เพราะแปลว่าใส่ laborKey ผิด (เจอจริง 4 ก.ย.69: ระแนงสลับ)
    const OKUNBOUND = {
      "บานตู้ Futuretech": "cabinet_face คิดค่าแรงในบรรทัดวัสดุ",
      "ชุด Shower": "shower คิดค่าแรงในบรรทัดวัสดุ",
      "ราวกันตก": "handrail คิดค่าแรงในบรรทัดวัสดุ",
    };
    if (!OKUNBOUND[key]) {
      bad++;
      console.log("❌ " + r.sheet.padEnd(26) + ' คีย์ค่าแรง "' + key + '" ไม่มีรุ่นไหนในเว็บใช้ — เช็คว่าใส่ laborKey ผิดหรือเปล่า');
      continue;
    }
    skip++;
    console.log("⏭  " + r.sheet.padEnd(26) + ' คีย์ "' + key + '" — ' + OKUNBOUND[key]);
    continue;
  }
  for (const id of ids) {
    const p = PRODUCTS[id];
    const webPerPanel = !!p.laborPerPanel, webNoRate = !!p.laborNoRate;
    const okP = webPerPanel === filePerPanel, okR = webNoRate === fileNoRate;
    if (okP && okR) { okc++; continue; }
    bad++;
    console.log(`❌ ${id.padEnd(14)} (${r.sheet})`);
    if (!okP) console.log(`     ×จำนวนบาน: ไฟล์=${filePerPanel ? "ใช่" : "ไม่"} · เว็บ=${webPerPanel ? "ใช่" : "ไม่"}   [${mulLabels.join(" · ") || "ไม่มีตัวคูณ"}]`);
    if (!okR) console.log(`     ฐานอย่างเดียว: ไฟล์=${fileNoRate ? "ใช่" : "ไม่"} · เว็บ=${webNoRate ? "ใช่" : "ไม่"}`);
    console.log(`     สูตรในไฟล์: ${(r.hit.prod || r.hit.inst).f.slice(0, 150)}`);
  }
}
// รุ่นในเว็บที่ไม่มีชีตคิดทุนให้ตรวจ
const seen = new Set(rows.map((r) => (r.hit.prod || r.hit.inst).key));
const noSheet = [...byKey.entries()].filter(([k]) => !seen.has(k));
if (noSheet.length) {
  console.log("\n── รุ่นที่ไม่มีชีตคิดทุนในไฟล์ v20.1 (ตรวจทรงค่าแรงอัตโนมัติไม่ได้) ──");
  for (const [k, ids] of noSheet) console.log("   " + k.padEnd(24) + " ← " + ids.join(", "));
}
console.log(`\n═══ สรุป: ✅ ${okc} ตรง · ❌ ${bad} ไม่ตรง · ⏭ ${skip} ไม่มีรุ่นผูก · ${noSheet.length} คีย์ไม่มีชีต ═══`);
if (bad) process.exitCode = 1;

// ── ② ตัวเลขค่าแรงในเว็บ (pricebook LABOR) ต้องตรงชีต "ค่าแรง" แถวต่อแถว ──
//    B=ฐานผลิต · C=เรตผลิต/ตร.ม. · D=ฐานติดตั้ง · E=เรตติดตั้ง/ตร.ม.
{
  const fsx = await import("node:fs");
  const PB = JSON.parse(fsx.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
  const sh = x.sheets.find((s) => s.name === "ค่าแรง");
  const file = new Map();
  for (const r of x.read(sh.path)) {
    const k = String(r.cells.A ?? "").trim();
    if (!k || r.row < 12) continue;
    const n = (v) => (v === undefined || v === "" ? 0 : Math.round(Number(v) * 10000) / 10000);
    file.set(k, { pBase: n(r.cells.B), pRate: n(r.cells.C), iBase: n(r.cells.D), iRate: n(r.cells.E) });
  }
  let b2 = 0, o2 = 0, miss = [];
  console.log("\n═══ ตัวเลขค่าแรง: pricebook ↔ ชีต \"ค่าแรง\" ═══");
  for (const [k, w] of Object.entries(PB.LABOR)) {
    const f = file.get(k);
    if (!f) { miss.push(k); continue; }
    const same = ["pBase", "pRate", "iBase", "iRate"].every((c) => Math.abs((w[c] ?? 0) - f[c]) < 0.01);
    if (same) { o2++; continue; }
    b2++;
    console.log(`❌ ${k}`);
    console.log(`     เว็บ  ${JSON.stringify(w)}`);
    console.log(`     ไฟล์ ${JSON.stringify(f)}`);
  }
  if (miss.length) console.log("⏭  คีย์ในเว็บที่ไม่มีในชีตค่าแรง: " + miss.join(" · "));
  console.log(`\n═══ สรุปตัวเลข: ✅ ${o2} ตรง · ❌ ${b2} ไม่ตรง · ⏭ ${miss.length} ไม่มีในชีต ═══`);
  if (b2) process.exitCode = 1;
}
