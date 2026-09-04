#!/usr/bin/env node
/**
 * เทสมุ้ง FUJI บานเลื่อนสลับ — ยึด 2 ชีตในไฟล์ ตัดประกอบ/JR_FUJI_บานเลื่อน.xlsx
 *   "เลื่อนสลับ(มุ้ง)" (งานนอก) · "เลื่อนสลับ ภายใน+มุ้ง" (งานใน)
 * ตัวเลขทั้งหมดมาจากตาราง "แผงแก้สูตร" ของชีตนั้น ๆ (คอลัมน์ L = จำนวน)
 * ห้ามแก้ตัวเลขในไฟล์นี้โดยไม่เปิดไฟล์ Excel เทียบ
 */
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { computeCutList } from "../src/lib/cutlist/engine.ts";

const spec = CUT_SPEC_BY_ID["fuji_slide"];
let ok = 0, bad = 0;
const rows = (work, mesh) => {
  const r = computeCutList(spec, { ...spec.defaults, W: 350, H: 240, N: 2, rail: "2ราง", work, mesh, glass: 6 });
  const m = new Map();
  for (const p of r.rows) if (p.qty > 0) m.set(p.name, (m.get(p.name) ?? 0) + p.qty);
  return m;
};
const check = (label, got, want) => {
  if (got === want) { ok++; console.log("  ✅ " + label + ": " + got); }
  else { bad++; console.log("  ❌ " + label + ": got=" + got + "  want=" + want); }
};

// ── งานนอก: ไม่มีมุ้ง (ชีต "เลื่อนสลับ") vs มีมุ้ง (ชีต "เลื่อนสลับ(มุ้ง)") ──
console.log("═══ FUJI เลื่อนสลับ งานนอก ═══");
{
  const a = rows("ภายนอก", "ไม่มี"), b = rows("ภายนอก", "มี");
  check("เสา ไม่มีมุ้ง", a.get("เสา"), 4);
  check("เสา มีมุ้ง", b.get("เสา"), 6);
  check("ขวาง มีมุ้ง", b.get("ขวาง"), 6);
  check("คิ้ว ตั้ง มีมุ้ง", b.get("คิ้ว ตั้ง"), 6);
  check("คิ้ว ขวาง มีมุ้ง", b.get("คิ้ว ขวาง"), 6);
  check("คิ้ว ตั้ง มุ้ง F7987", b.get("คิ้ว ตั้ง มุ้ง"), 2);
  check("คิ้ว ขวาง มุ้ง F7987", b.get("คิ้ว ขวาง มุ้ง"), 2);
  check("ต่อราง F7985", b.get("ต่อราง (มุ้ง)"), 1);
  check("ยูข้าง มีมุ้ง", b.get("ยูข้าง"), 3);
  check("ตบยูข้าง มีมุ้ง", b.get("ตบยูข้าง"), 3);
  check("ปิดตบเกี่ยว มีมุ้ง", b.get("ปิดตบเกี่ยว"), 4);
  check("ตบเกี่ยว มีมุ้ง (ไม่เปลี่ยน)", b.get("ตบเกี่ยว"), 2);
  check("ราง มีมุ้ง (ไม่เปลี่ยน)", b.get("ราง"), 3);
  // ขวางงานนอก+มุ้ง ยาวขึ้น 12 ซม. ตามสูตรในชีต +(78x2)+3
  const la = computeCutList(spec, { ...spec.defaults, W: 350, H: 240, N: 2, rail: "2ราง", work: "ภายนอก", mesh: "ไม่มี", glass: 6 }).rows.find((r) => r.name === "ขวาง").len;
  const lb = computeCutList(spec, { ...spec.defaults, W: 350, H: 240, N: 2, rail: "2ราง", work: "ภายนอก", mesh: "มี", glass: 6 }).rows.find((r) => r.name === "ขวาง").len;
  check("ขวาง งานนอก+มุ้ง ยาวขึ้น 12 ซม. (ชีตเขียน +(78x2)+3)", Math.round((lb - la) * 10) / 10, 12);
}

// ── งานใน ──
console.log("═══ FUJI เลื่อนสลับ งานใน ═══");
{
  const a = rows("ภายใน", "ไม่มี"), b = rows("ภายใน", "มี");
  check("เสา ไม่มีมุ้ง", a.get("เสา"), 4);
  check("เสา มีมุ้ง", b.get("เสา"), 6);
  check("ขวาง มีมุ้ง", b.get("ขวาง"), 6);
  check("ต่อราง F7985", b.get("ต่อราง (มุ้ง)"), 1);
  check("ซอยกลาง F7966 (มีเฉพาะงานใน)", b.get("ซอยกลาง (มุ้ง งานใน)"), 1);
  check("ซอยกลาง งานนอกต้องไม่มี", rows("ภายนอก", "มี").get("ซอยกลาง (มุ้ง งานใน)") ?? 0, 0);
  check("ยูข้าง มีมุ้ง", b.get("ยูข้าง"), 3);
  check("ตบกันสาด งานใน+มุ้ง (ชีตมี 1 เส้น)", b.get("ตบกันสาด"), 1);
  check("ตบกันสาด งานในไม่มีมุ้ง = ไม่มี", a.get("ตบกันสาด") ?? 0, 0);
  // งานใน+มุ้ง ยูข้าง หัก 45-45 (= 9.0) ไม่ใช่ 8-45 (= 5.3)
  const lu = computeCutList(spec, { ...spec.defaults, W: 350, H: 240, N: 2, rail: "2ราง", work: "ภายใน", mesh: "มี", glass: 6 }).rows.find((r) => r.name === "ยูข้าง").len;
  check("ยูข้าง งานใน+มุ้ง = สูง−9.0", Math.round(lu * 10) / 10, 231);
}

// ── 3 ราง ไม่มีชีตมุ้ง → ห้ามงอกเส้นมุ้ง ──
console.log("═══ 3 ราง: ไฟล์ไม่มีชีตมุ้ง = ต้องไม่มีเส้นมุ้ง ═══");
{
  const r = computeCutList(spec, { ...spec.defaults, W: 350, H: 240, N: 3, rail: "3ราง", work: "ภายนอก", mesh: "มี", glass: 6 });
  const has = r.rows.some((x) => /มุ้ง/.test(x.name) && x.qty > 0);
  check("3 ราง เลือกมุ้งแล้วต้องไม่มีเส้นมุ้ง", has ? 1 : 0, 0);
  check("3 ราง เสายังเป็น 6 (2×3 บาน)", r.rows.filter((x) => x.name === "เสา").reduce((s, x) => s + x.qty, 0), 6);
}

console.log("\n═══ สรุป: ✅ " + ok + " ผ่าน · ❌ " + bad + " ไม่ผ่าน ═══");
process.exit(bad ? 1 : 0);
