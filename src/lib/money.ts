// ============================================================
// สูตรคำนวณยอดเงิน — แหล่งความจริงเดียว (กฎเหล็ก: ยอดต้องตรง)
// ลำดับ: (ยอดรวม − ส่วนลด) → VAT → (− หัก ณ ที่จ่าย) = ยอดรับสุทธิ
// ============================================================
import type { QuotationItem, InstallmentFooter } from "./types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// ⚠ ห้ามปัดบาทเต็ม — เจ้าของยืนยัน 15 ก.ค.69: "ไม่ปัดเศษ VAT โชว์เศษ แค่ตอนยอดสุดท้ายที่จะให้ลูกค้าจ่ายปัด"
//   (ตรงกับที่สั่งไว้ 13 ก.ค.) → เก็บสตางค์ทุกตัว · การปัดเกิดตอน "รับเงินจริง" (ใบเสร็จยึดเงินที่เข้าจริง)
//   helper roundBaht เดิมถูกลบทิ้งแล้ว — ไม่มีใครเรียก และเก็บไว้เสี่ยงคนหยิบไปใช้แล้วยอดไม่ตรง (subtotal+VAT≠total)

export interface MoneyInput {
  items: Pick<QuotationItem, "qty" | "unit_price">[];
  vat_rate: number; // 0 | 7
  discount_pct: number; // 0–100 · ใช้เมื่อ "ไม่ได้" ส่ง discount_amt (โหมด %)
  // ส่วนลดเป็น "จำนวนเงิน" (โหมดบาท) — ถ้าส่งมา (ไม่ null) จะใช้ค่านี้ตรง ๆ เป็นส่วนลด (authoritative)
  // ชนะ discount_pct เสมอ · clamp 0..subtotal · เลิกคิด amt กลับจาก % ทุกที่ (กัน round-trip drift · บัญชีสั่ง)
  discount_amt?: number;
  wht_rate: number; // 0 | 1 | 2 | 3 | 5
  // ── ค่าแรง (17 ก.ค.69) — หัก ณ ที่จ่ายคิดจาก "ค่าแรงอย่างเดียว" ไม่ใช่ทั้งบิล ──
  //   labor_amount = ค่าแรงเป็นบาท (authoritative · mirror discount_amt) ชนะ labor_pct · clamp 0..after_discount
  //   labor_pct    = ค่าแรงเป็น % ของ after_discount (ใช้เมื่อไม่ส่ง labor_amount)
  //   ⚠ legacy: ไม่ส่งทั้งคู่ = ฐาน WHT ยังเป็นทั้งบิล (after_discount) เหมือนเดิม — กันใบเก่า/golden เดิมพัง
  labor_amount?: number;
  labor_pct?: number;
}

export interface MoneyResult {
  subtotal: number;
  discount_amt: number;
  after_discount: number;
  vat_amt: number;
  total: number;
  wht_amt: number;
  net: number;
  labor_amt: number;    // ค่าแรงก่อน VAT ที่ใช้จริง (ฐาน WHT) · 0 ถ้าไม่ระบุ
  material_amt: number; // ค่าของ = after_discount − labor
}

export function computeTotals(input: MoneyInput): MoneyResult {
  const subtotal = round2(
    input.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0)
  );
  // ส่วนลด: โหมดบาท (discount_amt ส่งมา) ชนะเสมอ · ไม่งั้นคิดจาก % · clamp 0..subtotal (กัน after_discount ติดลบ)
  const rawDiscount = input.discount_amt != null
    ? (Number(input.discount_amt) || 0)
    : (subtotal * (Number(input.discount_pct) || 0)) / 100;
  const discount_amt = round2(Math.min(Math.max(0, rawDiscount), subtotal));
  const after_discount = round2(subtotal - discount_amt);
  // ค่าแรง: โหมดบาทชนะ % · clamp 0..after_discount (WHT คิดจากฐานก่อน VAT หลังส่วนลด · ท.ป.4/2528)
  const laborProvided = input.labor_amount != null || input.labor_pct != null;
  const rawLabor = input.labor_amount != null
    ? (Number(input.labor_amount) || 0)
    : (after_discount * (Number(input.labor_pct) || 0)) / 100;
  const labor_amt = round2(Math.min(Math.max(0, rawLabor), after_discount));
  const material_amt = round2(after_discount - labor_amt);
  // ห้ามปัดเศษกลางทาง (เจ้าของสั่ง 13ก.ค.69): รายการมีทศนิยม → VAT/หัก ณ ที่จ่าย เก็บ 2 ตำแหน่ง (สตางค์)
  // ไม่ปัดบาทเต็ม เพราะทำให้ยอดไม่ตรง (subtotal+VAT≠total) · ปัดเฉพาะตอนโชว์ยอดสุดท้ายถ้าจำเป็น
  const vat_amt = round2((after_discount * (Number(input.vat_rate) || 0)) / 100);
  const total = round2(after_discount + vat_amt);
  // ⚠ ฐาน WHT: ระบุค่าแรง → หักเฉพาะค่าแรง (17 ก.ค.69) · ไม่ระบุ → ทั้งบิล (legacy · จ้างทำของ 15 ก.ค.)
  const whtBase = laborProvided ? labor_amt : after_discount;
  const wht_amt = round2((whtBase * (Number(input.wht_rate) || 0)) / 100);
  const net = round2(total - wht_amt);
  return { subtotal, discount_amt, after_discount, vat_amt, total, wht_amt, net, labor_amt, material_amt };
}

export const lineTotal = (qty: number, unit_price: number) =>
  round2((Number(qty) || 0) * (Number(unit_price) || 0));

// footer ใบวางบิล (display-only) — คิด snapshot จาก subtotal + %ส่วนลด + %VAT + %หัก ณ ที่จ่าย
// ใช้ computeTotals แหล่งเดียว (เหมือนใบเสนอ) → ยอด/สุทธิ ถูกต้องตามกฎไทย · เก็บ % ไว้โชว์ด้วย
export function footerSnapshot(
  subtotal: number, discount_pct: number, vat_rate: number, wht_rate: number,
  discount_amt?: number, // โหมดบาท — ถ้าส่งมาใช้ตรง ๆ (authoritative) · ไม่ส่ง = คิดจาก % (เดิม)
  labor_amount?: number, // ค่าแรงบาท (authoritative) → WHT คิดเฉพาะค่าแรง (17 ก.ค.69) · ไม่ส่ง = ทั้งบิล (legacy)
  labor_pct?: number,    // ค่าแรง % ของ after_discount (ใช้เมื่อไม่ส่ง labor_amount)
): InstallmentFooter {
  const sub = Math.max(0, Number(subtotal) || 0);
  const dp = Math.max(0, Math.min(100, Number(discount_pct) || 0));
  const vr = Math.max(0, Number(vat_rate) || 0);
  const wr = Math.max(0, Number(wht_rate) || 0);
  const t = computeTotals({
    items: [{ qty: 1, unit_price: sub }], vat_rate: vr, discount_pct: dp, wht_rate: wr,
    ...(discount_amt != null ? { discount_amt } : {}),
    ...(labor_amount != null ? { labor_amount } : {}),
    ...(labor_pct != null ? { labor_pct } : {}),
  });
  return {
    subtotal: t.subtotal, discount_pct: dp, discount_amt: t.discount_amt,
    vat_rate: vr, vat_amt: t.vat_amt, wht_rate: wr, wht_amt: t.wht_amt, net: t.net,
  };
}

// ============================================================
// ถอด VAT ออกจาก "ยอดที่รวม VAT แล้ว" (back-out) — สำหรับ footer พิมพ์แยกงวด
// ยอดงวด (amount) เป็น "ตัวตั้ง" ไม่คิดใหม่ → แค่บอกว่าในนั้นเป็นยอดก่อน VAT เท่าไร / VAT เท่าไร
// ผลรวมทุกงวด = net ทั้งใบเสมอ (ไม่เพี้ยน) · บัญชี approve วิธี back-out สำหรับ "ใบวางบิล" (ไม่ใช่ใบกำกับภาษี)
// ⚠ ถ้าจะออกใบกำกับภาษีต่องวดจริง ต้องให้งวดสุดท้ายอุ้มเศษ VAT (คนละงาน — ใช้ตาราง receipts)
// ⚠⚠ contract สำคัญ: amountInclVat ต้องเป็น "ยอดรวม VAT ล้วน" (base×(1+rate)) — ห้ามถูกหัก ณ ที่จ่ายมาก่อน
//    ถ้ายอดงวดถูกหัก WHT ระดับใบแล้ว (amount=net) base/vat ที่ได้จะเพี้ยน → ต้องไม่แยกค่าแรง/ถอด VAT (บัญชีเตือน)
// ============================================================
// นโยบายการปัด = "Method A: ปัด VAT ก่อน แล้วให้ฐานอุ้มเศษ" (บัญชีเคาะ 15 ก.ค.69)
//   1) ตัวเลขที่มีผลทางกฎหมายคือ VAT (ม.86/4(5) ต้องแสดงจำนวนภาษีแยกชัดแจ้ง) → ปัดตัวนั้นให้ตรงที่สุด
//   2) ฐาน + VAT = ยอดรวม เป๊ะเสมอ (ไม่มีสตางค์ลอย)
//   3) ตรงกับที่ receipts/route.ts ทำอยู่เดิม → ใบเสร็จเก่าที่ถูกอยู่แล้วไม่ขยับแม้แต่สตางค์เดียว
// ⚠ สรรพากรไม่ได้กำหนดทิศทางการปัดของการถอด VAT ย้อนกลับเป็นกฎหมาย — นี่คือนโยบายบริษัท ควรให้ผู้สอบบัญชีเคาะรับรอง 1 ครั้ง
export function backoutVat(amountInclVat: number, vatRate: number): { base: number; vat: number } {
  const { base, vat } = splitCashReceived(amountInclVat, vatRate, 0);
  return { base, vat };
}

/**
 * แยก "เงินสดที่รับจริง" กลับเป็น ฐาน / VAT / หัก ณ ที่จ่าย — แหล่งความจริงเดียวของใบเสร็จ
 *
 * ทำไมต้องมี: ใบวางบิลที่มีหัก ณ ที่จ่าย เก็บ total = net (หลังถูกหักแล้ว) → งวดแตกจากยอดนั้น
 * ถ้าเอาเงินที่รับไปถอด VAT ตรง ๆ จะได้ฐานต่ำกว่าจริง → VAT ขายขาด กระทบ ภ.พ.30
 *   เงินรับ A = ฐาน × (1 + r/100 − w/100)   →   ฐาน = A / (1 + r/100 − w/100)
 * หลักภาษี: WHT = การหักเงินที่จ่าย (ม.50/69 ทวิ) ไม่ใช่ส่วนลดราคา → "ไม่ลดฐาน VAT"
 *          และ WHT คิดจากฐานก่อน VAT (ท.ป.4/2528) — ตรงกับ computeTotals ที่คิด wht จาก after_discount
 * ปัด: ปัดตัวภาษีก่อน แล้ว plug ฐาน = A − vat + wht → บังคับ ฐาน + VAT − WHT = A เป๊ะ
 *
 * ตัวอย่าง: A=104,000 · VAT 7% · WHT 3% → ฐาน 100,000 · VAT 7,000 · WHT 3,000 · รวมทั้งสิ้น 107,000
 */
export function splitCashReceived(
  cashReceived: number, vatRate: number, whtRate: number,
): { base: number; vat: number; wht: number; gross: number } {
  const A = round2(Number(cashReceived) || 0);
  const r = Math.max(0, Number(vatRate) || 0);
  const w = Math.max(0, Number(whtRate) || 0);
  if (r <= 0 && w <= 0) return { base: A, vat: 0, wht: 0, gross: A };
  const f = 1 + r / 100 - w / 100;
  const raw = f > 0 ? A / f : A; // f<=0 = หักมากกว่ายอด (ไม่เกิดจริง) → กันหารศูนย์/ติดลบ
  const vat = round2((raw * r) / 100);
  const wht = round2((raw * w) / 100);
  const base = round2(A - vat + wht); // plug — ฐานอุ้มเศษ
  return { base, vat, wht, gross: round2(base + vat) };
}

// อัตราหัก ณ ที่จ่าย — ปรับที่จุดเดียวนี้
// ✅ เจ้าของยืนยัน 15 ก.ค.69: "หักทั้งยอดที่ตั้งไว้ — ดึงงวด 1 แล้วเลือกหัก 3 ก็หักทั้งยอดที่ดึง"
//    = สัญญาเป็น "จ้างทำของ" → หัก 3% ทั้งก้อน (ของ+แรง) ไม่แยกค่าแรง/ค่าของ · ตรง ท.ป.4/2528 ข้อ 8
//    → computeTotals คิด wht จาก after_discount (ฐานเต็มก่อน VAT) = ถูกแล้ว ไม่ต้องแก้
// หมายเหตุ: WHT ที่ระดับใบ (เฉลี่ยลงงวด) กับ "เลือกหักตอนดึงงวด" ให้เลข "เท่ากันเป๊ะ" (เชิงเส้น — บัญชีเดินเลขยืนยัน)
export const WHT_LABOR_RATE = 3;

// แตกยอดก่อน VAT เป็น ค่าแรง/ค่าของ ตามสัดส่วน labor_ratio (%) — ค่าของ = ส่วนที่เหลือ (อุ้มเศษ ไม่ปัดสองตัว)
export function splitLaborMaterial(baseExVat: number, laborRatioPct: number): { labor: number; material: number } {
  const base = round2(Number(baseExVat) || 0);
  const ratio = Math.min(100, Math.max(0, Number(laborRatioPct) || 0));
  const labor = round2((base * ratio) / 100);
  return { labor, material: round2(base - labor) };
}

// เอกสารการเงินโชว์ 2 ตำแหน่งเสมอ (บัญชีสั่ง 11ก.ค.69) — VAT/หัก ณ ที่จ่าย/ส่วนลด/ยอด ต้องมี .00
export const baht = (n: number) =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ============================================================
// "VAT ที่ใช้จริง" ของใบวางบิล — แหล่งความจริงเดียว
// ใช้ร่วมกันทั้ง หน้าใบวางบิล · หน้าสร้างใบเสร็จ · POST /api/receipts (เดิมต่างคนต่างคิด → ใบเสร็จไม่ตรงใบที่ส่งลูกค้า)
// ยึด vat_rate_set (0095) = "อัตรา VAT ของใบนี้ยืนยันแล้ว" — ธงที่ booked จริง ตรวจย้อนได้
//   · true  → ใช้ bn.vat_rate (ผู้ใช้ติ๊ก VAT ที่ใบวางบิลเอง)
//   · false → ใบเก่า/ใบนำเข้า (ยอด flatten อาจรวม VAT อยู่แล้ว) → ไม่รู้ชัด ให้ผู้เรียก fallback jobs.vat_rate
//
// ⚠ ห้ามเอา footer_override มาตัดสิน (บัญชีสั่ง 15 ก.ค.69): มันคือ display-only ไม่แตะยอด booked
//    ถ้าให้มันขับใบกำกับภาษี = เอกสารภาษีอ้างตัวเลขที่ไม่ผูกบัญชี ตรวจย้อนไม่ได้ ผิดหลัก audit trail
//    → กันไม่ให้ต่างกันตั้งแต่ต้นทางแทน: ช่องแก้ footer แบบ display-only ล็อก VAT ไว้ (แก้ได้ที่ "แก้ VAT/ส่วนลด" เท่านั้น)
// ⚠ known=false = "เดาจากงาน" → ห้ามใช้สรุปว่าใบนี้ No-VAT (ดู isNoVatBill)
//
// ทำไมต้องแยกจาก has_tax_breakdown (อย่าเอามารวมกัน — บัญชีเตือน):
//   has_tax_breakdown = "subtotal เป็นยอดก่อน VAT จริง (ตรง quotations.subtotal)" → คุม UI ปุ่มแก้ VAT/footer
//   vat_rate_set      = "อัตรา VAT ยืนยันแล้ว" → คุมใบเสร็จ
//   "แก้ยอดบิล" (mode A) ทำให้ subtotal ไม่ตรงใบเสนอแล้ว (has_tax_breakdown=false) แต่ "การตัดสินใจ VAT ยังอยู่"
// ============================================================
export interface BillVatSource {
  vat_rate?: number | null;
  vat_rate_set?: boolean | null;
}

/** การตัดสินใจ VAT ที่ "ตัวใบวางบิลเอง" บอกได้ (ไม่พึ่งงาน) */
export function billVatDecision(bn: BillVatSource): { rate: number; known: boolean } {
  if (bn.vat_rate_set) return { rate: Number(bn.vat_rate) || 0, known: true };
  return { rate: 0, known: false };
}

/** อัตรา VAT ที่ใบเสร็จ/ใบกำกับต้องใช้ = ของใบวางบิลถ้ารู้ชัด · ไม่งั้น fallback อัตราของงาน (ใบเก่า) */
export function effectiveBillVat(bn: BillVatSource, jobVatRate: number): number {
  const d = billVatDecision(bn);
  return d.known ? d.rate : Number(jobVatRate) || 0;
}

/**
 * ใบนี้ "ไม่มี VAT แน่ชัด" ไหม → รับชำระแล้วติ๊กว่าชำระพอ ไม่ต้องออกใบกำกับภาษี
 *
 * ⚠ ต่างจาก effectiveBillVat ตรงที่ "ดู footer_override ด้วย" — ตั้งใจ ไม่ใช่ความไม่สอดคล้อง:
 *   · effectiveBillVat = ขับ "ตัวเลข" บนเอกสารภาษี → ห้าม ov แตะ (ov ไม่ผูกยอด booked · ตรวจย้อนไม่ได้)
 *   · isNoVatBill      = "บล็อกไม่ให้ออกเอกสาร" → ov ใช้ได้ เพราะทิศนี้ fail-safe (กันไม่ให้ออกใบ ไม่ใช่ออกใบผิด)
 * ถ้าไม่มีบรรทัด ov นี้: ใบเก่าที่ footer (ที่ส่งลูกค้าจริง) โชว์ VAT 0 แต่ vat_rate_set=false
 *   → ปุ่มออกใบเสร็จจะโผล่ (เดิมซ่อน) → กดแล้ว fallback jobs.vat_rate=7 = ออกใบกำกับ VAT 7%
 *     ขัดกับใบที่ส่งลูกค้าไปแล้ว (บัญชีจับได้ตอนรีวิว 15 ก.ค.69 — regression จาก 0095)
 */
export function isNoVatBill(
  bn: BillVatSource & { footer_override?: { vat_rate?: number | null; net?: number | null } | null },
): boolean {
  const d = billVatDecision(bn);
  if (d.known) return d.rate <= 0;
  const ov = bn.footer_override;
  return !!(ov && typeof ov.net === "number" && (Number(ov.vat_rate) || 0) <= 0);
}

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

// ── คำอธิบายงวด (ใบค่าแรง planInstallments) — 22 ก.ค.69 ──
//   หัวงวดตามตำแหน่ง: งวดแรก(เบิกมัดจำ) / กลาง(เข้าติดตั้ง 50%) / สุดท้าย(เก็บงานเรียบร้อย) · retention = เงินประกัน
//   บรรทัดย่อยชนิดเงิน (เฉพาะมี VAT): ค่าวัสดุ/ค่าแรง/เงินประกัน (รวมVat)
//   ⚠ label เป็น "ข้อความ" ล้วน — ไม่กระทบยอด/golden test (cell เช็คแค่ kind/amount/base/vat/wht) · แก้ต่อใบได้ (PrintLabelEditor)
export function billInstallmentLabel(
  i: number, n: number, kind: "material" | "labor" | "retention", vatRate: number,
): string {
  const head =
    kind === "retention" ? "งวดสุดท้าย  เบิกเงินประกันผลงาน"
      : i === 0 ? "งวดแรก  เบิกมัดจำลูกค้าตกลงว่าจ้างงาน"
        : i === n - 1 ? "งวดสุดท้าย  เบิกส่วนที่เหลือ เมื่อเก็บงานเรียบร้อยแล้ว"
          : `งวดที่ ${i + 1}  เบิกวันแรกเข้าติดตั้ง และงานเสร็จแล้ว 50%`;
  if (!(Number(vatRate) > 0)) return head;   // ไม่มี VAT = ไม่มีบรรทัดย่อยชนิดเงิน
  const sub = kind === "labor" ? "ค่าแรง" : kind === "retention" ? "เงินประกัน" : "ค่าวัสดุ";
  return `${head}\n- ${sub} (รวมVat)`;
}

// ── คำอธิบายงวด "กดวางบิลอัตโนมัติ" (suggestInstallments) — เจ้าของเคาะ 22 ก.ค.69 ──
//   งวดแรก = มัดจำ · งวดกลาง = ไมล์สโตน %ตามจำนวนงวด · งวดสุดท้าย = "ส่วนที่เหลือ เก็บงานเรียบร้อย"
//   ⚠ งวดประกัน (retention) คงจำนวนเงินเท่าเดิม แต่ "เลิกใช้คำว่าเงินประกัน" → หัว = งวดสุดท้าย, บรรทัดย่อย VAT = ค่าแรง
//   ไมล์สโตนงวดกลาง: 4งวด → 50/80% · 5งวด → 40/60/80% (i เริ่ม 0 · index 1..n-2 คืองวดกลาง)
//   แยกจาก billInstallmentLabel เพราะใบค่าแรง (planInstallments) ยังใช้คำว่า "เงินประกัน" ตามบัญชี
const SUGGEST_MID: Record<number, { p: number; first?: boolean }[]> = {
  3: [{ p: 50, first: true }],
  4: [{ p: 50, first: true }, { p: 80 }],
  5: [{ p: 40, first: true }, { p: 60 }, { p: 80 }],
};
export function suggestLabel(
  i: number, n: number, kind: "material" | "retention", vatRate: number,
): string {
  let head: string;
  if (i === 0) head = "งวดแรก  เบิกมัดจำลูกค้าตกลงว่าจ้างงาน";
  else if (i === n - 1) head = "งวดสุดท้าย  เบิกส่วนที่เหลือ เมื่อเก็บงานเรียบร้อยแล้ว";
  else {
    const m = (SUGGEST_MID[n] ?? [])[i - 1] ?? { p: 50, first: i === 1 };
    head = m.first
      ? `งวดที่ ${i + 1}  เบิกวันแรกเข้าติดตั้ง และงานเสร็จแล้ว ${m.p}%`
      : `งวดที่ ${i + 1}  เบิกเมื่องานติดตั้งเสร็จแล้ว ${m.p}%`;
  }
  if (!(Number(vatRate) > 0)) return head;   // ไม่มี VAT = ไม่มีบรรทัดย่อยชนิดเงิน
  const sub = kind === "retention" ? "ค่าแรง" : "ค่าวัสดุ";   // งวดสุดท้าย(ประกัน)=ค่าแรง · งวดอื่น=ค่าวัสดุ
  return `${head}\n- ${sub} (รวมVat)`;
}

export function suggestInstallments(net: number, vatRate = 0): InstallmentPlan[] {
  // round2 (ไม่ใช่ Math.round) — คงสตางค์ไว้ ไม่ปัดเป็นบาทเต็ม
  const a = Math.max(0, round2(Number(net) || 0));
  const mk = (parts: number[], kinds: ("material" | "retention")[]): InstallmentPlan[] =>
    parts.map((amt, i) => ({ seq: i + 1, label: suggestLabel(i, parts.length, kinds[i], vatRate), amount: amt }));

  if (a <= 100000) {
    // 2 งวด: 70% / 30% (งวด 2 = เหลือ → อุ้มเศษ · ผลรวม = a เป๊ะ)
    const g1 = round2(a * 0.7);
    return mk([g1, round2(a - g1)], ["material", "material"]);
  }
  if (a <= 300000) {
    // 3 งวด: 40% / 50% / 10% (งวด 3 = เหลือ)
    const g1 = round2(a * 0.4), g2 = round2(a * 0.5);
    return mk([g1, g2, round2(a - g1 - g2)], ["material", "material", "material"]);
  }
  if (a <= 500000) {
    // 3 งวด: 35% / ส่วนที่เหลือ / ประกัน 30,000 (เจ้าของเคาะ 21ก.ค.69)
    const ret = 30000;
    const g1 = round2(a * 0.35);
    return mk([g1, round2(a - g1 - ret), ret], ["material", "material", "retention"]);
  }
  if (a <= 700000) {
    // 4 งวด: 35% / 30% / ส่วนที่เหลือ / ประกัน 40,000 (เหมือนเดิม)
    const g1 = round2(a * 0.35), g2 = round2(a * 0.3);
    const g3 = round2(a - g1 - g2 - RETENTION);
    return mk([g1, g2, g3, RETENTION], ["material", "material", "material", "retention"]);
  }
  // 5 งวด: 25% × 3 / ส่วนที่เหลือ / RETENTION(40,000)
  const g = round2(a * 0.25);
  const g4 = round2(a - g * 3 - RETENTION);
  return mk([g, g, g, g4, RETENTION], ["material", "material", "material", "material", "retention"]);
}

// ============================================================
// planInstallments — แบ่งงวด + ภาษี "booked ต่องวด" (17 ก.ค.69 · accountant design)
//   หัก ณ ที่จ่ายเฉพาะค่าแรง → WHT กองที่ "งวดค่าแรง" ก้อนเดียว (งวดค่าของ wht=0)
//   เงินประกัน (retention) = เลื่อนรับเงินฝั่งค่าของ → งวดสุดท้ายจริง (kind=retention, wht=0)
//   ⚠ ทำงานในโดเมน base (ไม่ใช่ amount): amount = base + vat − wht (นิยาม) →
//      Σamount=net · Σbase=after_discount · Σvat=vat_total · Σwht=wht_total เป๊ะ (กัน double-round)
//   accountant เดินเลข 4 เคส (รวมงานใหญ่ 5 งวด) ครบทั้ง 4 invariant · verify-billing section ⑨
// ============================================================
export interface InstallmentTaxPlan {
  seq: number;
  label: string;
  amount: number;    // เงินรับจริงของงวด = base + vat − wht
  base_amt: number;  // ฐานก่อน VAT ของงวด
  vat_amt: number;
  wht_amt: number;
  vat_rate: number;
  wht_rate: number;
  kind: "material" | "labor" | "retention";
}

// จำนวนงวด + สัดส่วน "ฝั่งค่าของ" (ตัดด้วย net คงความคุ้นเดิม) — ปรับจุดเดียวนี้ (เจ้าของ/บัญชีเคาะได้)
function bracketMaterial(net: number): [number, number[]] {
  if (net <= 100000) return [1, [1.0]];
  if (net <= 300000) return [2, [0.6, 0.4]];
  if (net <= 700000) return [2, [0.5, 0.5]];
  return [3, [0.4, 0.3, 0.3]];
}

export function planInstallments(opts: {
  material_amt: number; labor_amt: number; vat_rate: number; wht_rate: number;
  hasRetention?: boolean; retention?: number;
}): { installments: InstallmentTaxPlan[]; retentionApplied: boolean; retentionRequested: boolean } {
  const material_amt = round2(Math.max(0, Number(opts.material_amt) || 0));
  const labor_amt = round2(Math.max(0, Number(opts.labor_amt) || 0));
  const vrRate = Math.max(0, Number(opts.vat_rate) || 0);
  const wrRate = Math.max(0, Number(opts.wht_rate) || 0);
  const vr = vrRate / 100, wr = wrRate / 100;
  const retention = round2(Number(opts.retention) || 40000);
  const hasRetention = !!opts.hasRetention;

  const after_discount = round2(material_amt + labor_amt);
  const vat_total = round2(after_discount * vr);
  const wht_total = round2(labor_amt * wr);   // ฐาน = ค่าแรงล้วน
  const net = round2(after_discount + vat_total - wht_total);

  // งวดค่าแรง — WHT ทั้งใบกองที่นี่ก้อนเดียว
  const hasLabor = labor_amt > 0.005;
  let L: InstallmentTaxPlan | null = null;
  if (hasLabor) {
    const base = round2(labor_amt);
    const vat = round2(labor_amt * vr);
    L = { seq: 0, label: "", base_amt: base, vat_amt: vat, wht_amt: wht_total, amount: round2(base + vat - wht_total), vat_rate: vrRate, wht_rate: wrRate, kind: "labor" };
  }
  const labNet = L ? L.amount : 0;
  const matNet = round2(net - labNet);

  // งวดเงินประกัน — งวดสุดท้ายจริง, กันจากฝั่งค่าของ, wht=0
  const useRet = hasRetention && matNet > retention + 0.005;
  let R: InstallmentTaxPlan | null = null;
  if (useRet) {
    const base = vr > 0 ? round2(retention / (1 + vr)) : retention;
    R = { seq: 0, label: "", base_amt: base, vat_amt: round2(retention - base), wht_amt: 0, amount: retention, vat_rate: vrRate, wht_rate: 0, kind: "retention" };
  }

  // งวดค่าของย่อย — ปิดยอด base/vat ที่เหลือของฝั่งค่าของ (งวดสุดท้ายอุ้มเศษ)
  const matBaseSplit = round2(material_amt - (useRet ? R!.base_amt : 0));
  const matVatSplit = round2(vat_total - (hasLabor ? L!.vat_amt : 0) - (useRet ? R!.vat_amt : 0));
  const M: InstallmentTaxPlan[] = [];
  if (matBaseSplit > 0.005) {
    const [nMat, ratios] = bracketMaterial(net);
    let accB = 0, accV = 0;
    for (let i = 0; i < nMat; i++) {
      let b: number, v: number;
      if (i < nMat - 1) { b = round2(matBaseSplit * ratios[i]); v = round2(b * vr); }
      else { b = round2(matBaseSplit - accB); v = round2(matVatSplit - accV); }  // อุ้มเศษ
      accB = round2(accB + b); accV = round2(accV + v);
      M.push({ seq: 0, label: "", base_amt: b, vat_amt: v, wht_amt: 0, amount: round2(b + v), vat_rate: vrRate, wht_rate: 0, kind: "material" });
    }
  }

  const out: InstallmentTaxPlan[] = [...M];
  if (L) out.push(L);
  if (R) out.push(R);
  const n = out.length;
  out.forEach((it, i) => {
    it.seq = i + 1;
    it.label = billInstallmentLabel(i, n, it.kind, vrRate);   // คำพูดชุดเดียวกับ suggestInstallments (22 ก.ค.69)
  });
  return { installments: out, retentionApplied: useRet, retentionRequested: hasRetention };
}
