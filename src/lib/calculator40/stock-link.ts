// stock-link.ts — สะพานเชื่อม "สต๊อกวัสดุ" ↔ "คิดราคา 4.0"
// ─────────────────────────────────────────────────────────────
// แนวคิด: pricebook.json = โครงสร้าง/สูตร (คงที่) · ราคาจริง = ดึงจากตาราง stock ตอนโหลดหน้า
//   → แก้ราคาใน stock แล้วใบเสนอราคา 4.0 เปลี่ยนตามทันที (engine.mjs/pricebook.json ไม่ถูกแตะ = verify 63/63 คงเดิม)
// จุดเชื่อม (ตาม engine): GLASS[ชื่อ] · ROOFMAT[ชื่อ] · MOTOR[ชื่อ] · STEEL[sku] · EXTRA[ชื่อ] · ALU[แบรนด์]=ราคา/กก.
//   • อลูคิดจาก "เรตต่อกิโล/แบรนด์" (ตัวคูณ mult) → ใช้ค่าสูงสุดในกลุ่มแบรนด์ (กันคิดขาด) ควรตั้งให้เท่ากันทั้งแบรนด์
import PRICEBOOK from "./pricebook.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PB: any = PRICEBOOK;
const glassNames = new Set(Object.keys(PB.GLASS || {}));
const roofNames = new Set(Object.keys(PB.ROOFMAT || {}));
const motorNames = new Set(Object.keys(PB.MOTOR || {}));
const steelKeys = new Set(Object.keys(PB.STEEL || {}));
const extraNames = new Set(Object.keys(PB.EXTRA || {}));
const aluBrands = new Set(Object.keys(PB.ALU || {}));
const partNames = new Set(Object.keys(PB.PARTS || {}));   // อุปกรณ์/โปรไฟล์/สิ้นเปลือง รุ่นถอดทุนใหม่ (partsLinked) — ผูกตามชื่อ

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
};

// สร้าง "ผังราคาทับ" จากแถว stock (เทียบกับ pricebook pb) — เฉพาะราคา > 0 (กันวัสดุยังไม่ตั้งราคา = 0 ไปล้างราคาสูตร)
export function buildPriceOverride(rows: StockRow[], pb: any = PB): PriceOverride {
  const ov: PriceOverride = { GLASS: {}, ROOFMAT: {}, MOTOR: {}, STEEL: {}, EXTRA: {}, ALU: {}, PARTS: {} };
  const aluByBrand: Record<string, number> = {};
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
    }
    // อลู: เรตต่อกิโล/แบรนด์ = ค่าสูงสุดในกลุ่ม (กันคิดขาด)
    if (r.is_weight_based && r.supplier && pb.ALU && r.supplier in pb.ALU) {
      const rate = Number(r.price_per_kg) || 0;
      if (rate > 0) aluByBrand[r.supplier] = Math.max(aluByBrand[r.supplier] || 0, rate);
    }
  }
  for (const b in aluByBrand) ov.ALU[b] = aluByBrand[b];
  return ov;
}

// ทับราคาลง pricebook (mutate) — เรียกกับสำเนา pb เท่านั้น
export function applyPriceOverride(pb: any, ov?: PriceOverride | null): any {
  if (!pb || !ov) return pb;
  for (const sec of ["GLASS", "ROOFMAT", "MOTOR", "STEEL", "ALU", "PARTS"] as const) {
    const o = ov[sec];
    if (o && pb[sec]) for (const k in o) pb[sec][k] = o[k];
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
