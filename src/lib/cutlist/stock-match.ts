/**
 * cutlist/stock-match — จับคู่ "รหัสอลู (+สี)" ในใบตัด → รายการสต็อกจริง (ใช้ทั้งฝั่งจอ + server cut-stock)
 *
 * ทำไมต้องมี: รหัสอลูตัวเดียว (เช่น F7935) มักมีในสต็อก "หลายแถว = หลายสี"
 *   · บางรหัสเก็บสีไว้ในชื่อ  เช่น "คิ้ว F7935 ดำ" / "คิ้ว F7935 อบขาว"
 *   · บางรหัสเก็บสีไว้ใน sku  เช่น sku "F7935-ดำ"
 *   · SlimLux/OPK sku ว่าง รหัส+สีอยู่ในชื่อ "OPK-A201-40-ขวางบนล่าง-ดำ"
 *   → ต้องจับคู่ด้วย "รหัส + สี" เสมอ · ห้ามเจอรหัสตรงแล้วหยิบตัวแรกโดยไม่ดูสี (จะหักผิดสี)
 *
 * สี: ชื่อสีในเครื่องคิด (13 สี) ไม่ตรง token ในสต็อกเป๊ะ (เครื่องคิด "อบดำ" · สต็อก "ดำ")
 *     → ไม่ hardcode mapping (จะผิด) · ให้ dropdown "อ่านสีจริงจากสต็อก" ตอน runtime แทน
 */

export type StockLite = { id?: number; sku: string; name: string; qty: number; image?: string; unitCost?: number };

const U = (s: unknown) => String(s ?? "").trim().toUpperCase();
// แตกข้อความเป็น segment (คั่นด้วย - เว้นวรรค / , วงเล็บ) เพื่อเทียบ "สี" แบบทั้งคำ (กัน "ดำ" ไปแมตช์ "ดำซาฮาร่า")
const SEG = (s: unknown) => String(s ?? "").split(/[-\s/,()+]+/).filter(Boolean);

// token สีที่ "รู้จัก" (curated) — ใช้กรองว่า segment ไหนคือ "สี" · เรียงตามที่อยากให้โชว์
// หมายเหตุ: เป็นแค่ตัวกรอง segment — dropdown โชว์เฉพาะสีที่ "โผล่จริง" ในสต็อก (ตัด token ที่ไม่มีของทิ้ง)
export const KNOWN_ALU_COLORS = [
  "ดำ", "อบขาว", "ขาว", "เทาซาฮาร่า", "ดำซาฮาร่า", "ซาฮาร่า", "มิว",
  "สีชุบ", "ชุบ", "เงิน", "สักทอง", "มะฮอกกานี", "ไวท์โอ๊ค", "โอ๊ค", "วอลนัท", "ลายไม้",
];

// รายการสต็อกนี้ "มีสี" นี้ไหม — เทียบทั้งคำ (segment) ทั้งใน ชื่อ และ sku (บางรหัสเก็บสีใน sku)
function stockHasColor(s: StockLite, color: string): boolean {
  if (!color) return true;
  return SEG(s.name).includes(color) || SEG(s.sku).includes(color);
}
// รายการสต็อก "ไม่ระบุสีเลย" (ทั้งชื่อ+sku ไม่มี segment ไหนเป็นสีที่รู้จัก) — ถือเป็นตัวใช้ได้ทุกสี (ของกลาง)
function isColorAgnostic(s: StockLite): boolean {
  const segs = [...SEG(s.name), ...SEG(s.sku)];
  return !segs.some((x) => KNOWN_ALU_COLORS.includes(x));
}

/**
 * จับคู่ (รหัส, สี) → รายการสต็อกตัวเดียว (null = ไม่มีในสต็อก / ไม่มีสีนั้น)
 *   รวมผู้สมัครทั้งหมดก่อน (sku ตรงรหัส + ชื่อมีรหัส) แล้วค่อยกรองสี — รหัสเดียวหลายสีจับถูกตัว
 *   ถ้าเลือกสี:  มีตัวสีตรง → ใช้ตัวนั้น · ไม่มีแต่มีตัวไม่ระบุสี → ใช้ของกลาง · มีแต่สีอื่น → null (กันหักผิดสี)
 *   ถ้าไม่เลือกสี: หยิบตัวแรก (sku ตรงก่อน) — ⚠ รหัสหลายสีควรเลือกสีก่อน ไม่งั้นอาจได้ผิดตัว
 */
export function resolveStock(stock: StockLite[], code: string, color?: string): StockLite | null {
  const uc = U(code);
  if (!uc || uc === "-") return null;
  const skuHits = stock.filter((s) => U(s.sku) === uc);
  const nameHits = stock.filter((s) => U(s.name).includes(uc) && !skuHits.includes(s));
  const cand = [...skuHits, ...nameHits]; // sku ตรงก่อน แล้วชื่อมีรหัส
  if (!cand.length) return null;
  const col = String(color ?? "").trim();
  if (col) {
    const exact = cand.filter((s) => stockHasColor(s, col));
    if (exact.length) return exact[0];
    const agnostic = cand.filter((s) => isColorAgnostic(s));
    if (agnostic.length) return agnostic[0];
    return null; // มีแต่สีอื่น → ไม่หัก
  }
  return cand[0];
}

// รหัสนี้ในสต็อกมี "หลายสี" ไหม (candidate ที่ระบุสี ≥ 2 สีต่างกัน) — ไว้เตือนตอนไม่ได้เลือกสี
export function hasMultipleColors(stock: StockLite[], code: string): boolean {
  const uc = U(code);
  if (!uc || uc === "-") return false;
  const cand = stock.filter((s) => U(s.sku) === uc || U(s.name).includes(uc));
  const colors = new Set<string>();
  for (const s of cand) for (const seg of [...SEG(s.name), ...SEG(s.sku)]) if (KNOWN_ALU_COLORS.includes(seg)) colors.add(seg);
  return colors.size >= 2;
}

// สีที่ "มีจริง" ในสต็อก (ไว้ทำ dropdown) — token ที่โผล่เป็น segment ใน ชื่อ หรือ sku ของรายการอลู
export function stockColorOptions(stock: StockLite[]): string[] {
  const found = new Set<string>();
  for (const s of stock) for (const seg of [...SEG(s.name), ...SEG(s.sku)]) if (KNOWN_ALU_COLORS.includes(seg)) found.add(seg);
  return KNOWN_ALU_COLORS.filter((c) => found.has(c));
}

// map สีเครื่องคิด (key/label ใน alu-colors) → token สต็อก แบบ best-effort (ตั้งค่าเริ่ม dropdown เท่านั้น · ผู้ใช้ปรับได้)
const CALC_COLOR_TO_STOCK: Record<string, string> = {
  white: "อบขาว", อบขาว: "อบขาว",
  black: "ดำ", อบดำ: "ดำ",
  sahara: "เทาซาฮาร่า", เทาซาฮาร่า: "เทาซาฮาร่า",
  sahara_black: "ดำซาฮาร่า", ดำซาฮาร่า: "ดำซาฮาร่า",
  plated: "สีชุบ", สีชุบ: "สีชุบ",
  wood_teak: "สักทอง", wood_maho: "มะฮอกกานี", wood_whiteoak: "ไวท์โอ๊ค",
};
export function calcColorToStock(calcColor: unknown): string {
  const k = String(calcColor ?? "").trim();
  return CALC_COLOR_TO_STOCK[k] ?? "";
}
