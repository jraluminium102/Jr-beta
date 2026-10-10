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
  // ความหนากระจก — รหัสคิ้วตบกระจกเปลี่ยนตามความหนา (SMS: B24008 / B24016 / B24013)
  //   glass เป็น opts แบบ number ไม่มี choices → ถ้าไม่ไล่ค่า จะเก็บได้แค่รหัสของค่าตั้งต้น
  //   (10 ต.ค.69 เจอว่า B24013/B24016 ไม่ขึ้นหมวดบานเฟี้ยม SMS เพราะเหตุนี้)
  if ((spec.opts ?? []).some((o) => o.key === "glass")) for (const g of [6, 12, 20]) out.push({ ...base, glass: g });
  // มือจับ: sku ขึ้นกับ ยี่ห้อ×สี พร้อมกัน → cross
  for (const b of ["เมโทร", "Align"]) for (const c of ["อบขาว", "ดำ"]) out.push({ ...base, handleBrand: b, handleColor: c });
  return out;
}

/**
 * "อลูเสริม" — ไม่ใช่โปรไฟล์ประตู/หน้าต่าง แต่เป็นเส้นโครง/เส้นปิดที่ใช้ร่วมได้ทุกรุ่น
 *   กล่อง · ฉาก · แซด/ตัว Z · ลูกฟูก · เส้นคาด/เส้นกลาง · ยู · ท่อ · แป๊ป
 *   + ชิ้นชุดสแตนดาร์ด Schimmer ที่สโตร์เรียกชื่อไทย (ตบร่อง/ตบเรียบ/ฝา…) · บังใบกล่อง
 * ⚠ เจ้าของสั่ง 10 ต.ค.69: หมวด "ตามประเภทบาน" (บานเลื่อน/บานเปิด) ให้เอาแค่โปรไฟล์ประตู
 *   ไม่เอากล่อง ฉาก ฯลฯ ที่เป็นอลูมิเนียมเสริม — ของพวกนี้ใช้ได้ทุกรุ่น ติดป้ายรุ่นไม่ได้
 * ตัดสินจาก "ชื่อบรรทัดในสูตรใบตัด" (ถ้อยคำของสูตรเอง) ไม่ใช่เดาจากรหัส
 */
const AUX_ALU_NAME = /^(กล่อง|ฉาก|แซด|ตัว\s?Z|Z\s|ลูกฟูก|เส้นคาด|เส้นกลาง|ยู\s|ท่อ|แป๊ป|บังใบกล่อง|ตบร่อง|ตบเรียบ|ฝาแจ๊คสัน|ฝาปิดกล่อง|คิ้วลอย)/i;
export const isAuxAluName = (name: unknown) => AUX_ALU_NAME.test(String(name ?? "").trim());
// บางบรรทัดเป็น "กล่องที่เอามาใช้เป็นเสา/คาน" ชื่อไม่ได้ขึ้นต้นด้วยกล่อง
//   เช่น toprail "เสารับบาน (กล่อง)" รหัส JR01841 · โน้ตสูตรเขียน "v1: กล่อง 1×4"
//   ก็ยังเป็นอลูเสริม (ใช้กับรุ่นไหนก็ได้) → ดูวงเล็บในชื่อ + สเปกกล่องในโน้ตด้วย
const AUX_HINT = /\((กล่อง|ฉาก|แป๊ป)\)|(กล่อง|ฉาก|แป๊ป)\s*[\d½¼¾]/;
export const isAuxAluLine = (p: { name?: unknown; note?: unknown }, name?: unknown) =>
  isAuxAluName(name ?? p.name) || AUX_HINT.test(String(name ?? p.name ?? "")) || AUX_HINT.test(String(p.note ?? ""));

/** รหัสทั้งหมด (uppercase) ที่ "สเปกเดียว" อ้าง — อลูจากโปรไฟล์ + อุปกรณ์ JR (ทุก variant)
 *  opts.doorOnly = เอาแค่โปรไฟล์ประตู (ตัดอลูเสริมทิ้ง) · ใช้ตอนจัดหมวดตามประเภทบาน */
export function collectCodesForSpec(spec: CutSpec, opts?: { doorOnly?: boolean }): Set<string> {
  const set = new Set<string>();
  for (const v of inputVariants(spec)) {
    const o = { ...spec.defaults, ...v } as CutInput;
    // อลู: รหัสโปรไฟล์ (string หรือ fn)
    for (const p of spec.profiles) {
      const code = typeof p.code === "function" ? p.code(o) : p.code;
      if (!code || code === "-") continue;
      if (opts?.doorOnly) {
        const nm = typeof p.name === "function" ? p.name(o) : p.name;
        if (isAuxAluLine(p, nm) || isAuxAluName(code)) continue;
      }
      set.add(norm(code));
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
