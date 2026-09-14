/**
 * verify-vat-receipt — เทสว่า "ใบวางบิลมี VAT → ใบเสร็จต้องมี VAT" (14 ก.ย.69)
 *
 * รัน:  node --experimental-strip-types scripts/verify-vat-receipt.mjs
 * import โค้ดจริง billVatDecision/effectiveBillVat/splitCashReceived จาก src/lib/money.ts
 *
 * เคสจริง: บิล BL2569090042 (จากใบเสนอ QT2569090029 · VAT 7%)
 *   ใบวางบิลเก็บ vat_rate=7 (footer โชว์ VAT 8,295) แต่ vat_rate_set=false
 *   งวดแบ่งด้วย suggestInstallments (ไม่มี base_amt ต่องวด) → ใบเสร็จใช้ effectiveBillVat
 *   ก่อนแก้: vat_rate_set=false → known=false → fallback jobs.vat_rate=0 → VAT หาย (บั๊ก)
 *   หลังแก้: vat_rate>0 → known=true → ใบเสร็จถอด VAT 7% จากยอดงวด (รวม VAT อยู่แล้ว)
 */
import { billVatDecision, effectiveBillVat, splitCashReceived } from "../src/lib/money.ts";

let pass = 0, fail = 0;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const check = (name, got, exp, tol = 0.01) => {
  const ok = Math.abs(got - exp) <= tol;
  console.log(`${ok ? "✅" : "❌"} ${name}: got ${round2(got)} · exp ${exp}`);
  ok ? pass++ : fail++;
};

// ── บิลจริง: มี VAT booked (vat_rate=7, vat_amt=8295) แต่ vat_rate_set=false + jobs.vat_rate=0 (เคสที่ VAT หาย) ──
const billHasVat = { vat_rate: 7, vat_rate_set: false, vat_amt: 8295 };
const jobVatRate0 = 0;

// 1) billVatDecision: ใบมี vat_rate>0 → ต้อง known=true rate=7
const d = billVatDecision(billHasVat);
console.log(`billVatDecision(vat_rate=7, set=false) → known=${d.known} rate=${d.rate}`);
check("known rate", d.rate, 7);
if (d.known !== true) { console.log("❌ known ต้องเป็น true (ใบมี VAT ชัด)"); fail++; } else pass++;

// 2) effectiveBillVat: ต้องได้ 7 (ไม่หล่นไป jobs.vat_rate=0)
check("effectiveBillVat (บิลมี VAT + jobs.vat_rate=0)", effectiveBillVat(billHasVat, jobVatRate0), 7);

// 3) ออกใบเสร็จงวด 2 = 63,397.50 (ยอดรวม VAT แล้ว · ไม่มี WHT) → ถอด VAT 7%
//    ฐาน = 63,397.50 / 1.07 = 59,250.00 · VAT = 4,147.50
const g2 = splitCashReceived(63397.50, effectiveBillVat(billHasVat, jobVatRate0), 0);
check("งวด2 ฐานก่อน VAT", g2.base, 59250.00);
check("งวด2 VAT (ต้องไม่เป็น 0)", g2.vat, 4147.50);
if (g2.vat <= 0) { console.log("❌ VAT งวด2 เป็น 0 = บั๊กยังอยู่"); }

// 4) งวด 3 ค่าแรง = 12,679.50 (รวม VAT · ไม่มี WHT ระดับใบ) → VAT = 12,679.50 − 12,679.50/1.07
const g3 = splitCashReceived(12679.50, effectiveBillVat(billHasVat, jobVatRate0), 0);
check("งวด3 VAT (ต้องไม่เป็น 0)", g3.vat, round2(12679.50 - 12679.50 / 1.07));

// 5) regression: ใบ No-VAT ยืนยันแล้ว (vat_rate=0, set=true) → known=true rate=0 (ไม่กระทบ)
const noVat = billVatDecision({ vat_rate: 0, vat_rate_set: true });
if (noVat.known === true && noVat.rate === 0) { console.log("✅ No-VAT ยืนยันแล้ว ยัง known=true rate=0"); pass++; }
else { console.log(`❌ No-VAT เพี้ยน: known=${noVat.known} rate=${noVat.rate}`); fail++; }

// 6) regression: ใบเก่า import (vat_rate=0, set=false) → known=false (fallback jobs.vat_rate เหมือนเดิม)
const oldImport = billVatDecision({ vat_rate: 0, vat_rate_set: false });
if (oldImport.known === false) { console.log("✅ ใบเก่า import (vat_rate=0,set=false) ยัง known=false (fallback งานเหมือนเดิม)"); pass++; }
else { console.log(`❌ ใบเก่า import ไม่ควร known: known=${oldImport.known}`); fail++; }

// 7) ★ regression สำคัญ: ใบเก่า vat_rate=7 ค้าง แต่ยอด flatten ไม่มี VAT จริง (vat_amt=0) → ต้อง known=false (ห้ามเชื่อ · กฎ 15 ก.ค.)
const staleRate = billVatDecision({ vat_rate: 7, vat_rate_set: false, vat_amt: 0 });
if (staleRate.known === false) { console.log("✅ ใบเก่า vat_rate=7 ค้าง (vat_amt=0) → known=false (ไม่เชื่ออัตราค้าง)"); pass++; }
else { console.log(`❌ ใบ vat_rate ค้าง (vat_amt=0) ไม่ควร known: known=${staleRate.known}`); fail++; }

console.log(`\n${fail === 0 ? "🟢 ผ่านหมด" : "🔴 มีพลาด"} — pass ${pass} · fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
