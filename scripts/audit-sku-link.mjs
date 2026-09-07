#!/usr/bin/env node
/**
 * audit-sku-link — ไล่ดูว่า "คิดราคา 4.0" กับ "ใบตัด" ผูกรหัสสโตร์ตรงกันไหม ทุกรุ่น
 *   node scripts/audit-sku-link.mjs
 *
 * ทำไมต้องมี (เจ้าของเจอเอง 4 ก.ย.69: SMS ล้อ คิดราคา JR00228 · ใบตัด JR00576):
 *   ปกติค่าของดึงจากใบตัด → รหัสในสูตรคิดราคาเป็น "ตัวสำรอง" ที่ผิดอยู่เงียบ ๆ ได้
 *   หน้าเทียบก็ไม่จับ เพราะตอนนั้นมันเทียบใบตัดกับใบตัด
 *
 * รายงาน 3 กลุ่ม
 *   ① ชื่อคล้ายกันแต่คนละรหัส  ← อันตรายสุด (ของชิ้นเดียวกันแต่ตัดสต็อกคนละตัว)
 *   ② มีเฉพาะฝั่งคิดราคา
 *   ③ มีเฉพาะฝั่งใบตัด
 */
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutInputFromRecipe } from "../src/lib/cutlist/from-recipe.ts";
import { COMPARABLE } from "../src/lib/calculator40/compare-cut.ts";

// ชื่อ → คีย์เทียบ: ตัดวงเล็บ/ตัวเลขขนาด/คำฟุ่มเฟือย ให้เหลือ "แก่น" ของชื่อ
const key = (s) => String(s || "")
  .replace(/\([^)]*\)/g, " ")
  .replace(/[A-Za-z]?\d+([.x×-]\d+)*\s*(มม\.?|ซม\.?|กก\.?|หุน|"|”)?/g, " ")
  .replace(/ต่อบาน|\/บาน|2ฝั่ง|ชุด|ตัว|อัน|เส้น|บาน/g, " ")
  .replace(/\s+/g, " ").trim();

// รหัสฝั่งคิดราคาเขียนเป็น "สูตร" ได้ (เลือกตามสี เช่น ดำ/ขาว) → ต้องคลี่ออกก่อน
//   ไม่งั้นจะรายงานผิดว่าไม่ตรง ทั้งที่จริงตรง (คนละสีเฉย ๆ)
const SKU_RE = /JR\d{5}|HD-\d+/g;
const skusOf = (v) => {
  if (typeof v !== "string" || !v) return [];
  const hit = v.match(SKU_RE);
  return hit ? [...new Set(hit)] : [];
};
const calcRows = (id) => {
  const p = PRODUCTS[id] || {};
  const out = [];
  for (const g of ["hardware", "consum"]) for (const it of (p[g] || []))
    for (const sku of skusOf(it?.sku)) out.push({ name: it.name, sku });
  return out;
};
const cutRows = (specId) => {
  const spec = CUT_SPEC_BY_ID[specId];
  if (!spec) return [];
  const d = spec.defaults || {};
  const out = [];
  for (const h of (spec.hardware || [])) {
    let sku, name;
    // เรียกหลายสี/หลายตัวเลือก เพื่อเก็บรหัสให้ครบ (บางแถวเลือกรหัสตามสีอุปกรณ์)
    const variants = [d, { ...d, hwColor: "ดำ" }, { ...d, handleColor: "ดำ" }, { ...d, slxhwcolor: "ดำ" }, { ...d, hwcolor: "ดำ" }];
    const got = new Set();
    for (const v of variants) { try { const x = typeof h.sku === "function" ? h.sku(v) : h.sku; if (typeof x === "string" && x) got.add(x); } catch { /* ข้าม */ } }
    sku = [...got];
    try { name = typeof h.name === "function" ? h.name(d) : h.name; } catch { name = "?"; }
    for (const one of sku) out.push({ name, sku: one });
  }
  return out;
};
// รุ่น → spec ใบตัด (ใช้ทางเดียวกับของจริง: แปลงสูตรใบเสนอ → อินพุตใบตัด)
const specOf = (id) => {
  const p = PRODUCTS[id];
  const form = p?.defForm ?? (p?.forms || [])[0] ?? "";
  for (const n of [p?.defaults?.p ?? 2, 2, 4, 1]) {
    try {
      const m = cutInputFromRecipe({ v: 1, kind: "std", prodId: id, w: 300, h: 240, p: n, form, glassType: "เขียว 6มม.", spec: {}, addons: {} }, { rawCompare: true });
      if (m?.spec_id) return m.spec_id;
    } catch { /* ลองจำนวนบานถัดไป */ }
  }
  return null;
};

let mismatch = 0, onlyCalc = 0, onlyCut = 0, checked = 0;
const lines = [];
for (const id of [...COMPARABLE].sort()) {
  const specId = specOf(id);
  if (!specId) { lines.push(`⏭  ${id.padEnd(13)} ยังแปลงเป็นใบตัดไม่ได้ (ไม่มี spec)`); continue; }
  checked++;
  const C = calcRows(id), K = cutRows(specId);
  const cSku = new Set(C.map((x) => x.sku)), kSku = new Set(K.map((x) => x.sku));
  const rep = [];
  // ① ชื่อคล้ายแต่คนละรหัส
  for (const c of C) {
    if (kSku.has(c.sku)) continue;
    const kk = key(c.name);
    if (!kk) continue;
    const hit = K.find((x) => !cSku.has(x.sku) && key(x.name) && (key(x.name) === kk || key(x.name).startsWith(kk) || kk.startsWith(key(x.name))));
    if (hit) { rep.push(`   ❗ ${c.name} = ${c.sku}  ↔  ใบตัด "${hit.name}" = ${hit.sku}`); mismatch++; }
  }
  // ②③ มีข้างเดียว
  for (const c of C) if (!kSku.has(c.sku) && !rep.some((r) => r.includes(c.sku))) { rep.push(`   ▸ มีเฉพาะคิดราคา: ${c.name} = ${c.sku}`); onlyCalc++; }
  for (const k of K) if (!cSku.has(k.sku) && !rep.some((r) => r.includes(k.sku))) { rep.push(`   ◂ มีเฉพาะใบตัด:   ${k.name} = ${k.sku}`); onlyCut++; }
  if (rep.length) lines.push(`\n▶ ${id} (ใบตัด: ${specId})\n` + rep.join("\n"));
  else lines.push(`✅ ${id.padEnd(13)} ตรงกันทุกรหัส (${cSku.size} รหัส)`);
}
console.log("═══ คิดราคา 4.0 ↔ ใบตัด: ผูกรหัสสโตร์ตรงกันไหม ═══");
console.log(lines.join("\n"));
console.log(`\n═══ สรุป: ตรวจ ${checked} รุ่น · ❗ ชื่อเดียวกันคนละรหัส ${mismatch} · ▸ มีเฉพาะคิดราคา ${onlyCalc} · ◂ มีเฉพาะใบตัด ${onlyCut} ═══`);
