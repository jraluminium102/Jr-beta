/**
 * pane-calc — "บาน 1 ช่อง" ในห้องกระจก/กั้นห้อง (G6) คิดราคายังไง
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องแยกออกมาเป็นไฟล์ (เจ้าของสั่ง 21 ส.ค.69 "ทำให้เป็นก้อนเดียวกัน"):
 *   บานเลื่อน SMS/ยูโร/SlimLux ที่อยู่ในห้องกระจก ต้องคิดราคา "เท่ากับหน้า G1 เป๊ะ"
 *   เดิม RoomComposer สร้าง opt เองแบบย่อ → ตกหล่น 2 อย่างเงียบ ๆ
 *     ① spec (ราง/มือจับ) ไม่ถูกส่ง → คิดตามค่าตั้งต้นเสมอ แถมไม่มีช่องให้เลือก
 *     ② อุปกรณ์จากใบตัด (cutHardwareLines) ไม่ถูกส่ง → ค่าของใช้รายการเก่าในสูตร (ไม่ผูกสโตร์)
 *   ย้ายมาที่นี่แล้ว หน้า G6 เรียกฟังก์ชันเดียว · สคริปต์ verify-room-parity เทียบกับ G1 ได้ตรง ๆ
 *
 * ⚠ แก้ไฟล์นี้ต้องรัน  node scripts/verify-room-parity.mjs
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error — engine เป็น ESM JS ล้วน
import { computeCost } from "./engine.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS } from "./products.mjs";
// @ts-expect-error — mosquito helper เป็น ESM JS ล้วน
import { computeMosquitoR4 } from "./mosquito.mjs";
// @ts-expect-error — door-zip helper เป็น ESM JS ล้วน
import { computeDoorZipR4 } from "./door-zip.mjs";
import { withUniversalAddons } from "./universal-addons.ts";
import { resolveAluColor } from "./alu-colors.ts";
import { stockColorOfCalc } from "./stock-link.ts";
import { cutHardwareLines, HANDLE_FIELDS, HW_FROM_CUTLIST } from "./hardware-from-cutlist.ts";
import type { PaneUse } from "./room-desc.ts";

/** ผนังทึบ (รวมโครง) — ใส่เป็น "ช่องบาน" ในด้านได้ · ไม่ใช่ G1 จึงระบุมือ */
export const WALL_PANES: { key: string; label: string }[] = [
  { key: "wall_smartboard", label: "ผนังสมาร์ทบอร์ด (รวมโครง)" },
  { key: "wall_corrugated", label: "ผนังอลูลูกฟูก (รวมโครง)" },
  { key: "wall_composite", label: "ผนังคอมโพสิต (รวมโครง)" },
];

/** ชนิดบานในห้องกระจก = ทุกรุ่น G1 อัตโนมัติ (รุ่นใหม่โผล่เองไม่ต้องมาเติม) + ผนังทึบ */
export const PANE_TYPES: { key: string; label: string }[] = [
  ...Object.values(PRODUCTS as Record<string, any>)
    .filter((p: any) => p && p.group === 1 && !p.pickerHide)
    .map((p: any) => ({ key: p.id as string, label: p.name as string })),
  ...WALL_PANES.filter((w) => (PRODUCTS as Record<string, any>)[w.key]),
];

/** รุ่น + ของเสริม universal (งานไฟ/บานล่างทึบ/ม่านซิปหลังคา) + ม่านซิปประตู (มีเฉพาะ G6) */
export const PANE_BY_KEY: Record<string, any> = Object.fromEntries(
  PANE_TYPES.map((t) => {
    const base = (PRODUCTS as any)[t.key];
    return [t.key, base ? withUniversalAddons(base, { doorZip: true }) : base];
  })
);

/** สีอบพิเศษ/ตร.ม. (ราคาขาย) — ใช้กับผนังแผ่นอลู (ลูกฟูก/คอมโพ · prod.showColor) */
export const SHEET_FIN: Record<string, number> = { white: 0, sahara: 300, special: 1700, woodSpecial: 2400, woodStock: 2400 };

export type Pane = {
  key: number;
  typeKey: string;   // R4.0 product id
  form?: string;     // รูปแบบเปิด (อิสระ/สลับ/ลากจูง/เปิดคู่กลาง) — undefined = prod.defForm
  w: number; h: number; n: number;   // เมตร, เมตร, จำนวนบาน
  fixedPanes?: number;               // บานติดตาย (ลด movePanes ของมุ้ง)
  addons: Record<string, any>;
  colorIdx?: string; // สีอลูต่อบาน override ("" = ตามห้อง)
  glassOvr?: string; // กระจกต่อบาน override ("" = ตามห้อง)
  use?: PaneUse;     // ประตู/หน้าต่าง — คุมคำขึ้นต้นในใบเสนอ
  sill?: string;     // พื้นล่างประตู — label เท่านั้น
  spec?: Record<string, string>;  // specOpts ของรุ่น (ราง/มือจับ) — ไม่ตั้ง = ค่าตั้งต้นของรุ่น
  cut?: Record<string, string>;   // มือจับจากใบตัด (ยี่ห้อ/สี/ซ้าย/ขวา) — เฉพาะรุ่น HW_FROM_CUTLIST
};

/** ค่าตั้งต้น specOpts — ต้องตรงกับหน้า G1 (Calculator40Client: specOpts.forEach) */
export function specDefaults(prod: any): Record<string, string> {
  const s: Record<string, string> = {};
  for (const o of (prod?.specOpts ?? [])) s[o.key] = o.def ?? o.opts?.[0] ?? "";
  return s;
}
export const paneSpec = (prod: any, pane: Pane): Record<string, string> => ({ ...specDefaults(prod), ...(pane.spec || {}) });
export const paneCut = (pane: Pane): Record<string, string> => {
  const c: Record<string, string> = {};
  for (const f of HANDLE_FIELDS) c[f.key] = pane.cut?.[f.key] ?? f.def;
  return c;
};

/**
 * ราคาต่อบาน (ขายรวมติดตั้ง) — ชุด opt เดียวกับหน้า G1
 * @returns amount = ราคาขายรวมติดตั้ง · mosqLabel = ข้อความมุ้งที่ขึ้นใบ · r = ผลเต็มจาก engine
 */
export function panePrice(
  pane: Pane, pb: any, roomColor: string, roomGlass: string, profitPct: number, movePanesOverride?: number
): { amount: number; mosqLabel?: string; r?: any } {
  // รุ่นนอกลิสต์ (เช่น บานย่อยในชุดผสมบาน) → ใช้ตัวจาก PRODUCTS ตรง ๆ ห้ามคืน 0 เงียบ ๆ
  const prod = PANE_BY_KEY[pane.typeKey] || (PRODUCTS as any)[pane.typeKey];
  if (!prod) return { amount: 0 };
  const rc = resolveAluColor(pane.colorIdx || roomColor);
  const glassType = prod.defGlass ? (pane.glassOvr || roomGlass || prod.defGlass) : undefined;
  const wCm = (pane.w || 1) * 100, hCm = (pane.h || 1) * 100;
  const formVal = (prod.forms?.length ? (pane.form || prod.defForm) : prod.defForm);
  const opt: any = {
    w: wCm, h: hCm, p: pane.n || 1, form: formVal,
    color: rc.bake, colorName: rc.label, glassType, material: prod.defMaterial ?? undefined,
    stockColor: stockColorOfCalc(pane.colorIdx || roomColor),   // ราคาเส้นตามสีจริงในสโตร์
    colorKey: pane.colorIdx || roomColor,                        // ราคาเส้นแยกสีจากไฟล์ถอดทุน
    profitPct, installProfitPct: profitPct, addons: pane.addons || {},
    spec: paneSpec(prod, pane),                                  // ราง/มือจับ ฯลฯ — ชุดเดียวกับ G1
    // finRate เป็นราคาขาย → ÷(1+กำไร%) เป็นทุน แล้วเอนจิน ×(1+กำไร%) กลับ (ไม่ขึ้นกับกำไร%)
    frameColorRate: prod.showColor ? ((SHEET_FIN[rc.bake] || 0) / (1 + (profitPct || 100) / 100)) : 0,
  };
  const movePanes = movePanesOverride ?? Math.max(1, (pane.n || 1) - (pane.fixedPanes || 0));
  const mq = computeMosquitoR4(PRODUCTS, pane.addons || {}, { wCm, hCm, movePanes, form: formVal }, pb, profitPct, profitPct);
  if (mq) opt.mosquitoR4 = mq;
  if (pane.addons?.dgNc) opt.digiNc = true;
  const dz = computeDoorZipR4(pane.addons || {}, { wCm, hCm }, pb, profitPct);
  if (dz) opt.doorZipR4 = dz;
  // อุปกรณ์จากใบตัด (รุ่นที่เปิดแล้ว) — ต้องส่งเหมือน G1 ไม่งั้นค่าของคนละชุด/คนละราคา
  const hwl = cutHardwareLines({ prodId: prod.id, w: wCm, h: hCm, p: pane.n || 1, form: formVal, spec: opt.spec, cut: paneCut(pane) });
  if (hwl?.length) opt.hardwareLines = hwl;
  opt.hwNoCutSpec = HW_FROM_CUTLIST.has(prod.id) && !hwl?.length;
  const r: any = computeCost(pb, prod, opt);
  return { amount: r.sell.withInstall, mosqLabel: mq?.label, r };
}
