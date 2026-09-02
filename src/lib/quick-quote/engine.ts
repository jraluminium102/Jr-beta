/**
 * quick-quote engine — คิดราคาประเมินเบื้องต้น (ตาราง "ราคาประเมิน 2026")
 *
 * โมเดล: พื้นที่ = กว้าง×สูง → หาช่วง (tier) → ราคา บ./ตร.ม. × พื้นที่ → ไม่ต่ำกว่าขั้นต่ำ
 *   + เพิ่มบาน (perPanelAdd/tieredAdds) + สี/พื้นผิว (colorAdds บ./ตร.ม.)
 * ⚠ เป็น "ราคาประเมินหน้างาน" ไม่ใช่ราคาจริง/ใบเสนอ — ไว้ให้เซลล์โชว์ลูกค้าคร่าว ๆ
 *
 * ข้อมูลราคามาจาก scripts/build-quote-pricebook.mjs (อ่าน xlsx ของเจ้าของ) — ห้ามแก้มือ
 */

export type Tier = { lo: number; hi: number | null; price: number };
export type Add = { label: string; amount: number };
export type ColorAdd = { name: string; amount: number };
export type Unit = "sqm" | "panel" | "set" | "meter";
// วิธีคิดราคา:
//   per_sqm      = ราคา บ./ตร.ม. × พื้นที่ (ส่วนใหญ่)
//   flat_by_area = เลือกพื้นที่ → ได้ "ราคาต่อชุด" คงที่ตามช่วง (ไม่คูณพื้นที่ · เช่น บานยก/ฝาตู้)
//   per_unit     = ราคาต่อหน่วย × จำนวน (เช่น บานเฟี้ยม บ./บาน)
export type PriceMode = "per_sqm" | "flat_by_area" | "per_unit";

export type Product = {
  key: string;
  category: string;
  unit: Unit;
  priceMode: PriceMode;
  name: string;
  brand: string | null;
  min: number | null;
  flatRate: number | null;
  tiers: Tier[];
  perPanelAdd: Add | null;
  tieredAdds: Add[];
  colorAdds: ColorAdd[];
  unitNote: string | null;
  note: string | null;
};

export type Pricebook = {
  version: string;
  source: string;
  builtAt: string;
  categories: { label: string; count: number }[];
  products: Product[];
};

export type CalcInput = {
  width: number;    // ม. (หรือจำนวนสำหรับ panel/set/meter)
  height: number;   // ม. (ไม่ใช้เมื่อ unit != sqm)
  qty: number;      // จำนวนชุด/จุด (คูณท้ายสุด)
  extraPanels: number;   // จำนวนบานที่เพิ่ม (perPanelAdd) หรือ index ของ tieredAdds
  tieredAddLabel: string | null;  // เลือก "เพิ่ม N บาน" (tieredAdds)
  colorAddName: string | null;    // เลือกสี/พื้นผิว (colorAdds)
};

export type CalcResult = {
  area: number;         // ตร.ม. ต่อ 1 ชุด (unit=sqm) มิฉะนั้น = จำนวนหน่วย
  unitLabel: string;
  rate: number;         // ราคา/หน่วย ที่ใช้ (บ./ตร.ม. หรือ บ./บาน…)
  base: number;         // ราคาฐานต่อ 1 ชุด (ก่อน min)
  minApplied: boolean;
  panelAdd: number;
  colorAdd: number;
  perSet: number;       // รวมต่อ 1 ชุด
  total: number;        // × qty
  note: string | null;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * หาช่วงราคาจากพื้นที่ (lo ≤ area < hi)
 *   ถ้า area ตกในช่องว่างระหว่างช่วง / เกิน / ต่ำกว่าตาราง → ใช้ช่วงที่ lo ไม่เกิน area และ lo มากสุด
 *   (= ช่วงใกล้เคียงด้านล่าง) · ถ้าต่ำกว่าทุกช่วง = ช่วงแรก
 * ⚠ ห้ามคืน tiers[last] แบบตายตัว — ตารางจริงมี gap (เช่น บานหมุน 2.5–2.53) จะได้ราคาช่วงถูกสุดผิด ๆ
 */
export function tierFor(tiers: Tier[], area: number): Tier | null {
  if (!tiers.length) return null;
  for (const t of tiers) {
    if (area >= t.lo && (t.hi == null || area < t.hi)) return t;
  }
  let best: Tier | null = null;
  for (const t of tiers) if (t.lo <= area && (!best || t.lo > best.lo)) best = t;
  return best ?? tiers[0];
}

export const UNIT_LABEL: Record<Unit, string> = {
  sqm: "ตร.ม.",
  panel: "บาน",
  set: "ชุด",
  meter: "เมตร",
};

/** true = รายการนี้กรอกพื้นที่ (กว้าง×สูง) · false = กรอกจำนวนหน่วย */
export function usesArea(p: Product): boolean {
  return p.priceMode === "per_sqm" || p.priceMode === "flat_by_area";
}

/** คิดราคา 1 รายการ */
export function calcItem(p: Product, input: CalcInput): CalcResult {
  const qty = Math.max(1, input.qty || 1);
  let area: number;
  let rate = 0;
  let base = 0;

  if (p.priceMode === "per_sqm") {
    area = r2(Math.max(0, input.width || 0) * Math.max(0, input.height || 0));
    const tier = tierFor(p.tiers, area);
    rate = tier ? tier.price : p.flatRate ?? 0;
    base = r2(area * rate);
  } else if (p.priceMode === "flat_by_area") {
    // เลือกพื้นที่ → ได้ราคาต่อชุดคงที่ (ไม่คูณพื้นที่)
    area = r2(Math.max(0, input.width || 0) * Math.max(0, input.height || 0));
    const tier = tierFor(p.tiers, area);
    rate = tier ? tier.price : p.flatRate ?? p.min ?? 0;
    base = rate;
  } else {
    // per_unit — width = จำนวนหน่วย (บาน/ชุด/เมตร)
    area = Math.max(0, input.width || 0);
    rate = p.flatRate ?? p.min ?? (p.tiers[0]?.price ?? 0);
    base = r2(area * rate);
  }

  let minApplied = false;
  if (p.min != null && base < p.min) { base = p.min; minApplied = true; }

  // เพิ่มบาน
  let panelAdd = 0;
  if (p.tieredAdds.length && input.tieredAddLabel) {
    const a = p.tieredAdds.find((x) => x.label === input.tieredAddLabel);
    if (a) panelAdd = a.amount;
  } else if (p.perPanelAdd && input.extraPanels > 0) {
    panelAdd = p.perPanelAdd.amount * input.extraPanels;
  }

  // สี/พื้นผิว (บ./ตร.ม.) — คิดจากพื้นที่ (เฉพาะ unit=sqm)
  let colorAdd = 0;
  if (p.colorAdds.length && input.colorAddName) {
    const c = p.colorAdds.find((x) => x.name === input.colorAddName);
    if (c) colorAdd = p.priceMode === "per_sqm" ? r2(area * c.amount) : c.amount;
  }

  const perSet = r2(base + panelAdd + colorAdd);
  return {
    area,
    unitLabel: UNIT_LABEL[p.unit],
    rate,
    base,
    minApplied,
    panelAdd,
    colorAdd,
    perSet,
    total: r2(perSet * qty),
    note: p.note,
  };
}

export function baht(n: number): string {
  return (Math.round(n) || 0).toLocaleString("th-TH");
}
