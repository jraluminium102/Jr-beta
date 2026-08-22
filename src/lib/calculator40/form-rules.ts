/**
 * form-rules — กติกา "รูปแบบการเปิด" ของแต่ละรุ่น (จำนวนบานที่ทำได้ + คำอธิบายให้คนคิดราคาเข้าใจ)
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไม (เจ้าของสั่ง 21 ส.ค.69): "เปิดคู่กลาง" มีแค่ 4 บาน กับ 6 บาน (ทั้งคู่มีบานติดตาย 2 บาน)
 *   เดิมเลือก 2-3 บานได้ → สูตรหักบานติดตาย 2 ทิ้งเสมอ กลายเป็น "ล้อ 0 ตัว" แต่ราคายังออกสวย ๆ
 *   ไม่มีใครจับได้ → ต้องล็อกจำนวนบาน + เขียนบอกบนหน้าจอ
 *
 * เก็บกติกาไว้ที่ prod.formRules (products.mjs) — หน้า G1 · ห้องกระจก · ชุดผสมบาน อ่านจากที่นี่ที่เดียว
 * ⚠ แก้ไฟล์นี้/formRules ต้องรัน  node scripts/verify-form-rules.mjs
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type FormRule = { panes?: number[]; note?: string };

/** กติกาของ "รุ่นนี้ + รูปแบบนี้" — ไม่มีกติกา = คืน null (ใช้ minP–maxP ตามปกติ) */
export function formRule(prod: any, form?: string | null): FormRule | null {
  if (!prod || !form) return null;
  const r = prod.formRules?.[form];
  return r ?? null;
}

/** จำนวนบานที่เลือกได้จริงของรูปแบบนี้ (เรียงน้อย→มาก) · ไม่มีกติกา = ทุกค่าใน minP–maxP */
export function allowedPanes(prod: any, form?: string | null): number[] {
  const r = formRule(prod, form);
  if (r?.panes?.length) return [...r.panes].sort((a, b) => a - b);
  const min = Number(prod?.minP) || 1, max = Number(prod?.maxP) || min;
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
}

/** ดัดจำนวนบานให้อยู่ในค่าที่ทำได้ (เลือกค่าที่ใกล้ที่สุด · เท่ากันเลือกตัวน้อย) */
export function snapPanes(prod: any, form: string | null | undefined, p: number): number {
  const opts = allowedPanes(prod, form);
  if (!opts.length) return p;
  if (opts.includes(p)) return p;
  return opts.reduce((best, v) => (Math.abs(v - p) < Math.abs(best - p) ? v : best), opts[0]);
}

/** ข้อความอธิบายรูปแบบนี้ (ขึ้นใต้ช่องเลือกรูปแบบ) — ไม่มี = "" */
export const formNote = (prod: any, form?: string | null): string => formRule(prod, form)?.note ?? "";
