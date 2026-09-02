/**
 * hardware-from-cutlist — "ค่าของ" อุปกรณ์ในคิดราคา 4.0 ดึงรายการมาจาก "ใบตัด" ตัวเดียวกัน
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไม (เจ้าของสั่ง 19 ส.ค.69): ใบตัด SMS แตกอุปกรณ์ 15 บรรทัด มีรหัสสโตร์ครบ ไล่เช็คแล้วถูก
 *   แต่คิดราคาย่อเหลือ 6 บรรทัด ราคาฝังตายตัว → ของที่เบิกจริงกับของที่คิดเงิน "คนละชุด"
 *   แก้: ให้คิดราคาเรียกเอนจินใบตัดมาเป็นรายการอุปกรณ์ แล้วคิดราคาจากรหัสสโตร์เดียวกัน
 *   → เพิ่ม/แก้อุปกรณ์ในใบตัดที่เดียว คิดราคาเด้งตาม ไม่มีทางหลุดกัน
 *
 * มือจับ: ใบตัดเลือกได้ ยี่ห้อ (เมโทร/Align) × สี (อบขาว/ดำ) × ชนิดต่อบาน (กุญแจ+ล็อค / ล็อค+ดัมมี่ / ...)
 *   แต่ละคู่ = คนละรหัสสโตร์ (เมโทรกุญแจอบขาว=JR00368 · ดำ=JR00371 ...) → ราคาแยกกันได้จริง
 *
 * ทยอยเปิดทีละรุ่น (HW_FROM_CUTLIST) — รุ่นที่ยังไม่เปิด ใช้รายการอุปกรณ์เดิมในสูตรเหมือนเดิม
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeCutList, type CutInput } from "../cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../cutlist/products.ts";
import { cutInputFromRecipe } from "../cutlist/from-recipe.ts";
import { HANDLE_BRANDS, HANDLE_COLORS, HANDLE_TYPES } from "../cutlist/hardware.ts";

/**
 * รุ่นที่ "ค่าของ" คิดจากใบตัด — เจ้าของเคาะ 2 ก.ย.69 ให้เปิด "ทุกรุ่นที่ผูกใบตัดได้"
 *   คำถามเจ้าของ: "จะเช็คยังไงว่าคิดราคาใช้เหมือนตัดประกอบ" → คำตอบที่ถาวรคือ ไม่ต้องเช็ค ให้มันเป็นชุดเดียวกัน
 *   เดิมเปิดทีละรุ่น (sms_slide · euro_slide · folding · pcdoor) เหลืออีก 6 รุ่นที่ผูกได้แต่ยังไม่เปิด
 *
 * ⚠ เปิดทั้งหมดได้อย่างปลอดภัย เพราะ engine กันไว้แล้ว (ดู engine.mjs "กันคิดต่ำกว่าจริงเงียบ ๆ"):
 *   รหัสไหนยังไม่มีราคาในสโตร์แม้แต่ตัวเดียว → ไม่ใช้รายการจากใบตัดทั้งชุด กลับไปใช้ราคาเดิมในสูตร
 *   แล้วรายงาน hwMissing ขึ้นหน้าจอว่าต้องไปตั้งราคารหัสไหน → ราคาไม่มีทางตกเงียบ ๆ
 *   ⇒ รุ่นที่เจ้าของตั้งราคาสโตร์ครบแล้วจะสลับมาใช้ใบตัดเอง รุ่นที่ยังไม่ครบก็อยู่เฉย ๆ รอ
 *
 * รุ่นที่ยังเปิดไม่ได้ = cutInputFromRecipe แมปเข้าใบตัดไม่ได้ (ยังไม่มีสูตรใบตัด) — เพิ่มสูตรก่อนถึงจะเปิดได้
 */
export const HW_FROM_CUTLIST = new Set<string>([
  "sms_slide", "euro_slide", "folding", "pcdoor",   // เปิดมาก่อน (19–24 ส.ค.69)
  "slimlux", "fixed", "velora", "fold_euro", "gate", "fold_lift",   // เปิดเพิ่ม 2 ก.ย.69 ตามที่เจ้าของเคาะ
]);

/** หน่วยที่สโตร์ตั้งราคาเป็น "แพ็ค" แต่ใบตัดนับเป็นหน่วยย่อย → ตัวหารให้ได้ราคาต่อหน่วยย่อย */
export const SKU_PACK: Record<string, { per: number; note: string }> = {
  JR00794: { per: 250, note: "สักหลาด 5×3 ม้วนละ 250 ม. → ราคาต่อเมตร = ราคาม้วน ÷ 250" },
};

/** ตัวเลือกมือจับที่โผล่ในหน้าคิดราคา (ชุดเดียวกับใบตัด — ห้ามแยกรายการกัน) */
export const HANDLE_FIELDS = [
  { key: "handleBrand", label: "ยี่ห้อมือจับ", choices: [...HANDLE_BRANDS], def: "Align" },
  { key: "handleColor", label: "สีมือจับ", choices: [...HANDLE_COLORS], def: "อบขาว" },
  { key: "handleL", label: "มือจับ ซ้าย", choices: [...HANDLE_TYPES], def: "กุญแจ+ล็อค" },
  { key: "handleR", label: "มือจับ ขวา", choices: [...HANDLE_TYPES], def: "ล็อค+ดัมมี่" },
] as const;

export type HwLine = { name: string; sku: string; qty: number; unit: string; per?: number; note?: string; noStock?: boolean };

export type CalcHwInput = {
  prodId: string;
  w: number; h: number; p: number;
  form?: string;
  spec?: Record<string, unknown>;
  /** ตัวเลือกมือจับ/มุ้ง ฯลฯ ที่ผู้ใช้เลือกในหน้าคิดราคา — ส่งต่อเข้าใบตัดตรง ๆ */
  cut?: Record<string, unknown>;
};

/**
 * รายการอุปกรณ์ + รหัสสโตร์ + จำนวน ของรุ่นนี้ที่ขนาด/รูปแบบนี้ (ชุดเดียวกับที่ช่างเบิก)
 * คืน null = รุ่นนี้ยังไม่เปิด หรือแมปเข้าใบตัดไม่ได้ → ผู้เรียกใช้รายการเดิมในสูตร
 */
export function cutHardwareLines(inp: CalcHwInput): HwLine[] | null {
  if (!HW_FROM_CUTLIST.has(inp.prodId)) return null;
  const map = cutInputFromRecipe({
    kind: "std", prodId: inp.prodId,
    w: inp.w, h: inp.h, p: inp.p, form: inp.form ?? "", spec: inp.spec ?? {},
  });
  if (!map) return null;
  const spec = CUT_SPEC_BY_ID[map.spec_id];
  if (!spec) return null;
  // ตัวเลือกที่ผู้ใช้เลือกในคิดราคา (มือจับ/มุ้ง) ทับค่าตั้งต้นของใบตัด
  const cut = Object.fromEntries(Object.entries(inp.cut ?? {}).filter(([, v]) => v != null && v !== ""));
  const input = { ...map.input, ...cut } as Partial<CutInput>;
  const r = computeCutList(spec, input, map.multiplier ?? 1);
  return r.hardware.map((h) => ({
    name: h.name, sku: h.sku, qty: h.qty, unit: h.unit,
    per: SKU_PACK[h.sku]?.per, note: h.note, noStock: h.noStock,
  }));
}
