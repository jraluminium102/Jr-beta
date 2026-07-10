// stock-link.ts — สะพานเชื่อม "สต๊อกวัสดุ" ↔ "คิดราคา 4.0"
// ─────────────────────────────────────────────────────────────
// แนวคิด: pricebook.json = โครงสร้าง/สูตร (คงที่) · ราคาจริง = ดึงจากตาราง stock ตอนโหลดหน้า
//   → แก้ราคาใน stock แล้วใบเสนอราคา 4.0 เปลี่ยนตามทันที (engine.mjs/pricebook.json ไม่ถูกแตะ = verify 63/63 คงเดิม)
// จุดเชื่อม (ตาม engine): GLASS[ชื่อ] · ROOFMAT[ชื่อ] · MOTOR[ชื่อ] · STEEL[sku] · EXTRA[ชื่อ] · ALU[แบรนด์]=ราคา/กก. · ALUCODE[รหัส]=ราคา/เส้น
//   • อลูคิดจาก "เรตต่อกิโล/แบรนด์" (ตัวคูณ mult) → ใช้ค่าสูงสุดในกลุ่มแบรนด์ (กันคิดขาด) ควรตั้งให้เท่ากันทั้งแบรนด์
//   • อลูรายเส้น (ก.ค.2026): ผูกด้วยรหัส stock_items.sku ↔ products.alu[].code (B####/F####/E-##/WM-K##)
//     รหัสเดียวหลายแถว(แยกสี) → ใช้ราคาแถว "อบขาว" (ค่าสีคิดเป็นค่าอบ/กก. ใน engine อยู่แล้ว) · ไม่มีอบขาว = สูงสุด
import PRICEBOOK from "./pricebook.json";
import { PRODUCTS } from "./products.mjs";

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
};

// สร้าง "ผังราคาทับ" จากแถว stock (เทียบกับ pricebook pb) — เฉพาะราคา > 0 (กันวัสดุยังไม่ตั้งราคา = 0 ไปล้างราคาสูตร)
export function buildPriceOverride(rows: StockRow[], pb: any = PB): PriceOverride {
  const ov: PriceOverride = { GLASS: {}, ROOFMAT: {}, MOTOR: {}, STEEL: {}, EXTRA: {}, ALU: {}, PARTS: {}, ALUCODE: {} };
  const aluByBrand: Record<string, number> = {};
  // อลูรายเส้น: รหัสเดียวมีหลายแถว (แยกสี) → ราคาตัวตั้ง = แถว "อบขาว" ก่อน (ราคาฐานดิบ — ค่าสีคิดแยกใน engine เป็นค่าอบ/กก.)
  // ไม่มีอบขาว = ค่าต่ำสุด (ผลตรวจบัญชี: ถ้าใช้ max จะหยิบแถวสีพิเศษที่รวมค่าเคลือบแล้ว → engine บวกค่าอบซ้ำ = คิดเกิน)
  const aluByCode: Record<string, { white: number; min: number }> = {};
  for (const r of rows || []) {
    const name = (r.name || "").trim();
    const sku = (r.sku || "").trim();
    const cost = Number(r.unit_cost) || 0;
    if (cost > 0) {
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
        if (name.includes("อบขาว")) e.white = Math.max(e.white, cost);
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
