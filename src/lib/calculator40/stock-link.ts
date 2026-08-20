// stock-link.ts — สะพานเชื่อม "สต๊อกวัสดุ" ↔ "คิดราคา 4.0"
// ─────────────────────────────────────────────────────────────
// แนวคิด: pricebook.json = โครงสร้าง/สูตร (คงที่) · ราคาจริง = ดึงจากตาราง stock ตอนโหลดหน้า
//   → แก้ราคาใน stock แล้วใบเสนอราคา 4.0 เปลี่ยนตามทันที (engine.mjs/pricebook.json ไม่ถูกแตะ = verify 63/63 คงเดิม)
// จุดเชื่อม (ตาม engine): GLASS[ชื่อ] · ROOFMAT[ชื่อ] · MOTOR[ชื่อ] · STEEL[sku] · EXTRA[ชื่อ] · ALU[แบรนด์]=ราคา/กก. · ALUCODE[รหัส]=ราคา/เส้น
//   • อลูคิดจาก "เรตต่อกิโล/แบรนด์" (ตัวคูณ mult) → ใช้ค่าสูงสุดในกลุ่มแบรนด์ (กันคิดขาด) ควรตั้งให้เท่ากันทั้งแบรนด์
//   • อลูรายเส้น (ก.ค.2026): ผูกด้วยรหัส stock_items.sku ↔ products.alu[].code (B####/F####/E-##/WM-K##)
//     รหัสเดียวหลายแถว(แยกสี) → ใช้ราคาแถว "อบขาว" (ค่าสีคิดเป็นค่าอบ/กก. ใน engine อยู่แล้ว) · ไม่มีอบขาว = สูงสุด
import PRICEBOOK from "./pricebook.json" with { type: "json" };
import { PRODUCTS } from "./products.mjs";
import { buildBoxPrices, type BoxPrices } from "./box-link.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PB: any = PRICEBOOK;
const glassNames = new Set(Object.keys(PB.GLASS || {}));
const roofNames = new Set(Object.keys(PB.ROOFMAT || {}));
const motorNames = new Set(Object.keys(PB.MOTOR || {}));
const steelKeys = new Set(Object.keys(PB.STEEL || {}));
const extraNames = new Set(Object.keys(PB.EXTRA || {}));
const aluBrands = new Set(Object.keys(PB.ALU || {}));
const partNames = new Set(Object.keys(PB.PARTS || {}));   // อุปกรณ์/โปรไฟล์/สิ้นเปลือง รุ่นถอดทุนใหม่ (partsLinked) — ผูกตามชื่อ

// รหัสอลูรายเส้น (B####/F####/E-##/WM-K##) จากสูตรทุกรุ่น — ผูกกับ stock_items.sku (ALUCODE override)
const normCode = (s: string) => s.trim().toUpperCase();
const aluCodes = new Set<string>();
for (const p of Object.values(PRODUCTS as Record<string, any>))
  for (const a of (p?.alu || [])) if (a.code) aluCodes.add(normCode(a.code));

// sku นี้ผูกรายเส้นกับสูตร 4.0 ไหม (ใช้แสดงคำอธิบายหน้าสต็อก)
export const isAluCode = (sku?: string | null) => !!sku && aluCodes.has(normCode(sku));

export type CalcSection = "กระจก" | "หลังคา/ผนัง" | "มอเตอร์/ออโต้" | "เหล็ก" | "งานเสริม" | "อลูมิเนียม" | "ถอดทุน 4.0";

type LinkInput = {
  name?: string | null;
  sku?: string | null;
  supplier?: string | null;
  is_weight_based?: boolean | null;
};

// วัสดุตัวนี้ถูกนำไปใช้ในคิดราคา 4.0 ไหม (+ อยู่หมวดไหนของสูตร)
export function calcLink(item: LinkInput): { linked: boolean; section?: CalcSection } {
  const name = (item.name || "").trim();
  const sku = (item.sku || "").trim();
  if (name && glassNames.has(name)) return { linked: true, section: "กระจก" };
  if (name && roofNames.has(name)) return { linked: true, section: "หลังคา/ผนัง" };
  if (name && motorNames.has(name)) return { linked: true, section: "มอเตอร์/ออโต้" };
  if (sku && steelKeys.has(sku)) return { linked: true, section: "เหล็ก" };
  if (name && extraNames.has(name)) return { linked: true, section: "งานเสริม" };
  if (name && partNames.has(name)) return { linked: true, section: "ถอดทุน 4.0" };
  if (sku && aluCodes.has(normCode(sku))) return { linked: true, section: "อลูมิเนียม" };   // ผูกรายเส้นด้วยรหัส
  if (item.is_weight_based && item.supplier && aluBrands.has(item.supplier))
    return { linked: true, section: "อลูมิเนียม" };
  return { linked: false };
}

export type StockRow = LinkInput & { unit_cost?: number | string | null; price_per_kg?: number | string | null };
export type PriceOverride = {
  GLASS: Record<string, number>;
  ROOFMAT: Record<string, number>;
  MOTOR: Record<string, number>;
  STEEL: Record<string, number>;
  EXTRA: Record<string, number>;
  ALU: Record<string, number>;
  PARTS: Record<string, number>;
  ALUCODE: Record<string, number>;   // ราคาเส้น/รหัส (B####/F####) — engine ใช้ก่อน PARTS/ราคา BOM
  // ราคาเส้นแยก "สีจริงในสโตร์" → ALUCOLOR_STOCK["เทาซาฮาร่า"]["B20001"] = 1225
  //   แยก อบขาว/ดำ ออกจากกันด้วย (ตอนนี้ราคาเท่ากัน แต่วันหน้าไม่เท่า แก้ในสโตร์ได้เลย)
  ALUCOLOR_STOCK: Record<string, Record<string, number>>;
  // ราคาต่อรหัสสโตร์ (JR#####) — ใช้คิด "ค่าของ" อุปกรณ์ที่ดึงรายการมาจากใบตัด
  //   ใบตัดผูก sku ไว้ครบแล้ว → คิดราคาอ่านราคาจากรหัสเดียวกัน = ของชิ้นเดียวกัน ราคาเดียวกัน
  SKUPRICE: Record<string, number>;
  // กล่อง/ฉาก อลูเมืองทอง — ไม่มีรหัสโปรไฟล์ ผูกด้วย "ชนิด+ขนาด" แล้วแยกราคาตามสี
  BOXPRICE: BoxPrices;
};

// ── สีจริงจากสโตร์ (เจ้าของยืนยัน 8 ส.ค.69: ยึดราคาสีตามสโตร์) ─────────────────
// สโตร์ตั้ง "รหัสเดียวกันทุกสี" แล้วแยกด้วยช่อง สี — ถูกต้องแล้ว ไม่ต้องแก้สโตร์
//   ของเดิมอ่านเฉพาะแถวสีอบขาวแถวเดียว สีอื่นถูกทิ้ง → สีเทา/ลายไม้ไปคิดแบบ ขาว+ค่าอบ×กก. (แพงเกิน)
const CALC_TO_STOCK_COLOR: Record<string, string> = {
  white: "อบขาว", black: "ดำ", sahara: "เทาซาฮาร่า", sahara_black: "ดำซาฮาร่า",
  aztec: "Aztec gray", wood_teak: "ลายไม้สักทอง", wood_maho: "มะฮอกกานี", wood_whiteoak: "ไวท์โอ็ค",
};
const normColorName = (s: unknown) => String(s ?? "").replace(/\s+/g, "").trim();
/** ชื่อสีในสโตร์ ของสีที่เลือกในเครื่องคิดราคา ("" = สีนั้นไม่มีในสโตร์ เช่น สีอบพิเศษ/สีชุบ) */
export const stockColorOfCalc = (calcColorKey?: string | null) =>
  normColorName(CALC_TO_STOCK_COLOR[String(calcColorKey ?? "")] ?? "");
/** สีของแถวสต็อก — ใช้ช่อง สี ก่อน · ไม่มีค่อยอ่านท้ายชื่อ ("F7935-คิ้ว-อบขาว") */
function rowColor(r: StockRow): string {
  const c = normColorName((r as { color?: string | null }).color);
  if (c) return c;
  const t = String(r.name ?? "");
  const i = t.lastIndexOf("-");
  return i >= 0 ? normColorName(t.slice(i + 1)) : "";
}

// สร้าง "ผังราคาทับ" จากแถว stock (เทียบกับ pricebook pb) — เฉพาะราคา > 0 (กันวัสดุยังไม่ตั้งราคา = 0 ไปล้างราคาสูตร)
export function buildPriceOverride(rows: StockRow[], pb: any = PB): PriceOverride {
  const ov: PriceOverride = { GLASS: {}, ROOFMAT: {}, MOTOR: {}, STEEL: {}, EXTRA: {}, ALU: {}, PARTS: {}, ALUCODE: {}, ALUCOLOR_STOCK: {}, SKUPRICE: {}, BOXPRICE: {} };
  // กล่อง/ฉาก: จับคู่ด้วยชื่อ+ขนาด (สโตร์ตั้งชื่อลงตัว เช่น `กล่อง 4"x6"-Aztec gray`)
  ov.BOXPRICE = buildBoxPrices(rows as any);
  const aluByBrand: Record<string, number> = {};
  // อลูรายเส้น: รหัสเดียวมีหลายแถว (แยกสี) → ราคาตัวตั้ง = แถว "อบขาว" ก่อน (ราคาฐานดิบ — ค่าสีคิดแยกใน engine เป็นค่าอบ/กก.)
  // ไม่มีอบขาว = ค่าต่ำสุด (ผลตรวจบัญชี: ถ้าใช้ max จะหยิบแถวสีพิเศษที่รวมค่าเคลือบแล้ว → engine บวกค่าอบซ้ำ = คิดเกิน)
  const aluByCode: Record<string, { white: number; min: number }> = {};
  for (const r of rows || []) {
    const name = (r.name || "").trim();
    const sku = (r.sku || "").trim();
    const cost = Number(r.unit_cost) || 0;
    if (cost > 0) {
      // ราคาต่อรหัสสโตร์ — เก็บทุกแถวที่มีรหัส (ซ้ำรหัส = เอาถูกสุด กันแถวสีพิเศษดันราคาขึ้น)
      if (sku) { const k = normCode(sku); ov.SKUPRICE[k] = ov.SKUPRICE[k] > 0 ? Math.min(ov.SKUPRICE[k], cost) : cost; }
      if (name && pb.GLASS && name in pb.GLASS) ov.GLASS[name] = cost;
      else if (name && pb.ROOFMAT && name in pb.ROOFMAT) ov.ROOFMAT[name] = cost;
      else if (name && pb.MOTOR && name in pb.MOTOR) ov.MOTOR[name] = cost;
      else if (sku && pb.STEEL && sku in pb.STEEL) ov.STEEL[sku] = cost;
      else if (name && pb.EXTRA && name in pb.EXTRA) ov.EXTRA[name] = cost;
      else if (name && pb.PARTS && name in pb.PARTS) ov.PARTS[name] = cost;   // อุปกรณ์/โปรไฟล์ ถอดทุน 4.0
      // อลูรายเส้นด้วยรหัส (ไม่ else — แถวเดียวเป็นได้ทั้ง PARTS(ชื่อ) และ ALUCODE(รหัส))
      const code = sku ? normCode(sku) : "";
      if (code && aluCodes.has(code)) {
        const e = aluByCode[code] || (aluByCode[code] = { white: 0, min: 0 });
        e.min = e.min > 0 ? Math.min(e.min, cost) : cost;
        // ⚠ สีต้องอ่านจาก "ช่องสี" ก่อน แล้วค่อยดูในชื่อ — ใช้ rowColor() ตัวเดียวกับที่อื่น
        //   บั๊กเดิม: เช็คแค่ชื่อ (name.includes("อบขาว")) แต่สโตร์เก็บสีไว้ในช่อง color
        //   → หาแถวอบขาวไม่เจอ เลยตกไปใช้ "ราคาต่ำสุด" ของรหัสนั้น (คนละแถวกับที่หน้าตรวจโชว์)
        //   = หน้าตรวจขึ้น "ผูกแล้ว แต่ราคาไม่ตรง" ทั้งที่ผูกอยู่ (เจ้าของเจอเอง 19 ส.ค.69)
        if (rowColor(r) === "อบขาว" || name.includes("อบขาว")) e.white = Math.max(e.white, cost);
        // เก็บราคา "ทุกสี" ไว้ด้วย (รหัสเดียวกันหลายแถว = คนละสี) — สีเดียวกันซ้ำหลายแถว เอาถูกสุด
        const rc = rowColor(r);
        if (rc) {
          const bucket = ov.ALUCOLOR_STOCK[rc] || (ov.ALUCOLOR_STOCK[rc] = {});
          bucket[code] = bucket[code] > 0 ? Math.min(bucket[code], cost) : cost;
        }
      }
    }
    // อลู: เรตต่อกิโล/แบรนด์ = ค่าสูงสุดในกลุ่ม (กันคิดขาด)
    if (r.is_weight_based && r.supplier && pb.ALU && r.supplier in pb.ALU) {
      const rate = Number(r.price_per_kg) || 0;
      if (rate > 0) aluByBrand[r.supplier] = Math.max(aluByBrand[r.supplier] || 0, rate);
    }
  }
  for (const b in aluByBrand) ov.ALU[b] = aluByBrand[b];
  for (const c in aluByCode) ov.ALUCODE[c] = aluByCode[c].white || aluByCode[c].min;
  return ov;
}

// ทับราคาลง pricebook (mutate) — เรียกกับสำเนา pb เท่านั้น
export function applyPriceOverride(pb: any, ov?: PriceOverride | null): any {
  if (!pb || !ov) return pb;
  // ราคาแยกสีจากสโตร์ — สโตร์เป็นตัวตั้ง ทับตารางในไฟล์
  if (ov.ALUCOLOR_STOCK && Object.keys(ov.ALUCOLOR_STOCK).length) {
    pb.ALUCOLOR_STOCK = pb.ALUCOLOR_STOCK || {};
    for (const c in ov.ALUCOLOR_STOCK) pb.ALUCOLOR_STOCK[c] = { ...(pb.ALUCOLOR_STOCK[c] || {}), ...ov.ALUCOLOR_STOCK[c] };
  }
  if (ov.SKUPRICE && Object.keys(ov.SKUPRICE).length) pb.SKUPRICE = { ...(pb.SKUPRICE || {}), ...ov.SKUPRICE };
  if (ov.BOXPRICE && Object.keys(ov.BOXPRICE).length) {
    pb.BOXPRICE = pb.BOXPRICE || {};
    for (const k in ov.BOXPRICE) pb.BOXPRICE[k] = { ...(pb.BOXPRICE[k] || {}), ...ov.BOXPRICE[k] };
  }
  // ธง "ราคาเส้นนี้มาจากสโตร์" — engine ใช้กัน mult คูณซ้ำ (สโตร์คิด น้ำหนัก×เรตต่อโล ให้แล้ว)
  pb.ALUCODE_FROM_STOCK = pb.ALUCODE_FROM_STOCK || {};
  for (const c in ov.ALUCODE || {}) pb.ALUCODE_FROM_STOCK[c] = true;
  for (const sec of ["GLASS", "ROOFMAT", "MOTOR", "STEEL", "ALU", "PARTS", "ALUCODE"] as const) {
    const o = ov[sec];
    if (!o) continue;
    if (!pb[sec] && sec === "ALUCODE" && Object.keys(o).length) pb[sec] = {};   // pricebook.json ไม่มี ALUCODE ตั้งต้น (ไม่แตะไฟล์ = verify คงเดิม)
    if (pb[sec]) for (const k in o) pb[sec][k] = o[k];
  }
  // EXTRA: ค่าเป็น object {make, install, unit} — ทับช่องที่มีอยู่จริง (ให้ค่า make ก่อน install)
  if (ov.EXTRA && pb.EXTRA) {
    for (const k in ov.EXTRA) {
      const cur = pb.EXTRA[k];
      if (cur && typeof cur === "object") {
        if (typeof cur.make === "number") cur.make = ov.EXTRA[k];
        else if (typeof cur.install === "number") cur.install = ov.EXTRA[k];
      }
    }
  }
  return pb;
}
