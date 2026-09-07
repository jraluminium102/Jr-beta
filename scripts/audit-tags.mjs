#!/usr/bin/env node
/**
 * audit-tags — ตรวจแท็กในหน้าสโตร์ว่าขึ้นครบ/ไม่ขึ้นมั่ว
 *   node scripts/audit-tags.mjs
 * เจ้าของท้วง 4 ก.ย.69 "เช็คแท็กด้วย บัคอีกไหมทุกอันเลย"
 *
 * ตรวจ 4 ทิศ
 *   ① รหัสอุปกรณ์ทุกตัวที่สูตรคิดราคาอ้าง → ต้องติดแท็ก 🧮 ใช้ในคิดราคา
 *   ② รหัสอลูทุกตัวที่สูตรคิดราคาอ้าง → ต้องติดแท็ก 🧮 (หมวดอลูมิเนียม)
 *   ③ รหัสทุกตัวในใบตัด → ต้องติดแท็ก ✂️ ใช้ในใบตัด
 *   ④ รหัสในใบตัดของรุ่นที่ "คิดราคาดึงของจากใบตัด" → ต้องติดแท็ก 🧮 ด้วย
 */
import { calcLink, isAluCode } from "../src/lib/calculator40/stock-link.ts";
import { isInCutlist } from "../src/lib/cutlist/codes.ts";
import { calcHwSkusViaCutlist } from "../src/lib/calculator40/hardware-from-cutlist.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { collectCodesForSpec } from "../src/lib/cutlist/codes.ts";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

let bad = 0, ok = 0;
const fail = (msg) => { bad++; console.log("❌ " + msg); };
const pass = () => { ok++; };
const codesIn = (v) => {
  const t = String(v ?? "");
  if (!t) return [];
  if (!t.includes("?")) return [t];
  return [...t.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]).filter(Boolean);
};

// ① + ② สูตรคิดราคา
console.log("═══ ① อุปกรณ์/สิ้นเปลืองในสูตรคิดราคา ต้องติดแท็ก 🧮 ═══");
for (const [id, p] of Object.entries(PRODUCTS)) {
  for (const g of ["hardware", "consum"]) for (const it of (p[g] || [])) {
    for (const sku of codesIn(it.sku)) {
      if (calcLink({ sku, name: it.name }).linked) pass();
      else fail(`${id} · ${it.name} (${sku}) — ไม่ติดแท็กคิดราคา`);
    }
  }
  for (const a of (p.alu || [])) for (const c of codesIn(a.code)) {
    if (calcLink({ sku: c, name: a.name }).linked && isAluCode(c)) pass();
    else fail(`${id} · ${a.name} (${c}) — รหัสอลูไม่ติดแท็ก`);
  }
}

// ③ ใบตัด
console.log("═══ ③ รหัสในใบตัดทุกตัว ต้องติดแท็ก ✂️ ═══");
for (const [sid, spec] of Object.entries(CUT_SPEC_BY_ID)) {
  for (const c of collectCodesForSpec(spec)) {
    if (isInCutlist(c)) pass();
    else fail(`${sid} · ${c} — ไม่ติดแท็กใบตัด`);
  }
}

// ④ รุ่นที่คิดราคาดึงของจากใบตัด
console.log("═══ ④ รหัสของรุ่นที่คิดราคาดึงจากใบตัด ต้องติดแท็ก 🧮 ด้วย ═══");
for (const c of calcHwSkusViaCutlist()) {
  if (!/^JR\d{5}$/.test(c)) continue;   // เฉพาะอุปกรณ์ (อลูมีเช็คของตัวเองแล้ว)
  if (calcLink({ sku: c, name: "" }).linked) pass();
  else fail(`${c} — คิดราคาใช้ผ่านใบตัด แต่ไม่ติดแท็กคิดราคา`);
}

console.log(`\n═══ สรุป: ✅ ${ok} ผ่าน · ❌ ${bad} ไม่ผ่าน ═══`);
process.exitCode = bad ? 1 : 0;
