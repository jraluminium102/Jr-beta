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
// เทียบสีแบบไม่สนช่องว่าง — "อื่น ๆ" = "อื่นๆ" · "Aztec gray" ก็ยังเทียบติด
const normColor = (s: unknown) => String(s ?? "").replace(/\s+/g, "").trim();

// สีจริงในสต็อก (หมวดอลูมิเนียม 1,165 แถว — นับจากข้อมูลจริง ไม่ได้เดา) เรียงตามจำนวนของ
// ⚠ ต้องสะกดตรงสต็อกเป๊ะ: "ไวท์โอ็ค" (ไม่ใช่ ไวท์โอ๊ค) · "ลายไม้สักทอง" เป็นคำเดียว · "Aztec gray" มีเว้นวรรค
export const KNOWN_ALU_COLORS = [
  "อบขาว", "ดำ", "เทาซาฮาร่า", "ลายไม้สักทอง", "Aztec gray", "ไวท์โอ็ค", "มะฮอกกานี", "มิว", "อื่นๆ",
];
const KNOWN_NORM = new Set(KNOWN_ALU_COLORS.map(normColor));

/**
 * สีของรายการสต็อก — ชื่อจริงรูปแบบ "รหัส-ชื่อ-สี" เช่น "F7935-คิ้วกรอบบาน-อบขาว"
 * → สี = ข้อความหลัง "-" ตัวสุดท้าย (ถ้าเป็นสีที่รู้จัก) · ไม่ใช่สี = "" (ของกลาง ใช้ได้ทุกสี)
 */
export function stockColorOf(s: StockLite): string {
  for (const src of [s.name, s.sku]) {
    const t = String(src ?? "");
    const i = t.lastIndexOf("-");
    if (i < 0) continue;
    const c = t.slice(i + 1).trim();
    if (KNOWN_NORM.has(normColor(c))) return c;
  }
  return "";
}
const stockHasColor = (s: StockLite, color: string) => !color || normColor(stockColorOf(s)) === normColor(color);
const isColorAgnostic = (s: StockLite) => stockColorOf(s) === "";

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

// รหัสนี้ในสต็อกมี "หลายสี" ไหม (≥ 2 สีต่างกัน) — ไว้เตือนตอนไม่ได้เลือกสี
export function hasMultipleColors(stock: StockLite[], code: string): boolean {
  const uc = U(code);
  if (!uc || uc === "-") return false;
  const cand = stock.filter((s) => U(s.sku) === uc || U(s.name).includes(uc));
  const colors = new Set<string>();
  for (const s of cand) { const c = stockColorOf(s); if (c) colors.add(normColor(c)); }
  return colors.size >= 2;
}

// สีที่ "มีจริง" ในสต็อก (ไว้ทำ dropdown) — อ่านจากของจริง · เรียงตามลำดับใน KNOWN_ALU_COLORS
export function stockColorOptions(stock: StockLite[]): string[] {
  const found = new Set<string>();
  for (const s of stock) { const c = stockColorOf(s); if (c) found.add(normColor(c)); }
  return KNOWN_ALU_COLORS.filter((c) => found.has(normColor(c)));
}

// map สีเครื่องคิด (key/label ใน alu-colors) → สีในสต็อก แบบ best-effort (ตั้งค่าเริ่มเท่านั้น · ผู้ใช้ปรับได้)
// สีที่สต็อกไม่มี (สีชุบ / ดำซาฮาร่า / อบพิเศษ) → เว้นว่าง ให้ผู้ใช้เลือกเอง (ไม่เดา)
const CALC_COLOR_TO_STOCK: Record<string, string> = {
  white: "อบขาว", อบขาว: "อบขาว",
  black: "ดำ", อบดำ: "ดำ",
  sahara: "เทาซาฮาร่า", เทาซาฮาร่า: "เทาซาฮาร่า",
  aztec: "Aztec gray",
  wood_teak: "ลายไม้สักทอง", wood_maho: "มะฮอกกานี", wood_whiteoak: "ไวท์โอ็ค",
};
export function calcColorToStock(calcColor: unknown): string {
  const k = String(calcColor ?? "").trim();
  return CALC_COLOR_TO_STOCK[k] ?? "";
}
