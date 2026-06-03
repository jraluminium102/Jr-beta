// ============================================================
// สูตรคำนวณยอดเงิน — แหล่งความจริงเดียว (กฎเหล็ก: ยอดต้องตรง)
// ลำดับ: (ยอดรวม − ส่วนลด) → VAT → (− หัก ณ ที่จ่าย) = ยอดรับสุทธิ
// ============================================================
import type { QuotationItem } from "./types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface MoneyInput {
  items: Pick<QuotationItem, "qty" | "unit_price">[];
  vat_rate: number; // 0 | 7
  discount_pct: number; // ≤ 2
  wht_rate: number; // 0 | 3 | 5
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
  const vat_amt = round2((after_discount * (Number(input.vat_rate) || 0)) / 100);
  const total = round2(after_discount + vat_amt);
  const wht_amt = round2((after_discount * (Number(input.wht_rate) || 0)) / 100);
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
// ============================================================
export interface InstallmentPlan {
  seq: number;
  label: string;
  amount: number;
}

const RETENTION = 40000; // เงินประกันงวดท้าย (4-5 งวด)

export function suggestInstallments(net: number): InstallmentPlan[] {
  const a = Math.max(0, Math.round(Number(net) || 0));
  const mk = (parts: number[], labels: string[]): InstallmentPlan[] =>
    parts.map((amt, i) => ({ seq: i + 1, label: labels[i], amount: amt }));

  if (a <= 100000) {
    const g1 = Math.round(a * 0.7);
    return mk([g1, a - g1], ["งวด 1/2 (70%)", "งวด 2/2 (30%)"]);
  }
  if (a <= 300000) {
    const g1 = Math.round(a * 0.4), g2 = Math.round(a * 0.5);
    return mk([g1, g2, a - g1 - g2], ["งวด 1/3 (40%)", "งวด 2/3 (50%)", "งวด 3/3 (10%)"]);
  }
  if (a <= 700000) {
    const g1 = Math.round(a * 0.35), g2 = Math.round(a * 0.3);
    const g3 = a - g1 - g2 - RETENTION;
    return mk([g1, g2, g3, RETENTION],
      ["งวด 1/4 (35%)", "งวด 2/4 (30%)", "งวด 3/4 (ส่วนที่เหลือ)", "งวด 4/4 (ประกัน 40,000)"]);
  }
  const g = Math.round(a * 0.25);
  const g4 = a - g * 3 - RETENTION;
  return mk([g, g, g, g4, RETENTION],
    ["งวด 1/5 (25%)", "งวด 2/5 (25%)", "งวด 3/5 (25%)", "งวด 4/5 (ส่วนที่เหลือ)", "งวด 5/5 (ประกัน 40,000)"]);
}
