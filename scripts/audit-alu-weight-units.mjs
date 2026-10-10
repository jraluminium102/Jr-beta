#!/usr/bin/env node
/**
 * audit-alu-weight-units — ไล่เช็คว่าน้ำหนักอลูแต่ละรหัส "ต่อเมตร" หรือ "ต่อเส้น" ถูกช่องไหม
 *   node scripts/audit-alu-weight-units.mjs
 *
 * เจ้าของถาม 10 ต.ค.69 "กลัวว่าบางอันน้ำหนักผิด ไล่เช็คใหม่ได้ไหมว่าเป็น นน./เมตร หรือต่อเส้นกันแน่
 *   ความยาวเส้นคุณคูณให้แล้วใช่ไหมก่อนจะไปราคา"
 *
 * ระบบใช้ 2 ตารางคนละหน่วย — ผิดช่องแล้วเงินเพี้ยนทันที
 *   PB.ALU_KG / PB.ALUWEIGHT = **กก./เส้น**  → ราคาเส้น = กก./เส้น × เรต(แบรนด์, สี)   ไม่คูณความยาวอีก
 *   PB.ALUWEIGHT_KGM        = **กก./เมตร** → ค่าอบ = กก./เมตร × ความยาวเส้นของบรรทัดนั้น (engine คูณให้)
 * ตัวตรวจ: ALU_KG[รหัส] ต้อง ≈ ALUWEIGHT_KGM[รหัส] × ความยาวเส้นของรหัสนั้น
 *   ต่างกันประมาณ "เท่าความยาวเส้น" (6/6.4 เท่า) = มีช่องใดช่องหนึ่งใส่ผิดหน่วย
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));

/** ความยาวเส้นสต็อกของรหัสนั้น (ม.) — B/F = 6.4 · เมืองทอง/SlimLux/Velora = 6 · มือจับ X-J = 2.8 */
function barLen(code) {
  const c = String(code).toUpperCase();
  if (/^JR02891$/.test(c)) return 2.8;                        // มือจับ X-J ขายเป็นท่อน 2.8 ม.
  if (/^(B|F)\d/.test(c)) return 6.4;
  if (/^(WM-|OPK|XSW|E-)/.test(c)) return 6;
  return 6;                                                    // เมืองทอง/ชื่อไทย/JR = 6 ม.
}

const KG = PB.ALU_KG ?? {};
const KGM = PB.ALUWEIGHT_KGM ?? {};
const W = PB.ALUWEIGHT ?? {};
const BR = PB.ALU_BRAND_OF ?? {};
const RATE = PB.ALU_BRAND ?? {};

const rows = [];
for (const code of new Set([...Object.keys(KG), ...Object.keys(KGM)])) {
  const kg = Number(KG[code]) || 0;          // กก./เส้น
  const km = Number(KGM[code]) || 0;         // กก./เมตร
  const L = barLen(code);
  if (!(kg > 0) || !(km > 0)) continue;      // มีแค่ช่องเดียว เทียบไม่ได้
  const want = km * L;
  const ratio = kg / want;
  rows.push({ code, kg, km, L, want: Math.round(want * 1000) / 1000, ratio });
}
rows.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));

const bad = rows.filter((r) => Math.abs(r.ratio - 1) > 0.02);
console.log("รหัสที่มีทั้ง 2 ช่อง " + rows.length + " รหัส · ไม่สอดคล้อง " + bad.length);
if (bad.length) {
  console.log("\n── ❌ กก./เส้น ≠ กก./เมตร × ความยาวเส้น ──");
  console.log("   รหัส      กก./เส้น   กก./ม.   ยาว   ควรเป็น   เท่าตัว   อาการ");
  for (const r of bad) {
    const sym = Math.abs(r.ratio - r.L) < r.L * 0.05 ? "ช่อง กก./ม. ใส่ค่าต่อเส้นมา"
      : Math.abs(r.ratio - 1 / r.L) < 0.05 ? "ช่อง กก./เส้น ใส่ค่าต่อเมตรมา" : "ไม่ตรงกัน (เช็คมือ)";
    console.log("   " + r.code.padEnd(10) + String(r.kg).padStart(8) + String(r.km).padStart(9)
      + String(r.L).padStart(6) + String(r.want).padStart(10) + ("×" + (Math.round(r.ratio * 100) / 100)).padStart(9) + "   " + sym);
  }
}

// ── ② เรตต่อโลที่ย้อนจากราคา: ราคา ÷ กก./เส้น ควรอยู่ในช่วงเรตแบรนด์จริง (150-300) ──
//    ต่ำกว่ามาก = กก./เส้น ใหญ่เกิน (น่าจะใส่ค่าต่อเส้นเป็นค่าต่อเมตร) · สูงมาก = กก. เล็กเกิน
console.log("\n── ② เรตย้อนจากราคา (ราคาขาวในตาราง ÷ กก./เส้น) ต้องใกล้เรตแบรนด์ ──");
const odd = [];
for (const [code, kg] of Object.entries(KG)) {
  const b = BR[code];
  const rate = b && RATE[b] ? Number(RATE[b]["อบขาว"]) || 0 : 0;
  const price = Number((PB.ALUCODE ?? {})[code]) || 0;
  if (!(kg > 0) || !(rate > 0) || !(price > 0)) continue;
  const back = price / kg;
  if (back < rate * 0.45 || back > rate * 2.2) odd.push({ code, kg, price, back: Math.round(back), rate, b });
}
odd.sort((a, c) => a.back - c.back);
console.log("   เส้นที่ย้อนแล้วหลุดกรอบ " + odd.length + " รหัส" + (odd.length ? ":" : " — ไม่มี"));
for (const o of odd)
  console.log("   " + o.code.padEnd(10) + o.b.padEnd(8) + "ราคาไฟล์ " + String(o.price).padStart(7)
    + " ÷ " + String(o.kg).padStart(7) + " กก. = " + String(o.back).padStart(5) + " ฿/กก.  (เรตแบรนด์ " + o.rate + ")");

// ── ③ กก./เส้น ที่ "เล็กผิดปกติ" เทียบกับเส้นอื่นของแบรนด์เดียวกัน ──
console.log("\n── ③ เส้นที่ กก./เส้น ต่ำกว่า 1.0 (เช็คว่าไม่ได้เผลอใส่ค่าต่อเมตร) ──");
const tiny = Object.entries(KG).filter(([, v]) => Number(v) > 0 && Number(v) < 1)
  .map(([c, v]) => ({ c, v, km: KGM[c], w: W[c] }));
for (const t of tiny)
  console.log("   " + t.c.padEnd(10) + "กก./เส้น " + String(t.v).padStart(6)
    + (t.km ? "  · กก./ม. " + t.km + " × " + barLen(t.c) + " = " + Math.round(t.km * barLen(t.c) * 1000) / 1000 : "  · ไม่มีช่อง กก./ม."));
console.log("\n(เส้นบาง ๆ อย่างคิ้ว/ตบ มี กก./เส้น ต่ำกว่า 1 ได้จริง — ดูคู่กับช่อง กก./ม. ว่าหาร/คูณกันลงตัว)");
process.exit(bad.length ? 1 : 0);
