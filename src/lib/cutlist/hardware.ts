/**
 * cutlist/hardware — อุปกรณ์/ฮาร์ดแวร์ร่วม (พอร์ตจากส่วน "⑤ สรุปอุปกรณ์" ในไฟล์ รวมใบตัด_JR_2)
 *   · sku = รหัสสโตร์ JR##### → ตัดสต็อก + เทียบคงเหลือได้ (เชื่อมหน้าสโตร์)
 *   · มือจับ = ตาราง lookup ยี่ห้อ+ชนิด+สี → SKU (จากคอลัมน์ AA:AB ในไฟล์)
 * หน่วยความยาว = ซม. เสมอ
 */
import type { CutInput, HardwareCtx } from "./engine";

// ── ตาราง lookup มือจับ (ยี่ห้อ+ชนิด+สี → SKU) — ตรงกับ AA:AB ในไฟล์ SMS ──
export const HANDLE_SKU: Record<string, string> = {
  "เมโทรกุญแจอบขาว": "JR00368", "เมโทรกุญแจดำ": "JR00371",
  "เมโทรล็อคอบขาว": "JR00369", "เมโทรล็อคดำ": "JR00372",
  "เมโทรดัมมี่อบขาว": "JR00370", "เมโทรดัมมี่ดำ": "JR00373",
  "Alignกุญแจอบขาว": "JR00377", "Alignกุญแจดำ": "JR00374",
  "Alignล็อคอบขาว": "JR00378", "Alignล็อคดำ": "JR00375",
  "Alignดัมมี่อบขาว": "JR00379", "Alignดัมมี่ดำ": "JR00376",
};
export const HANDLE_BRANDS = ["เมโทร", "Align"];
export const HANDLE_COLORS = ["อบขาว", "ดำ"];
// ชนิดมือจับต่อบาน (ซ้าย/ขวา) — ใช้ใน dropdown
export const HANDLE_TYPES = ["กุญแจ+ล็อค", "ล็อค+ดัมมี่", "ล็อค", "ดัมมี่+ดัมมี่", "ดัมมี่", "Digital lock", "-"];

const brandOf = (o: CutInput) => o.handleBrand || "เมโทร";
const colorOf = (o: CutInput) => o.handleColor || "อบขาว";
/** SKU มือจับตามชนิด (กุญแจ/ล็อค/ดัมมี่) + ยี่ห้อ + สีที่เลือก */
export const handleSku = (o: CutInput, part: "กุญแจ" | "ล็อค" | "ดัมมี่") => HANDLE_SKU[brandOf(o) + part + colorOf(o)] ?? "";

// นับชนิดมือจับจากช่องซ้าย/ขวา (handles="L" = บานเดียว ใช้ซ้ายอย่างเดียว)
const picks = (o: CutInput, handles: "LR" | "L") => (handles === "LR" ? [o.handleL, o.handleR] : [o.handleL]).filter(Boolean) as string[];
const countEq = (arr: string[], v: string) => arr.filter((x) => x === v).length;
/** จำนวน "มือจับกุญแจ" = นับ "กุญแจ+ล็อค" */
const keyCount = (p: string[]) => countEq(p, "กุญแจ+ล็อค");
/** จำนวน "ตัวล็อค" (ตัวที่มีล็อค) = กุญแจ+ล็อค · ล็อค+ดัมมี่ · ล็อค */
const lockCount = (p: string[]) => countEq(p, "กุญแจ+ล็อค") + countEq(p, "ล็อค+ดัมมี่") + countEq(p, "ล็อค");
/** จำนวน "ดัมมี่" = ล็อค+ดัมมี่ + 2×ดัมมี่คู่ + ดัมมี่ */
const dummyCount = (p: string[]) => countEq(p, "ล็อค+ดัมมี่") + 2 * countEq(p, "ดัมมี่+ดัมมี่") + countEq(p, "ดัมมี่");
const digitalCount = (p: string[]) => countEq(p, "Digital lock");

// แกนมือจับ B: สูง>280→2 · >140→1 · ไม่งั้น 0 (ต่อ 1 ตัวล็อค)
const stemB = (H: number) => (H > 280 ? 2 : H > 140 ? 1 : 0);

export type HardwareDef = {
  name: string | ((o: CutInput) => string);
  qty: (o: CutInput, ctx: HardwareCtx) => number;
  sku?: string | ((o: CutInput) => string);
  unit?: string;
  note?: string;
  noStock?: boolean;
};

/**
 * สักหลาด 5×3 (เมตร) — รอบกรอบบาน (ขวางบน+เสากุญแจ) × 4 ต่อบาน + เฟรมบน/ล่าง (รางเสียบ) + เฟรมข้าง
 *   พอร์ตจากสูตรไฟล์ (เปิดคู่กลาง/ลากจูง อ้างความยาวขวางบน · ชีตอิสระอ้าง E17=จำนวน = พิมพ์ผิด → ใช้ความยาวให้สอดคล้อง)
 *   panels = สปส.บานของรุ่น · postName = ชื่อโปรไฟล์เสากุญแจ (ชื่อต่างกันบางรุ่น)
 */
export function smsFeltMeters(o: CutInput, ctx: HardwareCtx, panels: number, postName = "เสากุญแจ ML"): number {
  const cross = ctx.len("ขวางบน");
  const post = ctx.len(postName);
  const topF = ctx.len("เฟรมบน");
  const botF = ctx.len("เฟรมล่าง");
  const sideF = ctx.len("เฟรมข้าง");
  const rail7 = o.rail === "รางเตี้ย7มม";
  const cm = 2 * 2 * (cross + post) * panels + 2 * panels * topF + (rail7 ? 0 : 2 * panels * botF) + sideF;
  return cm / 100;
}

// ยางรูน้ำ/วาว: 2 + เพิ่มทุก 50ซม. เมื่อเฟรมล่าง (W−4.4) เกิน 150
const drainCount = (o: CutInput) => 2 + Math.max(0, Math.ceil((o.W - 4.4 - 150) / 50));

/**
 * ⑤ อุปกรณ์ SMS บานเลื่อน (อิสระ/สลับ · เปิดคู่กลาง · ลากจูง) — เหมือนกันทุกรุ่น ต่างที่ "panels"
 *   panels = ฟังก์ชันจำนวนบานที่คิดล้อ/น็อต/สักหลาด (อิสระ=N · เปิดคู่กลาง=2 · ลากจูง=N−1)
 *   handles = "LR" (2 มือจับ ซ้าย/ขวา) | "L" (มือจับเดียว) · postName = ชื่อเสากุญแจของรุ่น
 */
export function smsSlideHardware(
  panelsFn: (o: CutInput) => number,
  handles: "LR" | "L" = "LR",
  postName = "เสากุญแจ ML",
): HardwareDef[] {
  const P = (o: CutInput) => picks(o, handles);
  const brand = (o: CutInput) => brandOf(o);
  return [
    { name: "ล้อ 27", sku: "JR00576", qty: (o) => 2 * panelsFn(o), unit: "ตัว" },
    { name: (o) => `มือจับ กุญแจ (${brand(o)})`, sku: (o) => handleSku(o, "กุญแจ"), qty: (o) => keyCount(P(o)), unit: "ชุด" },
    { name: (o) => `มือจับ ล็อค (${brand(o)})`, sku: (o) => handleSku(o, "ล็อค"), qty: (o) => lockCount(P(o)), unit: "ชุด" },
    { name: (o) => `มือจับ ดัมมี่ (${brand(o)})`, sku: (o) => handleSku(o, "ดัมมี่"), qty: (o) => dummyCount(P(o)), unit: "ชุด" },
    { name: "Digital lock (ซื้อแยก)", qty: (o) => digitalCount(P(o)), unit: "ชุด", noStock: true, note: "ไม่ตัดสต็อก · ไม่มีมือจับ" },
    { name: "แกนมือจับ A", sku: "JR00478", qty: (o) => 2 * lockCount(P(o)), unit: "อัน" },
    { name: "แกนมือจับ B", sku: "JR00479", qty: (o) => stemB(o.H) * lockCount(P(o)), unit: "อัน", note: "สูง>140→1 · >280→2" },
    { name: "ปลายมือจับ ดำ", sku: "JR00476", qty: (o) => 2 * lockCount(P(o)), unit: "อัน" },
    { name: "ตัวที เงิน", sku: "JR00475", qty: (o) => lockCount(P(o)), unit: "อัน" },
    { name: "น็อต 1\" (ประกอบบาน)", sku: "JR00864", qty: (o) => 4 * panelsFn(o), unit: "ตัว" },
    { name: "น็อต 1\" (ประกอบเฟรม)", sku: "JR00864", qty: () => 8, unit: "ตัว" },
    { name: "น็อต 6 หุน (ยึดล้อ)", sku: "JR00863", qty: (o) => 4 * panelsFn(o), unit: "ตัว" },
    { name: "สักหลาด 5×3 (รวม)", sku: "JR00794", qty: (o, ctx) => smsFeltMeters(o, ctx, panelsFn(o), postName), unit: "ม.", noStock: true, note: "ม้วนละ 250ม. · สะสมครบม้วนค่อยตัด (ไม่หักอัตโนมัติ)" },
    { name: "ยางรูน้ำลง", sku: "JR00589", qty: drainCount, unit: "อัน", note: "2 + เฟรมล่าง>150 เพิ่มทุก 50ซม." },
    { name: "วาวรูน้ำออก", sku: "JR00485", qty: drainCount, unit: "อัน", note: "2 + เฟรมล่าง>150 เพิ่มทุก 50ซม." },
    { name: "ก้ามปูรับล็อค", sku: "JR00477", qty: (o) => 2 * lockCount(P(o)), unit: "อัน", note: "เท่าปลายดำ" },
  ];
}

// ตัวเลือกมือจับสำหรับ UI (spec.opts) — ใส่ในรุ่นเลื่อน/ประตูที่มีมือจับ
export const HANDLE_OPTS_LR = [
  { key: "handleBrand", label: "ยี่ห้อมือจับ", choices: HANDLE_BRANDS },
  { key: "handleColor", label: "สีมือจับ", choices: HANDLE_COLORS },
  { key: "handleL", label: "มือจับ ซ้าย", choices: HANDLE_TYPES },
  { key: "handleR", label: "มือจับ ขวา", choices: HANDLE_TYPES },
] as const;
export const HANDLE_OPTS_L = [
  { key: "handleBrand", label: "ยี่ห้อมือจับ", choices: HANDLE_BRANDS },
  { key: "handleColor", label: "สีมือจับ", choices: HANDLE_COLORS },
  { key: "handleL", label: "มือจับ", choices: HANDLE_TYPES },
] as const;
