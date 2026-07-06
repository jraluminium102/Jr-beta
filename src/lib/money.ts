// ============================================================
// สูตรคำนวณยอดเงิน — แหล่งความจริงเดียว (กฎเหล็ก: ยอดต้องตรง)
// ลำดับ: (ยอดรวม − ส่วนลด) → VAT → (− หัก ณ ที่จ่าย) = ยอดรับสุทธิ
// ============================================================
import type { QuotationItem } from "./types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// VAT/หัก ณ ที่จ่าย ปัดเป็น "บาทเต็ม" ให้ตรงกับเอกสารจริง (ทุกใบโชว์บาทเต็ม)
const roundBaht = (n: number) => Math.round(n + Number.EPSILON);

export interface MoneyInput {
  items: Pick<QuotationItem, "qty" | "unit_price">[];
  vat_rate: number; // 0 | 7
  discount_pct: number; // 0–100 (เจ้าของสั่งกรอกอิสระ 3ก.ค.69 · เดิม ≤2 · กรอกบาทได้ที่ UI แล้วแปลงกลับเป็น % ปัด 2 ตำแหน่ง)
  wht_rate: number; // 0 | 1 | 2 | 3 | 5
}

export interface MoneyResult {
  subtotal: number;
  discount_amt: number;
  after_discount: number;
  vat_amt: number;
  total: number;
  wht_amt: number;
  net: number;
}

export function computeTotals(input: MoneyInput): MoneyResult {
  const subtotal = round2(
    input.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0)
  );
  const discount_amt = round2((subtotal * (Number(input.discount_pct) || 0)) / 100);
  const after_discount = round2(subtotal - discount_amt);
  const vat_amt = roundBaht((after_discount * (Number(input.vat_rate) || 0)) / 100);
  const total = round2(after_discount + vat_amt);
  const wht_amt = roundBaht((after_discount * (Number(input.wht_rate) || 0)) / 100);
  // net = round2 (2 ตำแหน่ง) ไม่ปัดบาทเต็ม — suggestInstallments รองรับสตางค์แล้ว ผลรวมงวด = net เป๊ะ
  // vat_amt/wht_amt ยังเป็นบาทเต็ม (roundBaht) เพราะกรมสรรพากรกำหนดให้ปัดบาท ไม่เปลี่ยน
  const net = round2(total - wht_amt);
  return { subtotal, discount_amt, after_discount, vat_amt, total, wht_amt, net };
}

export const lineTotal = (qty: number, unit_price: number) =>
  round2((Number(qty) || 0) * (Number(unit_price) || 0));

export const baht = (n: number) =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ============================================================
// แบ่งงวดชำระอัตโนมัติตามยอดสุทธิ (PRD P0-5)
// ⏳ Q-2: งวด 4-5 "เหลือ-40k" ตีความว่ากันเงินประกัน 40,000 ไว้งวดสุดท้าย
//          (รอพี่นัทยืนยันสูตรชัด — ปรับ RETENTION ได้ที่นี่จุดเดียว)
//
// [DECIMAL FIX] รองรับสตางค์ (2 ตำแหน่ง) ครบลูกโซ่:
//   - a = round2(net) ไม่ปัดบาทเต็มอีกต่อไป
//   - งวดที่คิด %: round2(a * pct)
//   - งวด "ส่วนที่เหลือ" = round2(a - ผลรวมงวดอื่น) → อุ้มเศษสตางค์
//   - ผลรวมทุกงวด = a เป๊ะเสมอ (constraint tg_check_installment_sum tol 0.01 ผ่านแน่)
// ============================================================
export interface InstallmentPlan {
  seq: number;
  label: string;
  amount: number;
}

const RETENTION = 40000; // เงินประกันงวดท้าย (4-5 งวด) — คงเป็นจำนวนเต็ม (ตกลงกับลูกค้าไว้ชัดเจน)

export function suggestInstallments(net: number): InstallmentPlan[] {
  // round2 (ไม่ใช่ Math.round) — คงสตางค์ไว้ ไม่ปัดเป็นบาทเต็ม
  const a = Math.max(0, round2(Number(net) || 0));
  const mk = (parts: number[], labels: string[]): InstallmentPlan[] =>
    parts.map((amt, i) => ({ seq: i + 1, label: labels[i], amount: amt }));

  if (a <= 100000) {
    // 2 งวด: 70% / 30%
    // งวด 2 = เหลือ → อุ้มเศษสตางค์ (ผลรวม = a เป๊ะ)
    const g1 = round2(a * 0.7);
    return mk([g1, round2(a - g1)], ["งวด 1/2 (70%)", "งวด 2/2 (30%)"]);
  }
  if (a <= 300000) {
    // 3 งวด: 40% / 50% / 10%
    // งวด 3 = เหลือ → อุ้มเศษสตางค์
    const g1 = round2(a * 0.4), g2 = round2(a * 0.5);
    return mk([g1, g2, round2(a - g1 - g2)], ["งวด 1/3 (40%)", "งวด 2/3 (50%)", "งวด 3/3 (10%)"]);
  }
  if (a <= 700000) {
    // 4 งวด: 35% / 30% / ส่วนที่เหลือ / RETENTION(40,000)
    // งวด 3 = เหลือ → อุ้มเศษสตางค์ (RETENTION คงเป็นจำนวนเต็ม)
    const g1 = round2(a * 0.35), g2 = round2(a * 0.3);
    const g3 = round2(a - g1 - g2 - RETENTION);
    return mk([g1, g2, g3, RETENTION],
      ["งวด 1/4 (35%)", "งวด 2/4 (30%)", "งวด 3/4 (ส่วนที่เหลือ)", "งวด 4/4 (ประกัน 40,000)"]);
  }
  // 5 งวด: 25% × 3 / ส่วนที่เหลือ / RETENTION(40,000)
  // งวด 4 = เหลือ → อุ้มเศษสตางค์ (RETENTION คงเป็นจำนวนเต็ม)
  const g = round2(a * 0.25);
  const g4 = round2(a - g * 3 - RETENTION);
  return mk([g, g, g, g4, RETENTION],
    ["งวด 1/5 (25%)", "งวด 2/5 (25%)", "งวด 3/5 (25%)", "งวด 4/5 (ส่วนที่เหลือ)", "งวด 5/5 (ประกัน 40,000)"]);
}
