/**
 * cutlist/codes — รวม "รหัสทั้งหมดที่ใบตัด/BOQ อ้างถึง" (อลู B####/F#### + อุปกรณ์ JR#####)
 * ใช้มาร์คในหน้าสต็อกว่าวัสดุตัวไหนถูกใช้ในใบตัด · ครอบทุก variant (ราง/สี/ยี่ห้อ/ตัวเลือกรุ่น)
 */
import type { CutInput, CutSpec } from "./engine.ts";
import { CUT_SPECS } from "./products.ts";

const norm = (s: string) => s.trim().toUpperCase();

// สร้างชุด input ทดสอบต่อสเปก — คลุมทุกกิ่งเงื่อนไข (รหัสขึ้นกับ ราง/box/สี/ยี่ห้อมือจับ/ฯลฯ)
function inputVariants(spec: CutSpec): Partial<CutInput>[] {
  const base = { ...spec.defaults };
  const out: Partial<CutInput>[] = [base];
  // ทุกตัวเลือกใน opts (box/sys/hwColor/lockType/openDir/fold2/มือจับ ฯลฯ)
  for (const o of spec.opts ?? []) {
    if (!o.choices) continue;
    for (const c of o.choices) out.push({ ...base, [o.key]: c });
  }
  // ราง
  for (const r of spec.rails ?? []) out.push({ ...base, rail: r });
  // มือจับ: sku ขึ้นกับ ยี่ห้อ×สี พร้อมกัน → cross
  for (const b of ["เมโทร", "Align"]) for (const c of ["อบขาว", "ดำ"]) out.push({ ...base, handleBrand: b, handleColor: c });
  return out;
}

/** รหัสทั้งหมด (uppercase) ที่ "สเปกเดียว" อ้าง — อลูจากโปรไฟล์ + อุปกรณ์ JR (ทุก variant) */
export function collectCodesForSpec(spec: CutSpec): Set<string> {
  const set = new Set<string>();
  for (const v of inputVariants(spec)) {
    const o = { ...spec.defaults, ...v } as CutInput;
    // อลู: รหัสโปรไฟล์ (string หรือ fn)
    for (const p of spec.profiles) {
      const code = typeof p.code === "function" ? p.code(o) : p.code;
      if (code && code !== "-") set.add(norm(code));
    }
    // อุปกรณ์: sku (string หรือ fn — มือจับตามยี่ห้อ/สี)
    for (const h of spec.hardware ?? []) {
      const sku = typeof h.sku === "function" ? h.sku(o) : h.sku;
      if (sku) set.add(norm(sku));
    }
  }
  return set;
}

let cached: Set<string> | null = null;
/** เซ็ตรหัสทั้งหมด (uppercase) ที่ใบตัดอ้าง — อลูจากโปรไฟล์ + อุปกรณ์ JR จาก hardware.sku (ทุก variant) */
export function collectCutlistCodes(): Set<string> {
  if (cached) return cached;
  const set = new Set<string>();
  for (const spec of CUT_SPECS) for (const c of collectCodesForSpec(spec)) set.add(c);
  cached = set;
  return set;
}

/** วัสดุตัวนี้ถูกใช้ในใบตัด/BOQ ไหม (เทียบ sku ตรง · uppercase) */
export function isInCutlist(sku?: string | null): boolean {
  if (!sku) return false;
  return collectCutlistCodes().has(norm(String(sku)));
}
