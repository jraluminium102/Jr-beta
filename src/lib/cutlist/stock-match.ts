/**
 * cutlist/stock-match — จับคู่ "รหัสอลู (+สี)" ในใบตัด → รายการสต็อกจริง (ใช้ทั้งฝั่งจอ + server cut-stock)
 *
 * ทำไมต้องมี: สต็อกอลูมี 2 แบบ
 *   1) รหัส B####/F#### — มี sku ตรงรหัส · ราคาเดียว (ไม่แยกสี) → จับด้วย sku เป๊ะ
 *   2) SlimLux/OPK/XSW — sku "ว่าง" รหัสฝังอยู่ในชื่อ + แยกต่อสี
 *      เช่น "OPK-A201-40-ขวางบนล่าง-ดำ" → ชื่อมีทั้งรหัส (OPK-A201) และสี (ดำ)
 *   เดิม stockByCode key ด้วย sku อย่างเดียว → กลุ่ม 2 หลุดหมด (โชว์ "ไม่มีในสต็อก" ตัดไม่ได้)
 *
 * สี: ชื่อสีในเครื่องคิด (13 สี) ไม่ตรง token ในสต็อกเป๊ะ (เครื่องคิด "อบดำ" · สต็อก "ดำ")
 *     → ไม่ hardcode mapping (จะผิด) · ให้ dropdown "อ่านสีจริงจากชื่อสต็อก" ตอน runtime แทน
 */

export type StockLite = { id?: number; sku: string; name: string; qty: number; image?: string; unitCost?: number };

const U = (s: unknown) => String(s ?? "").trim().toUpperCase();
// แตกชื่อสต็อกเป็น segment (คั่นด้วย - เว้นวรรค / , วงเล็บ) เพื่อเทียบ "สี" แบบทั้งคำ (กัน "ดำ" ไปแมตช์ "ดำซาฮาร่า")
const SEG = (s: unknown) => String(s ?? "").split(/[-\s/,()+]+/).filter(Boolean);

// token สีที่ "รู้จัก" (curated) — ใช้กรองว่า segment ไหนในชื่อสต็อกคือ "สี" · เรียงตามที่อยากให้โชว์
// หมายเหตุ: เป็นแค่ตัวกรอง segment — dropdown โชว์เฉพาะสีที่ "โผล่จริง" ในสต็อก (ตัด token ที่ไม่มีของทิ้ง)
export const KNOWN_ALU_COLORS = [
  "ดำ", "อบขาว", "ขาว", "เทาซาฮาร่า", "ดำซาฮาร่า", "ซาฮาร่า", "มิว",
  "สีชุบ", "ชุบ", "เงิน", "สักทอง", "มะฮอกกานี", "ไวท์โอ๊ค", "โอ๊ค", "วอลนัท", "ลายไม้",
];

// ชื่อสต็อกมี "สี" นี้ไหม (เทียบทั้งคำ ระดับ segment)
function nameHasColor(name: string, color: string): boolean {
  if (!color) return true;
  return SEG(name).includes(color);
}
// ชื่อสต็อก "ไม่ระบุสีเลย" (ไม่มี segment ไหนเป็นสีที่รู้จัก) — ถือเป็นตัวใช้ได้ทุกสี
function isColorAgnostic(name: string): boolean {
  const segs = SEG(name);
  return !segs.some((s) => KNOWN_ALU_COLORS.includes(s));
}

/**
 * จับคู่ (รหัส, สี) → รายการสต็อกตัวเดียว (null = ไม่มีในสต็อก)
 *   1) sku ตรงรหัสเป๊ะ ชนะก่อน (B/F ราคาเดียว ไม่แยกสี — สีไม่เกี่ยว)
 *   2) ชื่อมีรหัส + (ถ้าเลือกสี) segment ชื่อมีสีนั้น
 *      · เลือกสีแล้วเจอสีตรง → ใช้ตัวนั้น
 *      · เลือกสีแล้วไม่เจอ แต่มีตัว "ไม่ระบุสี" → ใช้ตัวนั้น (ของกลาง)
 *      · เลือกสีแล้วมีแต่สีอื่น → null (กันหักผิดสี)
 */
export function resolveStock(stock: StockLite[], code: string, color?: string): StockLite | null {
  const uc = U(code);
  if (!uc || uc === "-") return null;
  const bySku = stock.find((s) => U(s.sku) === uc);
  if (bySku) return bySku;
  const hits = stock.filter((s) => U(s.name).includes(uc));
  if (!hits.length) return null;
  const col = String(color ?? "").trim();
  if (col) {
    const exact = hits.filter((s) => nameHasColor(s.name, col));
    if (exact.length) return exact[0];
    const agnostic = hits.filter((s) => isColorAgnostic(s.name));
    if (agnostic.length) return agnostic[0];
    return null; // มีแต่สีอื่น → ไม่หัก
  }
  return hits[0];
}

// สีที่ "มีจริง" ในสต็อก (ไว้ทำ dropdown) — เฉพาะ token ที่โผล่เป็น segment ในชื่อรายการอลู
export function stockColorOptions(stock: StockLite[]): string[] {
  const found = new Set<string>();
  for (const s of stock) for (const seg of SEG(s.name)) if (KNOWN_ALU_COLORS.includes(seg)) found.add(seg);
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
