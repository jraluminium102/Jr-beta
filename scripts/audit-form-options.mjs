/**
 * audit-form-options — เทียบ "ตัวเลือก" ระหว่าง ใบตัด ↔ คิดราคา 4.0 ทีละรุ่น
 *
 * ── คิดใหม่ทำใหม่ (เจ้าของ 2 ก.ย.69: "ตอนนี้มันมั่วมากๆๆๆ ... แก้ทั้งวันแล้วยังไม่ได้ตรวจเลย") ──
 * เวอร์ชันแรกผิดวิธีตั้งแต่ต้น: ไปไล่ค้น "ข้อความ" ในไฟล์ .xlsx
 *   → คำสั้นชนคำอื่น · ป้ายเว็บเขียนไม่เหมือนไฟล์ · ต้องมานั่งเดา alias ไม่จบ
 *   → และที่แย่ที่สุด: มันตอบได้แค่ "ของที่เว็บมี อยู่ในไฟล์ไหม"
 *     ไม่เคยถามกลับด้านเลยว่า "ของที่ใบตัดมี เว็บมีให้เลือกครบไหม" ซึ่งคือกฎ ① ทั้งข้อ
 *     (เจ้าของจับได้เอง: บานเลื่อนรางบน ใบตัดมี อิสระ/ลากจูง/เปิดคู่กลาง แต่คิดราคามีแค่ "เลื่อนซ้อน")
 *
 * วิธีใหม่ — ไม่ยุ่งกับ .xlsx เลย เทียบของในระบบกับของในระบบ
 *   ฝั่งใบตัด   = CUT_SPEC_BY_ID (ใบตัดที่พอร์ตจากไฟล์ตัดประกอบเข้าโค้ดแล้ว) — rails + opts[].choices
 *   ฝั่งคิดราคา = PRODUCTS — forms + materials + specOpts[].opts
 *   จับคู่รุ่นด้วย cutInputFromRecipe (ตัวเดียวกับที่ใบตัดจริงใช้) ไม่ใช่เดาจากชื่อ
 * ได้ผลแน่นอน ไม่มี false positive จากการค้นข้อความ และตอบกฎ ① ได้จริง
 *
 *   ① ใบตัดมี · คิดราคาไม่มี  → ต้องเพิ่มในคิดราคา   (ช่องโหว่จริง)
 *   ② คิดราคามี · ใบตัดไม่มี  → ใช้ได้ ไม่ต้องกรอกในใบตัด
 *   ③ ไม่มีทั้งคู่             → ไม่ต้องให้เลือก (ไม่โผล่ในรายงานนี้ เพราะไม่มีในระบบอยู่แล้ว)
 *
 * รัน: node scripts/audit-form-options.mjs [--json]
 *   --json = อบผลลง src/lib/calculator40/form-options-audit.json ให้หน้าเว็บอ่าน
 */
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutInputFromRecipe } from "../src/lib/cutlist/from-recipe.ts";

const norm = (s) => String(s ?? "").replace(/[\s\-–—()"'·.]/g, "").toLowerCase();

/** ตัวเลือกฝั่งใบตัดของรุ่นนี้ (ถ้าผูกใบตัดไว้) */
function cutOptionsOf(p) {
  const d = p.defaults || { w: 150, h: 150, p: 1 };
  let rec;
  try {
    rec = cutInputFromRecipe(
      { kind: "std", prodId: p.id, w: d.w, h: d.h, p: d.p || 1, form: p.defForm, spec: {}, glassType: p.defGlass },
      { rawCompare: true },
    );
  } catch { return null; }
  const spec = rec && CUT_SPEC_BY_ID[rec.spec_id];
  if (!spec) return null;
  const groups = [];
  if (spec.rails?.length > 1) groups.push({ label: "ราง / คอนฟิก", choices: spec.rails });
  for (const o of spec.opts || []) if ((o.choices || []).length > 1) groups.push({ label: o.label || o.key, choices: o.choices });
  return { specId: spec.id, specName: spec.name, groups };
}

/** ตัวเลือกฝั่งคิดราคาของรุ่นนี้ */
function calcOptionsOf(p) {
  const groups = [];
  if ((p.forms || []).length > 1) groups.push({ label: "รูปแบบ", choices: p.forms });
  if ((p.materials || []).length > 1) groups.push({ label: p.materialLabel || "วัสดุ", choices: p.materials });
  for (const so of p.specOpts || []) {
    if (so.type === "number" || !Array.isArray(so.opts) || so.opts.length < 2) continue;
    groups.push({ label: so.label || so.key, choices: so.opts.map((o) => (Array.isArray(o) ? o[0] : o)) });
  }
  return groups;
}

const items = [];
for (const p of Object.values(PRODUCTS)) {
  if (!p || !p.id) continue;
  const cut = cutOptionsOf(p);
  const calc = calcOptionsOf(p);
  const calcAll = new Set(calc.flatMap((g) => g.choices).map(norm));
  const cutAll = new Set((cut?.groups ?? []).flatMap((g) => g.choices).map(norm));

  for (const g of cut?.groups ?? []) {
    const missing = g.choices.filter((c) => c && !calcAll.has(norm(c)));
    if (!missing.length) continue;
    items.push({
      id: p.id, product: p.name, specId: cut.specId, side: "cut", label: g.label,
      all: g.choices, missing,
      // ขาดทั้งกลุ่ม = คิดราคาไม่รู้จักเรื่องนี้เลย · ขาดบางตัว = มีอยู่แล้วแต่ตัวเลือกไม่ครบ
      rule: "①", kind: missing.length === g.choices.length ? "ไม่มีเรื่องนี้เลย" : "มีแล้วแต่ไม่ครบ",
    });
  }
  if (cut) for (const g of calc) {
    const missing = g.choices.filter((c) => c && !cutAll.has(norm(c)));
    if (missing.length !== g.choices.length) continue;   // สนใจเฉพาะกลุ่มที่ใบตัดไม่รู้จักทั้งกลุ่ม
    items.push({
      id: p.id, product: p.name, specId: cut.specId, side: "calc", label: g.label,
      all: g.choices, missing, rule: "②", kind: "ใบตัดไม่ต้องกรอก",
    });
  }
}

// ── รายงาน ──
const one = items.filter((i) => i.rule === "①");
const two = items.filter((i) => i.rule === "②");
const linked = new Set(items.map((i) => i.id));
console.log(`\nรุ่นที่ผูกใบตัดไว้และมีเรื่องต้องดู: ${linked.size}`);
console.log(`  ① ใบตัดมี · คิดราคาไม่มี   ${one.length} กลุ่ม   ← ช่องโหว่จริง ต้องเติม`);
console.log(`  ② คิดราคามี · ใบตัดไม่มี   ${two.length} กลุ่ม   ← ใช้ได้ ไม่ต้องกรอกในใบตัด\n`);

console.log("═══ ① ใบตัดมี แต่คิดราคาไม่มี ═══");
for (const i of one)
  console.log(`  ${i.id.padEnd(16)} ${i.label.padEnd(24)} ${i.kind.padEnd(18)} ขาด: ${i.missing.join(" / ")}`);

if (process.argv.includes("--json")) {
  fs.writeFileSync("src/lib/calculator40/form-options-audit.json",
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), items }, null, 1), "utf8");
  console.log("\nเขียน src/lib/calculator40/form-options-audit.json แล้ว (หน้าเว็บอ่านไฟล์นี้)");
}
