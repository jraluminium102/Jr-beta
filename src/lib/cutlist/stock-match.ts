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

export type StockLite = { id?: number; sku: string; name: string; qty: number; image?: string; unitCost?: number; category?: string; unit?: string };

/**
 * ดึง stock_items "ทั้งหมด" แบบแบ่งหน้า — PostgREST/Supabase คืนสูงสุด ~1,000 แถว/ครั้ง
 * สต็อกจริงมี ~1,800 แถว → ดึงครั้งเดียวได้ไม่ครบ รหัสที่อยู่หลังแถว 1,000 (เช่น กล่อง 2"x4")
 * จะกลายเป็น "ไม่มีในสต็อก" บนจอ และ "ถูกข้ามตอนหักสต็อก" เงียบๆ (เจอจริงบน production 16 ก.ค.69)
 * ใช้ตัวนี้ทุกที่ที่ต้องจับคู่รหัสใบตัด ↔ สต็อก (หน้า editor + cut-stock)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllStockRows<T = any>(
  // supabase client (typed หลวมเพราะโปรเจกต์ยังไม่ gen types ตารางนี้)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: { from: (t: string) => any },
  columns: string,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let fromIdx = 0; ; fromIdx += PAGE) {
    const { data, error } = await sb
      .from("stock_items")
      .select(columns)
      .eq("is_active", true)
      .order("id", { ascending: true }) // ต้อง order คงที่ ไม่งั้น range เลื่อนแล้วแถวซ้ำ/หาย
      .range(fromIdx, fromIdx + PAGE - 1);
    if (error || !data) break; // ได้เท่าที่ได้ — ดีกว่าล้มทั้งหน้า (พฤติกรรมเดิมก็ไม่เช็ค error)
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}

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
/** ดึงสีจากชื่อ/รหัส (สำหรับเติมช่องสีอัตโนมัติ) — คืน "" ถ้าชื่อไม่มีสีที่รู้จัก */
export function colorFromName(name?: string, sku?: string): string {
  return stockColorOf({ name: name ?? "", sku: sku ?? "", qty: 0 });
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

/**
 * จับคู่ "อุปกรณ์" (ฮาร์ดแวร์) → รายการสต็อก
 *
 * ปัญหาที่แก้ (เจ้าของทัก 24 ส.ค.69): ใบตัดเฟี้ยมยูโร/เฟี้ยมยก เขียนรหัสผู้ผลิตตรง ๆ (HD-640)
 *   สโตร์ก็มีของจริง แต่เก็บรหัสไว้ "ในชื่อ" (เช่น "HD-640 บานพับล้อบนเฟี้ยม") ส่วนช่อง sku
 *   เป็น JR##### ที่รันอัตโนมัติ → ฝั่งราคาหาเจอ (อ่านรหัสจากชื่อ) แต่ฝั่ง "ตัดออกสโตร์"
 *   จับคู่ด้วย sku ตรงตัวอย่างเดียว อุปกรณ์เฟี้ยมยูโรจึงไม่เคยถูกหักออกจากสต็อกเลย
 *
 * ลำดับ: ① sku ตรงตัว (พฤติกรรมเดิม ไม่เปลี่ยน) → ② รหัสผู้ผลิตในชื่อ (ต้องเจอตัวเดียวเท่านั้น)
 * ⚠ เจอหลายตัว = คืน null ตั้งใจ — ยอมข้ามดีกว่าหักผิดตัว (คนกดจะเห็นในรายการที่ข้าม)
 */
const HW_CODE = /^(?:HD-?\d{3,4}[A-Z]?|\d{2}-\d{3}(?:-[A-Z]{2})?)$/i;
export function resolveHwStock(stock: StockLite[], sku: string): StockLite | null {
  const want = U(sku);
  if (!want) return null;
  const exact = stock.find((s) => U(s.sku) === want);
  if (exact) return exact;
  if (!HW_CODE.test(want)) return null;   // JR##### ที่หา sku ไม่เจอ = ไม่มีจริง อย่าเดาจากชื่อ
  // ขอบคำ: "HD-200" ต้องไม่ไปแมช "HD-2000" (ใช้ includes เฉย ๆ จะหักผิดตัวเงียบ ๆ)
  const re = new RegExp(`(^|[^0-9A-Z])${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9A-Z]|$)`, "i");
  const hits = stock.filter((s) => re.test(String(s.name ?? "")));
  return hits.length === 1 ? hits[0] : null;
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
