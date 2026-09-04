/**
 * cutlist/products — สเปกใบตัดต่อรุ่น (นำร่อง SMS เลื่อนอิสระ)
 * พอร์ตสูตรตรงจาก Excel: ตัดประกอบ/JR_SMS_เลื่อนอิสระ_รวม.xlsx (sheet "เลื่อนอิสระ/สลับ")
 * หน่วย ซม. · เส้นสต็อก 6.4 ม. · รหัสอลู B#### ผูกกับสต็อก (sku)
 *
 * ⑦ ค่าหัก (แก้ที่เดียว): เฟรม 4.4 · เสากุญแจ เสียบ6.1/เตี้ย3 · ฝาปิด เสียบ5/เตี้ย2.3
 *   · ขวางบน สปส.4.2 + คงที่11.2 · ตบร่องใน 7
 */
import type { CutSpec, CutInput } from "./engine.ts";
// นามสกุล .ts จำเป็นให้ verify script (node --experimental-strip-types) resolve value import ได้ · bundler/webpack รับปกติ
import { smsSlideHardware, smsMeshHardware, handleHardware, otherHandleRow, HANDLE_OPTS_LR, HANDLE_OPTS_L, HANDLE_BRANDS, HANDLE_TYPES, type HardwareDef } from "./hardware.ts";

// ── อุปกรณ์บานเปิดเดี่ยว (casement/ประตูเดี่ยว) — SKU ชุดเดียวกับบานโซลิด (N=1 ไม่มีบานลอง) · ใช้ร่วม FUJI บานเปิด/ประตู ──
const SWING_DOOR_OPTS = [
  { key: "hwColor", label: "สีอุปกรณ์", choices: ["ขาว", "ดำ"] },
  { key: "lockType", label: "ตลับกุญแจ", choices: ["ล็อคปกติ", "มัลติพ้อยล็อค"] },
  { key: "openDir", label: "ทิศเปิด", choices: ["เปิดออก", "เปิดเข้า"] },
  // Cmech แตก 3 sub-choice ตรงไฟล์ v2 (FUJI ประตูเดี่ยว มีธรณี B67 · COUNTIF 5 แบบ) — ห้ามใช้ "Cmech" เดี่ยว (ออก SKU เกินจริง)
  { key: "motherHandle", label: "มือจับ", choices: ["คิงโบ ล็อค+กุญแจ", "คิงโบ ดัมมี่+ดัมมี่", "Cmech กุญแจ+ล็อค", "Cmech ล็อค+ดัมมี่", "Cmech ดัมมี่+ดัมมี่", "อื่นๆ"] },
];
const SWING_DOOR_DEF = { hwColor: "ขาว", lockType: "ล็อคปกติ", openDir: "เปิดออก", motherHandle: "คิงโบ ล็อค+กุญแจ" };
// hasSill = มีธรณี (น็อตเฟรม 8 · ยางวงกบวนรอบ) · sashN = จำนวนบาน (บานพับ/สปิง/ฉาก คูณ)
// ⚠ Cmech แตก 3 SKU ตามไฟล์ v2 (FUJI ประตูเดี่ยว มีธรณี R71-86 · AP/AY/AZ column):
//   "Cmech กุญแจ+ล็อค" → กุญแจ JR00293(noStock)=1 + ล็อค JR00291=1 (ดัมมี่=0)
//   "Cmech ล็อค+ดัมมี่" → ล็อค JR00291=1 + ดัมมี่ JR00289=1 (กุญแจ=0)
//   "Cmech ดัมมี่+ดัมมี่" → ดัมมี่ JR00289=2 (กุญแจ/ล็อค=0)
//   + เพิ่ม CDQ/ปลายกลอน (บานลอง) ให้ครบชุดกับ SOLID_DOOR — ประตูเดี่ยว/บานเปิดตระกูลนี้ไม่มีบานลอง (N คงที่ 1) → เป็น 0 เสมอ (พอร์ตตามไฟล์)
function casementDoorHardware(hasSill: (o: CutInput) => boolean, sashN: (o: CutInput) => number = () => 1): HardwareDef[] {
  return [
    { name: "บานพับ hyda", sku: (o) => (o.hwColor === "ดำ" ? "JR00488" : "JR00489"), qty: (o) => (o.H > 300 || o.W / sashN(o) > 120 ? 5 : 4) * sashN(o), unit: "ตัว" },
    { name: "สปิงก็อท", sku: "JR00592", qty: (o) => 4 * sashN(o), unit: "ตัว" },
    { name: "ฉากประคองมุม", sku: "JR00267", qty: (o) => 8 * sashN(o), unit: "ตัว" },
    { name: "มือจับ ล็อค+กุญแจ (คิงโบ)", sku: (o) => (o.hwColor === "ดำ" ? "JR00314" : "JR00315"), qty: (o) => (o.motherHandle === "คิงโบ ล็อค+กุญแจ" ? 1 : 0), unit: "ชุด" },
    { name: "มือจับ ดัมมี่+ดัมมี่ (คิงโบ)", sku: (o) => (o.hwColor === "ดำ" ? "JR00312" : "JR00313"), qty: (o) => (o.motherHandle === "คิงโบ ดัมมี่+ดัมมี่" ? 1 : 0), unit: "ชุด" },
    { name: "มือจับ Cmech กุญแจ", sku: "JR00293", qty: (o) => (o.motherHandle === "Cmech กุญแจ+ล็อค" ? 1 : 0), unit: "ชุด", noStock: true, note: "ไม่ตัดสต็อก" },
    { name: "มือจับ Cmech ล็อค", sku: "JR00291", qty: (o) => (o.motherHandle === "Cmech กุญแจ+ล็อค" || o.motherHandle === "Cmech ล็อค+ดัมมี่" ? 1 : 0), unit: "ชุด" },
    { name: "มือจับ Cmech ดัมมี่", sku: "JR00289", qty: (o) => (o.motherHandle === "Cmech ล็อค+ดัมมี่" ? 1 : 0) + (o.motherHandle === "Cmech ดัมมี่+ดัมมี่" ? 2 : 0), unit: "ชุด" },
    otherHandleRow("motherHandle"),
    { name: "ตลับกุญแจไฮด้า", sku: (o) => (o.lockType === "มัลติพ้อยล็อค" ? "JR00553" : "JR00551"), qty: () => 1, unit: "ตัว" },
    { name: "ไส้กุญแจ", sku: (o) => (o.openDir === "เปิดเข้า" ? "JR00498" : "JR00499"), qty: () => 1, unit: "ตัว", note: "auto เข้า/ออก" },
    { name: "แผ่นรับล็อค", sku: "JR00562", qty: () => 1, unit: "ชุด" },
    { name: "CDQ บานเปิด (บานลอง)", sku: "JR00596", qty: () => 0, unit: "ตัว", note: "บานเดี่ยว (N คงที่ 1) → ไม่มีบานลอง เป็น 0 เสมอ" },
    { name: "ปลายกลอน (บานลอง)", sku: "JR00598", qty: () => 0, unit: "ตัว", note: "บานเดี่ยว (N คงที่ 1) → ไม่มีบานลอง เป็น 0 เสมอ" },
    { name: "น็อตเฟรม 1\"", sku: "JR00864", qty: (o) => (hasSill(o) ? 8 : 6), unit: "ตัว" },
    { name: "ยางกรอบบาน", sku: "JR00771", qty: (o) => Math.round(2 * (o.W + o.H) / 100 * 10) / 10, unit: "เมตร" },
    { name: "ยางวงกบ", sku: "JR00771", qty: (o) => Math.round((hasSill(o) ? 2 * (o.W + o.H) : o.W + 2 * o.H) / 100 * 10) / 10, unit: "เมตร" },
  ];
}

/**
 * ⑤ อุปกรณ์ FUJI_SWING (หน้าต่างบานเปิด/กระทุ้ง เดี่ยว) — พอร์ตจาก JR_FUJI_บานเปิดบานกระทุ้ง_1.xlsx
 *   sheet A1="FUJI บานเปิด" (แท็บชื่อ "Fix3") · ⑤.1 สรุปอุปกรณ์ แถว 69-78 (1 บาน/ชุด)
 *   ⚠ ไม่ใช้ casementDoorHardware (ชุดประตู) — ชุดนี้เป็นชุดเฉพาะ FUJI_SWING เอง (มือจับ/CDQ/วิทโก้/ลูกเบี้ยวล็อค ต่างจากประตู)
 */
/** มือจับหลบมุ้ง KINGBO-FH3016 — เลือกรหัสตาม สี × ด้าน (ราคาเท่ากันหมด เลือกผิดแค่หักสต็อกผิดตัว) */
const winHandleSku = (o: CutInput) => {
  const dark = String(o.winHandleColor ?? "อบขาว") === "ดำ";
  const right = String(o.winHandleSide ?? "ซ้าย") === "ขวา";
  return dark ? (right ? "JR00317" : "JR00316") : (right ? "JR00319" : "JR00318");
};

function fujiSwingHardware(): HardwareDef[] {
  const lockExtra = (o: CutInput) => 2 + Math.max(0, Math.ceil((o.H - 180) / 50)); // สูง(ซม.)>180 เพิ่มทุก 50ซม. (ไฟล์: mm>1800 ทุก 500mm)
  const rubberM = (o: CutInput) => Math.round((2 * (o.W + o.H) / 100) * 10) / 10;
  return [
    // มือจับหลบมุ้ง KINGBO-FH3016 — 2 สี × ซ้าย/ขวา = 4 รหัส (ราคาเท่ากันทุกตัว ฿111)
    //   เจ้าของสั่งเปลี่ยน 27 ส.ค.69 (เดิม JR00304 มือจับ CENZA)
    { name: "มือจับหลบมุ้ง KINGBO-FH3016", sku: winHandleSku, qty: () => 1, unit: "ชุด" },
    { name: "CDQ Kingbo", sku: "JR00564", qty: () => 1, unit: "ตัว" },   // เดิม JR00566 CDQ ชุดบานกระทุ้ง-เงิน
    { name: "วิทโก้", sku: "JR00559", qty: () => 2, unit: "ตัว" },
    { name: "ลูกเบี้ยวล็อค", sku: "JR00486", qty: lockExtra, unit: "ตัว", note: "2 + สูง>180 เพิ่มทุก 50ซม." },
    { name: "รับล็อคลูกเบี้ยว", sku: "JR00483", qty: lockExtra, unit: "ตัว", note: "2 + สูง>180 เพิ่มทุก 50ซม." },
    { name: "สปิงก็อท", sku: "JR00592", qty: () => 4, unit: "ตัว" },
    { name: "ฉากประคองมุม", sku: "JR00267", qty: () => 8, unit: "ตัว" },
    { name: "น็อตเฟรม", sku: "JR00864", qty: () => 8, unit: "ตัว" },
    { name: "ยางกรอบบาน", sku: "JR00770", qty: rubberM, unit: "เมตร" },
    { name: "ยางวงกบ", sku: "JR00770", qty: rubberM, unit: "เมตร" },
  ];
}

const isPlug = (rail: string) => rail === "3รางเสียบ"; // 3รางเสียบ → ค่าหัก "เสียบ" · ไม่งั้น "เตี้ย"

/**
 * โหนกเกี่ยว (เสาเกี่ยวรับแรง B20010) — "ออโต้ตามความสูง"
 *   บานสูงเกิน 240 ซม. ต้องใช้เสาเกี่ยวรับแรงเสมอ (คิดราคา 4.0 ใช้กฎนี้มาตลอด: count = H>2.4 ? ... )
 *   เดิมใบตัดให้ติ๊กเอง + from-recipe ส่ง honk:false ตายตัว → ใบตัดกับคิดราคาไม่ตรงกันเวลาบานสูง
 *   (เจ้าของเจอเองจากหน้าเทียบ 19 ส.ค.69: 600×300 → B20010 "มีแต่คิดราคา" · B20009 "จำนวนต่าง")
 *   ติ๊กเองยังได้ = บังคับเปิด · สูงเกิน 240 = เปิดให้อัตโนมัติ ปิดไม่ได้ (ตรงกับสูตรคิดราคา)
 */
/**
 * SlimLux ทิศทางเลื่อน → กล่องสั้น (บานกลาง) อยู่ด้านไหน
 *   ค่าใหม่: "มือจับขวา เลื่อนเปิดซ้าย" = กล่องสั้นด้านซ้าย (ตรงกับค่าเดิม "ซ้าย")
 *   ยังรับค่าเดิม ซ้าย/ขวา อยู่ — ใบตัดที่บันทึกไว้ก่อนหน้าไม่พัง
 */
export const sBoxLeft = (o: CutInput) => {
  const v = String(o.boxSide ?? "");
  if (v.includes("เปิดซ้าย")) return true;
  if (v.includes("เปิดขวา")) return false;
  return v === "ซ้าย";
};
export const honkOf = (o: CutInput) => !!o.honk || Number(o.H) > 240;
// มือจับเริ่มต้น (บานเลื่อน/ประตู) — ตรง default ในไฟล์ Excel
const HANDLE_DEF_LR = { handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" };
const HANDLE_DEF_L = { handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค" };

// ── ระบบมุ้ง SMS เลื่อน (FREE/CENTER/TOW) — พอร์ต JR_SMS_เลื่อนอิสระ_รวม.xlsx (v2) ──
//   มุ้ง: "ไม่มี" | "เฟรมเล็ก" (เส้น B30006 เสริม ไม่มีมือจับ/ล้อ) | "เฟรมใหญ่" (เต็มบาน ใช้อลูเดียวกับโครงหลัก + มีมือจับ/ล้อ)
//   ตบร่องในล่าง เปลี่ยนรหัส → B20048 เมื่อ "เฟรมเล็ก" (ไฟล์: "20048" ไม่มีพรีฟิกซ์ — สต็อกจริงคือ B20048)
const meshOf = (o: CutInput) => o.mesh ?? "ไม่มี";
const meshCountOf = (o: CutInput) => Math.max(1, Math.round(o.meshCount ?? 1));
const MESH_OPTS = [
  { key: "mesh", label: "มุ้ง", choices: ["ไม่มี", "เฟรมเล็ก", "เฟรมใหญ่"] },
  { key: "meshHandleBrand", label: "ยี่ห้อมือจับมุ้ง", choices: HANDLE_BRANDS },
  { key: "meshHandleL", label: "มือจับมุ้ง บานหลัก", choices: HANDLE_TYPES },
  { key: "meshHandleR", label: "มือจับมุ้ง บานรอง", choices: HANDLE_TYPES },
] as const;
const MESH_DEF = { mesh: "ไม่มี", meshHandleBrand: "เมโทร", meshHandleL: "กุญแจ+ล็อค", meshHandleR: "ล็อค+ดัมมี่" };

const freeCross = (o: CutInput) => (o.W - 4.2 * o.N - 11.2) / o.N; // ขวางบน/ล่าง — ใช้ร่วมมุ้งเฟรมใหญ่
export const SMS_SLIDE_FREE: CutSpec = {
  id: "sms_slide_free",
  name: "SMS บานเลื่อนอิสระ/สลับ",
  stockLen: 640, // 6.4 ม. (ซม.)
  rails: ["3รางเสียบ", "รางเตี้ย7มม"],
  opts: [...HANDLE_OPTS_LR, ...MESH_OPTS, { key: "meshCount", label: "จำนวนมุ้ง", type: "number" }],
  defaults: { W: 350, H: 159, N: 3, rail: "3รางเสียบ", honk: false, ...HANDLE_DEF_LR, ...MESH_DEF, meshCount: 1 },
  profiles: [
    { name: "เฟรมล่าง", code: (o) => (isPlug(o.rail) ? "B20041" : "B20047"), len: (o) => o.W - 4.4, qty: () => 1 },   // รางเตี้ย = B20047 เฟรมล่างภายใน (B20046 คือชนกลาง คนละตัว · ยืนยันจากชื่อในไฟล์ v9)
    { name: "เฟรมบน", code: "B20001", len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมข้าง", code: "B20003", len: (o) => o.H, qty: () => 2 },
    { name: "เสากุญแจ ML", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: () => 2 },
    { name: "เสาเกี่ยว", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (honkOf(o) ? o.N - 1 : 2 * (o.N - 1)) },
    { name: "เสาเกี่ยวโหนก", code: "B20010", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (honkOf(o) ? o.N - 1 : 0) },
    { name: "ขวางบน", code: "B20054", len: freeCross, qty: (o) => o.N },
    { name: "ขวางล่าง", code: "B20054", len: freeCross, qty: (o) => o.N },
    { name: "ฝาปิดเฟรมข้าง", code: "B20019", len: (o) => o.H - (isPlug(o.rail) ? 5 : 2.3), qty: () => 4 },
    { name: "ตบเฟรมบน/ล่าง ร่องในบน", code: "-", len: (o) => o.W - 7, qty: (o) => (meshOf(o) === "ไม่มี" ? Math.max(3 - o.N, 0) : 0) },
    { name: "ตบเฟรมบน/ล่าง ร่องในล่าง", code: (o) => (meshOf(o) === "เฟรมเล็ก" ? "B20048" : "-"), len: (o) => o.W - 7, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 0 : Math.max(3 - o.N, 0)) },
    { name: "เบรคบาน (ธรณี)", code: "B20050", len: (o) => o.W - 4.4, qty: (o) => (o.rail === "รางเตี้ย7มม" ? 2 : 0) },
    { name: "ตบรางล้อ", code: "F7994", len: (o) => o.W - 4.4, qty: (o) => (isPlug(o.rail) ? o.N : 0) },   // รางเตี้ยไม่ใช้ตบรางล้อ (ใช้ B20050 แทน)
    { name: "ตบรางล้อ (มุ้งใหญ่)", code: "F7994", len: (o) => o.W - 4.4, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0) },
    { name: "เสานอนมุ้ง (เฟรมเล็ก)", code: "B30006", len: (o) => freeCross(o) + 9.7, qty: (o) => (meshOf(o) === "เฟรมเล็ก" ? 2 * meshCountOf(o) : 0) },
    { name: "เสาตั้งมุ้ง (เฟรมเล็ก)", code: "B30006", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3) - 1, qty: (o) => (meshOf(o) === "เฟรมเล็ก" ? 2 * meshCountOf(o) : 0) },
    { name: "เสากุญแจมุ้ง (ใหญ่)", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0), note: "อลูเดียวกับเสากุญแจ ML" },
    { name: "เสาเกี่ยวมุ้ง (ใหญ่)", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0), note: "อลูเดียวกับเสาเกี่ยว" },
    { name: "ขวางบนมุ้ง (ใหญ่)", code: "B20054", len: freeCross, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0) },
    { name: "ขวางล่างมุ้ง (ใหญ่)", code: "B20054", len: freeCross, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0) },
  ],
  hardware: [...smsSlideHardware((o) => o.N, "LR", "เสากุญแจ ML"), ...smsMeshHardware(meshCountOf)],
};

/**
 * ② SMS เปิดคู่กลาง (sheet "เปิดคู่กลาง") — จำนวนบานคงที่ 4 (Excel หาร 4 ตายตัว)
 * ⚠ ตบร่องกลาง ใช้ +9.7 ตามที่ Excel คำนวณจริง (แผงค่าหักเขียน 11.5 แต่ไม่มีสูตรอ้าง — รอเจ้าของเคาะ)
 * ⚠ เสากุญแจ เตี้ยหัก 3.2 ตามชีตนี้ (ชีตอิสระ/ลากจูง = 3 — รอเจ้าของยืนยันว่าตั้งใจต่าง)
 */
const centerCross = (o: CutInput) => (o.W - 35.3) / 4; // ขวางบน/ล่าง — ใช้ร่วมมุ้งเฟรมใหญ่
export const SMS_SLIDE_CENTER: CutSpec = {
  id: "sms_slide_center",
  name: "SMS บานเลื่อนเปิดคู่กลาง (4 บาน)",
  stockLen: 640,
  rails: ["3รางเสียบ", "รางเตี้ย7มม"],
  opts: [...HANDLE_OPTS_LR, ...MESH_OPTS],
  defaults: { W: 350, H: 159, N: 4, rail: "3รางเสียบ", honk: false, ...HANDLE_DEF_LR, ...MESH_DEF },
  profiles: [
    { name: "เฟรมล่าง", code: (o) => (isPlug(o.rail) ? "B20041" : "B20047"), len: (o) => o.W - 4.4, qty: () => 1 },   // รางเตี้ย = B20047 เฟรมล่างภายใน (B20046 คือชนกลาง คนละตัว · ยืนยันจากชื่อในไฟล์ v9)
    { name: "เฟรมบน", code: "B20001", len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมข้าง", code: "B20003", len: (o) => o.H, qty: () => 2 },
    { name: "เสากุญแจมัลติพ้อย", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: () => 2 },
    { name: "เสากุญแจบานตาย", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: () => 2 },
    { name: "เสาเกี่ยว", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: (o) => (honkOf(o) ? 2 : 4) },
    { name: "เสาเกี่ยวโหนก", code: "B20010", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: (o) => (honkOf(o) ? 2 : 0) },
    { name: "ชนกลาง", code: "B20046", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: () => 1 },
    { name: "ขวางบน", code: "B20054", len: centerCross, qty: () => 4 },
    { name: "ขวางล่าง", code: "B20054", len: centerCross, qty: () => 4 },
    { name: "ฝาปิดเฟรมข้าง", code: "B20019", len: (o) => o.H - (isPlug(o.rail) ? 5 : 2.3), qty: () => 4 },
    { name: "ตบเฟรมบน/ล่าง ร่องในบน", code: "-", len: (o) => o.W - 7, qty: (o) => (meshOf(o) === "ไม่มี" ? 1 : 0) },
    { name: "ตบเฟรมบน/ล่าง ร่องในล่าง", code: (o) => (meshOf(o) === "เฟรมเล็ก" ? "B20048" : "-"), len: (o) => o.W - 7, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 0 : 1) },
    { name: "ตบเฟรมบน/ล่าง ร่องกลาง", code: "-", len: (o) => (o.W - 4.4) - 2 * (centerCross(o) + 9.7), qty: () => 2, note: "เฟรมบน − 2×(ขวางล่าง+9.7)" },
    { name: "เบรคบาน (ธรณี)", code: "B20050", len: (o) => o.W - 4.4, qty: (o) => (o.rail === "รางเตี้ย7มม" ? 2 : 0) },
    { name: "ตบรางล้อ", code: "F7994", len: (o) => o.W - 4.4, qty: (o) => (isPlug(o.rail) ? 2 : 0) },   // รางเตี้ยไม่ใช้ตบรางล้อ
    { name: "ตบรางล้อ (มุ้งใหญ่)", code: "F7994", len: (o) => o.W - 4.4, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 2 : 0) },
    { name: "เสานอนมุ้ง (เฟรมเล็ก)", code: "B30006", len: (o) => centerCross(o) + 9.7, qty: (o) => (meshOf(o) === "เฟรมเล็ก" ? 4 : 0) },
    { name: "เสาตั้งมุ้ง (เฟรมเล็ก)", code: "B30006", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2) - 1, qty: (o) => (meshOf(o) === "เฟรมเล็ก" ? 4 : 0) },
    { name: "เสากุญแจมุ้ง (ใหญ่)", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 2 : 0), note: "อลูเดียวกับเสากุญแจมัลติพ้อย" },
    { name: "เสาเกี่ยวมุ้ง (ใหญ่)", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 2 : 0), note: "อลูเดียวกับเสาเกี่ยว" },
    { name: "ขวางบนมุ้ง (ใหญ่)", code: "B20054", len: centerCross, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 2 : 0) },
    { name: "ขวางล่างมุ้ง (ใหญ่)", code: "B20054", len: centerCross, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 2 : 0) },
  ],
  // เปิดคู่กลาง: ล้อ/น็อต/สักหลาด คิดสัมประสิทธิ์บาน = 2 (คู่กลาง) แม้ N=4 · เสากุญแจ = "มัลติพ้อย" · มุ้ง = 2 มุ้งเสมอ (ไม่มี meshCount)
  hardware: [...smsSlideHardware(() => 2, "LR", "เสากุญแจมัลติพ้อย"), ...smsMeshHardware(() => 2)],
};

/**
 * ③ SMS ลากจูง (sheet "ลากจูง" v2 · กองข้างเดียว) — N=3 ลากจูง · N=2 เลื่อนเดี่ยว · รหัสเสากุญแจไฟล์พิมพ์ "20051" (ตกตัว B → ใช้ B20051)
 * v2 แก้ 2 เส้น (ยืนยัน N=3 = ค่าปัจจุบัน) — อ่านจาก JR_SMS_เลื่อนอิสระ_รวมv2.xlsx sheet "ลากจูง" D20/D21:
 *   ตบร่องบานเลื่อน: N≤2 = ขวางบน+4.7−0.4 · N≥3 = ขวางบน+4.7 (เดิม N≥3 เท่านั้น ไม่มีกิ่ง N≤2)
 *   ตบร่องบานตาย: N≤2 = W−7 · N≥3 = (W−4.4)−1.3−ขวางบน−9.7×(N−2) (เดิม −11 คงที่ ไม่ผูก N)
 */
const towCross = (o: CutInput) => (o.W - 4.2 * o.N - 11.2) / o.N; // ขวางบน (ใช้ร่วมตบร่องบานเลื่อน/บานตาย)
export const SMS_SLIDE_TOW: CutSpec = {
  id: "sms_slide_tow",
  name: "SMS บานเลื่อนลากจูง (กองข้างเดียว)",
  stockLen: 640,
  rails: ["3รางเสียบ", "รางเตี้ย7มม"],
  opts: [...HANDLE_OPTS_L, ...MESH_OPTS, { key: "meshCount", label: "จำนวนมุ้ง", type: "number" }],
  defaults: { W: 200, H: 240, N: 3, rail: "3รางเสียบ", honk: false, ...HANDLE_DEF_L, ...MESH_DEF, meshCount: 1 },
  profiles: [
    { name: "เฟรมล่าง", code: (o) => (isPlug(o.rail) ? "B20041" : "B20047"), len: (o) => o.W - 4.4, qty: () => 1 },   // รางเตี้ย = B20047 เฟรมล่างภายใน (B20046 คือชนกลาง คนละตัว · ยืนยันจากชื่อในไฟล์ v9)
    { name: "เฟรมบน", code: "B20001", len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมข้าง", code: "B20003", len: (o) => o.H, qty: () => 2 },
    { name: "เสากุญแจ ML", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: () => 2 },
    { name: "เสาเกี่ยว", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (honkOf(o) ? o.N - 1 : 2 * (o.N - 1)) },
    { name: "เสาเกี่ยวโหนก", code: "B20010", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (honkOf(o) ? o.N - 1 : 0) },
    { name: "ขวางบน", code: "B20054", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N, qty: (o) => o.N },
    { name: "ขวางล่าง", code: "B20054", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N, qty: (o) => o.N },
    { name: "ฝาปิดเฟรมข้าง", code: "B20019", len: (o) => o.H - (isPlug(o.rail) ? 5 : 2.3), qty: () => 4 },
    { name: "ตบร่องบานเลื่อน", code: "-", len: (o) => towCross(o) + (o.N <= 2 ? 4.3 : 4.7), qty: () => 2, note: "N≤2: ขวางบน+4.7−0.4 · N≥3: ขวางบน+4.7" },
    { name: "ตบร่องบานตาย (ร่องในบน)", code: "-", len: (o) => (o.N <= 2 ? o.W - 7 : (o.W - 4.4) - 1.3 - towCross(o) - 9.7 * (o.N - 2)), qty: (o) => (meshOf(o) === "ไม่มี" ? 1 : 0), note: "N≤2: W−7 · N≥3: (W−4.4)−1.3−ขวางบน−9.7×(N−2)" },
    { name: "ตบร่องบานตาย (ร่องในล่าง)", code: (o) => (meshOf(o) === "เฟรมเล็ก" ? "B20048" : "-"), len: (o) => (o.N <= 2 ? o.W - 7 : (o.W - 4.4) - 1.3 - towCross(o) - 9.7 * (o.N - 2)), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? 0 : 1) },
    { name: "เบรคบาน (ธรณี)", code: "B20050", len: (o) => o.W - 4.4, qty: (o) => (o.rail === "รางเตี้ย7มม" ? 2 : 0) },
    { name: "ตบรางล้อ", code: "F7994", len: (o) => o.W - 4.4, qty: (o) => (isPlug(o.rail) ? o.N : 0) },   // รางเตี้ยไม่ใช้ตบรางล้อ (ใช้ B20050 แทน)
    { name: "ตบรางล้อ (มุ้งใหญ่)", code: "F7994", len: (o) => o.W - 4.4, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0) },
    { name: "เสานอนมุ้ง (เฟรมเล็ก)", code: "B30006", len: (o) => towCross(o) + 9.7, qty: (o) => (meshOf(o) === "เฟรมเล็ก" ? 2 * meshCountOf(o) : 0) },
    { name: "เสาตั้งมุ้ง (เฟรมเล็ก)", code: "B30006", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3) - 1, qty: (o) => (meshOf(o) === "เฟรมเล็ก" ? 2 * meshCountOf(o) : 0) },
    { name: "เสากุญแจมุ้ง (ใหญ่)", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0), note: "อลูเดียวกับเสากุญแจ ML" },
    { name: "เสาเกี่ยวมุ้ง (ใหญ่)", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0), note: "อลูเดียวกับเสาเกี่ยว" },
    { name: "ขวางบนมุ้ง (ใหญ่)", code: "B20054", len: towCross, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0) },
    { name: "ขวางล่างมุ้ง (ใหญ่)", code: "B20054", len: towCross, qty: (o) => (meshOf(o) === "เฟรมใหญ่" ? meshCountOf(o) : 0) },
  ],
  // ลากจูง: บานที่ขยับ = N−1 (กองข้างเดียว) · มือจับชุดเดียว · ตบรางล้อ = N (raw N ตามไฟล์ ไม่ใช่ N−1)
  hardware: [...smsSlideHardware((o) => o.N - 1, "L", "เสากุญแจ ML"), ...smsMeshHardware(meshCountOf)],
};

/**
 * ④ SlimLux บานเลื่อนรางบน (JR_SlimLux_บานเลื่อน v2.xlsx)
 * ⚠ ชีตไม่มีคอลัมน์เส้นสต็อก → ใส่ 640 ไว้ก่อน (TODO เจ้าของยืนยัน)
 * ⚠ ตบเรียบบานตาย: Excel จำนวน = 0 คงที่ (F57) ไม่ผูกจำนวนบานตาย — พอร์ตตาม (แก้มือเมื่อมีบานตาย)
 * รหัสรุ่นเป็น OPK/XSW/WM (ไม่ใช่ B####) — ถ้าจะผูกสต็อกต้องมี sku พวกนี้ในหน้าสต๊อก
 * v2: "เสารับบาน" เปลี่ยนจากเลือกกล่องอัตโนมัติ(ตาม N) → ผู้ใช้เลือกกล่องเอง (dropdown C16 ในไฟล์)
 *   รองรับกล่องผสมคั่นด้วย "+" (เช่น "1×4+1×4+1×1.6") · จำนวนกล่องรวม = (จำนวน "+" + 1) × ฝั่ง(แปะนอก=1/ยัดใน=2)
 *   แตกหักสต็อกเป็นกล่องย่อยตามรหัส (Excel R85-89: 1×1.6/1×4/1×3 เท่านั้นที่มีในตัวเลือก v2)
 */
const slimBeamCut = (beam?: string) =>
  ({ "1×2": 2.5, "2×2": 5, "1×4": 2.5, "2×4": 5, "1×4+1×1.6": 2.5, "2×4+4×4": 10.2, "4×4": 10.2 } as Record<string, number>)[beam ?? "1×4"] ?? 2.5;
const slimDead = (m?: string) => (m === "ลากจูง" ? 1 : m === "เปิดคู่กลาง" ? 2 : 0);
// เสารับบาน v2 — เลือกกล่องเอง (คั่น "+" = กล่องผสม) · choices ตรงดรอปดาว C16 ในไฟล์ (default "1×4+1×4")
const RECEIVER_BOX_CHOICES = ["1×1.6", "1×4", "1×3+1×3", "1×4+1×4", "1×4+1×4+1×1.6", "1×4+1×4+1×4"];
const receiverSegs = (text?: string) => String(text ?? "1×4+1×4").split("+").map((s) => s.trim()).filter(Boolean);
// จำนวนกล่องขนาด size ในตัวเลือกที่พิมพ์/เลือก × ฝั่ง (แปะนอก=1 · ยัดในช่อง=2) — ตรง Excel R87-89 (÷ความยาวรหัส × ฝั่ง)
const receiverCount = (o: CutInput, size: string) => receiverSegs(o.receiverBox).filter((s) => s === size).length * (o.fit === "แปะนอก" ? 1 : 2);

export const SLIMLUX_SLIDE: CutSpec = {
  // ⚠ รหัสอลูยึด "รหัสในสโตร์" (OPK-A2xx-40 · XSW) — เจ้าของยืนยัน 20 ส.ค.69
  //   ของเดิมเขียน OPK-A201 (ไม่มี -40) กับ WM-K20 → ไม่ตรงสโตร์ หักสต็อกไม่ได้
  id: "slimlux_slide",
  name: "SlimLux บานเลื่อนรางบน",
  stockLen: 600, // เจ้าของยืนยัน: เส้น 6 ม. (เสากุญแจมี 2 ขนาด 4.8/6 → ระบุ stockLens ต่อโปรไฟล์)
  rails: [],
  opts: [
    { key: "fit", label: "รูปแบบช่องปูน", choices: ["ยัดในช่อง", "แปะนอก"] },
    { key: "sashMode", label: "รูปแบบบาน", choices: ["อิสระ", "ลากจูง", "เปิดคู่กลาง"] },
    { key: "beam", label: "คาน (กล่อง)", choices: ["1×2", "2×2", "1×4", "2×4", "1×4+1×1.6", "2×4+4×4", "4×4"] },
    { key: "handle", label: "มือจับ", choices: ["X-J", "มือจับล็อค", "ไม่มี", "อื่นๆ"] },
    { key: "handleColor", label: "สีมือจับล็อค", choices: ["ขาว", "ดำ"] },
    { key: "boxSide", label: "ทิศทางเลื่อน", choices: ["มือจับขวา เลื่อนเปิดซ้าย", "มือจับซ้าย เลื่อนเปิดขวา"] },
    { key: "receiverBox", label: "กล่องเสารับบาน", choices: RECEIVER_BOX_CHOICES },
  ],
  defaults: { W: 300, H: 240, N: 3, rail: "", honk: false, fit: "ยัดในช่อง", sashMode: "อิสระ", beam: "1×4", handle: "X-J", handleColor: "ขาว", boxSide: "มือจับขวา เลื่อนเปิดซ้าย", receiverBox: "1×3" },
  profiles: [
    // คาน: รหัสต้องเป็นรูปแบบสต็อกจริง กล่อง 1"x4" (เดิมออก "กล่อง 1×4" → จับสต็อกไม่ติด โชว์ไม่มีในสต็อก)
    // คานผสม (1×4+1×1.6 / 2×4+4×4) = 2 กล่องตัดยาวเท่ากัน → แตกเป็น 2 โปรไฟล์ (ตัวเสริมอยู่บรรทัดถัดไป)
    { name: "คาน", code: (o) => beamBoxCodes(o.beam ?? "1×4")[0] ?? "-", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W), qty: () => 1, note: "ยัดในช่อง=W · แปะนอก=W×2" },
    { name: "คาน (กล่องตัวที่ 2 — คานผสม)", code: (o) => beamBoxCodes(o.beam ?? "1×4")[1] ?? "-", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W), qty: (o) => (beamBoxCodes(o.beam ?? "1×4").length > 1 ? 1 : 0) },
    { name: "รางบน (รางแขวน)", code: "XSW40008", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W - 5), qty: (o) => o.N - slimDead(o.sashMode), note: "จำนวน = บานเลื่อน" },
    // เสารับบาน v2: แตกตามกล่องที่เลือก (receiverBox) — ยาวเท่ากันทุกท่อน ต่างแค่รหัส/จำนวนต่อขนาดกล่อง
    { name: "เสารับบาน (กล่อง 1×1.6)", code: () => boxCode("1×1.6"), len: (o) => o.H - slimBeamCut(o.beam), qty: (o) => receiverCount(o, "1×1.6") },
    { name: "เสารับบาน (กล่อง 1×4)", code: () => boxCode("1×4"), len: (o) => o.H - slimBeamCut(o.beam), qty: (o) => receiverCount(o, "1×4") },
    { name: "เสารับบาน (กล่อง 1×3)", code: () => boxCode("1×3"), len: (o) => o.H - slimBeamCut(o.beam), qty: (o) => receiverCount(o, "1×3") },
    { name: "บังใบ 4 หุน (กล่อง 4 หุน)", code: 'กล่อง 4 หุน', len: (o) => o.H - slimBeamCut(o.beam) - 3.6, qty: () => 2 },
    { name: "ขวางบน-ล่าง", code: "OPK-A201-40", len: (o) => (o.fit === "แปะนอก" ? (o.W - 0.8) / o.N + 0.2 * o.N : (o.W - 5) / o.N + 0.2 * o.N), qty: (o) => 2 * o.N },
    { name: "เสากุญแจ", code: "OPK-A202-40", len: (o) => o.H - slimBeamCut(o.beam) - 12.1, qty: (o) => 2 * o.N, stockLens: [480, 600], note: "เส้นมี 2 ขนาด 4.8/6 ม. — เลือกอันคุ้มสุด" },
    { name: "ตบเรียบหน้าเสากุญแจ (บานเลื่อน)", code: "OPK-A203-40", len: (o) => o.H - slimBeamCut(o.beam) - 5.1, qty: (o) => (o.fit === "แปะนอก" ? 1 : 2) },
    { name: "ตบเรียบหน้าเสากุญแจ (บานตาย)", code: "OPK-A203-40", len: (o) => o.H - slimBeamCut(o.beam), qty: () => 0, note: "Excel = 0 คงที่ (แก้มือเมื่อมีบานตาย — รอเจ้าของเคาะสูตร)" },
    { name: "ตบเกี่ยวใส่สักหลาด", code: "OPK-A204-40", len: (o) => o.H - slimBeamCut(o.beam) - 5.1, qty: (o) => o.N - slimDead(o.sashMode) + 1 + (o.fit === "แปะนอก" ? 1 : 0), note: "บานเลื่อน+1 (+1 ถ้าแปะนอก)" },
    // เสามือจับ X-J = เส้นอลู (มีในสโตร์แล้ว 3 สี "มือจับ xj ยาว 2.8m" — รอรหัสจากเจ้าของ)
    //   เลือก "มือจับล็อค" แล้ว X-J เป็น 0 อัตโนมัติ (เจ้าของสั่ง 21 ส.ค.69 — ใช้ร่วมกันไม่ได้)
    // เสามือจับ X-J — ขายเป็นท่อนยาว 2.8 ม. · แยกรหัสตามสี (เจ้าของให้รหัส 21 ส.ค.69)
    //   ขาว JR02890 · ดำ JR02889 · สีอื่นใช้ "มิว" JR02891 (สีดิบ) แล้วบวกค่าอบ
    { name: "มือจับ X-J (เสามือจับ)",
      code: (o) => { const c = String(o.color ?? ""); return /ขาว/.test(c) ? "JR02890" : /ดำ/.test(c) ? "JR02889" : "JR02891"; },
      len: (o) => o.H - slimBeamCut(o.beam) - 12.1,
      qty: (o) => (o.handle === "X-J" ? (o.sashMode === "เปิดคู่กลาง" ? 4 : 2) : 0),
      stockLens: [280], note: "ท่อนยาว 2.8 ม. · ยาวเท่าเสากุญแจ · เลือกมือจับล็อคแล้วเป็น 0" },
    { name: 'ฉากปิดราง 2"', code: 'ฉาก 2"', len: (o) => o.W, qty: () => 2 },
    { name: "ตบปิดใต้รางริม", code: "XSW400013", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W - 5), qty: () => 2, note: "ยาวเท่ารางบน" },
    { name: "ตบปิดใต้รางกลาง", code: "XSW400023", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W - 5), qty: (o) => Math.max(o.N - slimDead(o.sashMode) - 1, 0), note: "บานเลื่อน − 1" },
  ],
  // ⑥ อุปกรณ์ SlimLux (มี SKU · กล่อง+ล้อ) — กล่องยาว หัว/ท้าย · กล่องสั้น บานกลางเลือกด้าน · ล้อล่าง 2/บานเลื่อน
  hardware: [
    { name: "กล่องยาว (หัว+ท้ายบาน)", sku: "JR00573", qty: (o) => (o.N <= 1 ? 1 : 2), unit: "กล่อง", note: "บานแรก+บานสุดท้าย" },
    { name: "กล่องสั้น ซ้าย (บานกลาง)", sku: "JR00575", qty: (o) => (sBoxLeft(o) ? Math.max(o.N - 2, 0) : 0), unit: "กล่อง" },
    { name: "กล่องสั้น ขวา (บานกลาง)", sku: "JR00574", qty: (o) => (!sBoxLeft(o) ? Math.max(o.N - 2, 0) : 0), unit: "กล่อง" },
    { name: "ล้อล่าง", sku: "JR00572", qty: (o) => 2 * (o.N - slimDead(o.sashMode)), unit: "ตัว", note: "บานเลื่อนละ 2 ตัว" },
    // มือจับล็อค — คนละรหัสตามสี (เจ้าของให้รหัส 20 ส.ค.69) · X-J เป็นเส้นอลู อยู่ในบล็อกโปรไฟล์
    { name: (o) => `มือจับล็อค สลิม (${o.handleColor === "ดำ" ? "ดำ" : "ขาว"})`,
      sku: (o) => (o.handleColor === "ดำ" ? "JR00367" : "JR00366"),
      qty: (o) => (o.handle === "มือจับล็อค" ? (o.sashMode === "เปิดคู่กลาง" ? 2 : 1) : 0), unit: "ชุด" },
    // สักหลาด — ใช้ยาวเท่า "ตบเกี่ยวใส่สักหลาด" (เจ้าของสั่ง 20 ส.ค.69) · สลิมใช้เบอร์ JR00776 (ไม่ใช่ JR00794 ของ SMS)
    // ซิลิโคน ใน+นอก — คิดราคาคิดอยู่แล้ว (ของใช้จริงทุกงาน) เติมฝั่งใบตัดให้ตรงกัน 21 ส.ค.69
    { name: "ซิลิโคน ใน+นอก", sku: "JR00504", qty: (o) => Math.ceil(((2 * (o.W + o.H)) / 100) * 2 / 12.5), unit: "หลอด" },
    { name: "สักหลาด (ม.)", sku: "JR00776", unit: "ม.", noStock: true, note: "ยาวเท่าตบเกี่ยว × จำนวนท่อน",
      qty: (o, ctx) => Math.round(ctx.len("ตบเกี่ยวใส่สักหลาด") * (o.N - slimDead(o.sashMode) + 1 + (o.fit === "แปะนอก" ? 1 : 0)) / 100 * 10) / 10 },
    otherHandleRow("handle"),
  ],
};

/**
 * ⑤ บานติดตาย (JR_บานติดตาย.xlsx) — N = จำนวนช่อง (เสาตั้ง = N+1 ใช้ร่วม) · เส้นสต็อก 600 ซม. (ต่างจาก SMS 640!)
 * ⚠ ตบร่อง: โน้ตชีตเขียน "700/เส้น" แต่สูตรคิดเส้นใช้ /600 — พอร์ตตามสูตร (รอเจ้าของเคาะ)
 * ไม่มีรหัส B#### ในไฟล์ — ชื่อเส้นล้วน (ยังไม่ผูกสต็อกอัตโนมัติ)
 */
const boxIs = (o: { box?: string }, k: string) => (o.box ?? "กล่อง 1.6×3 + 9014") === k;
export const FIXED_PANEL: CutSpec = {
  id: "fixed_panel",
  name: "บานติดตาย (เลือกชนิดกล่อง)",
  stockLen: 600,
  rails: [],
  opts: [{ key: "box", label: "ชนิดกล่อง", choices: ["กล่อง 1.6×3 + 9014", "กล่อง 1.6×4 + ฉาก", "กล่องร่อง"] }],
  defaults: { W: 150, H: 200, N: 1, rail: "", honk: false, box: "กล่อง 1.6×3 + 9014" },
  profiles: [
    { name: "กล่อง 1.6×3 — ตั้ง", code: "กล่อง 1.6\"x3\"", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? o.N + 1 : 0) },
    { name: "กล่อง 1.6×3 — นอน", code: "กล่อง 1.6\"x3\"", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? 2 * o.N : 0) },
    { name: "9014 คัลเทิลวอล — ตั้ง", code: "9014", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? o.N + 1 : 0) },
    { name: "9014 คัลเทิลวอล — นอน", code: "9014", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? 2 * o.N : 0) },
    { name: "กล่อง 1.6×4 — ตั้ง", code: "-", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่อง 1.6×4 + ฉาก") ? o.N + 1 : 0) },
    { name: "กล่อง 1.6×4 — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×4 + ฉาก") ? 2 * o.N : 0) },
    { name: "กล่อง 4หุน — ตั้ง", code: "-", len: (o) => o.H - 9 - 2.4, qty: (o) => (boxIs(o, "กล่อง 1.6×4 + ฉาก") ? o.N + 1 : 0) },
    { name: "กล่อง 4หุน — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×4 + ฉาก") ? 2 * o.N : 0) },
    { name: "ฉาก 4หุน — ตั้ง", code: "-", len: (o) => o.H - 9 - 2.4, qty: (o) => (boxIs(o, "กล่อง 1.6×4 + ฉาก") ? o.N + 1 : 0) },
    { name: "ฉาก 4หุน — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×4 + ฉาก") ? 2 * o.N : 0) },
    { name: "กล่องร่อง — ตั้ง", code: "-", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่องร่อง") ? o.N + 1 : 0) },
    { name: "กล่องร่อง — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่องร่อง") ? o.N : 0) },
    { name: "กล่องเปิด — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่องร่อง") ? o.N : 0) },
    { name: "ตบปิดกล่องเปิด — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่องร่อง") ? o.N : 0) },
    { name: "ตบร่อง — ตั้ง (ทุกเสากลาง)", code: "-", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่องร่อง") ? Math.max(o.N - 1, 0) : 0), note: "โน้ตชีต 700/เส้น (ขัดสูตร /600 — รอเคาะ)" },
  ],
  hardware: [
    // เทปวิ่งรอบกระจกแต่ละช่อง — ช่องกว้าง W/N (เดิมใช้ W เต็มต่อช่อง = เกินจริง เมื่อหลายช่อง)
    { name: "เทปนอร์ตัน (หนุนกระจก)", sku: "JR02937", qty: (o) => Math.round((2 * o.W + 2 * o.N * o.H) / 100 * 10) / 10, unit: "ม." },
    // ⚠ เอา "ซิลิโคน + ฉากเข้ามุม" ออกแล้ว (เจ้าของสั่ง 2 ก.ย.69 "เอาออก")
    //   เดิม 21 ส.ค.69 ผมเติม 2 บรรทัดนี้เข้าฝั่งใบตัด "ให้ตรงกับคิดราคา" เพื่อให้หน้าเทียบขึ้นเขียว
    //   = แก้กระดาษที่ใช้วัด ให้ตรงกับของที่วัด — กลับทิศกับกฎเจ้าของที่ให้ยึดใบตัดเป็นต้นทาง
    //   ไฟล์ JR_บานติดตาย.xlsx ไม่มีทั้ง "ฉากเข้ามุม" และ JR00557 (ค้นแล้ว ไม่เจอ)
    //   ของ 2 ตัวนี้มีจริงในชีตถอดทุน "คิดทุน ติดตาย" แถว 15 (ฉาก อลู 1"x1" 4 มุม/ช่อง เหมา 5 บาท/มุม)
    //   → เข้ากฎ ② ของเจ้าของ: มีในคิดราคา ไม่มีในใบตัด = ใช้ได้ ไม่ต้องกรอกในใบตัด
    //   หน้าเทียบจะขึ้น "มีแต่คิดราคา" ตามความจริง — ห้ามเติมกลับเพื่อไล่ให้เขียว
  ],
};

/**
 * ⑥ Velora บานเปิด (JR_Velora_บานเปิด.xlsx · 1 บาน/ชุด — หลายบานใช้ "ชุด")
 * rail = รูปแบบใส่ช่อง (ยัดในช่อง/ครอบวงกบ) · ⚠ ไฟล์ไม่ระบุเส้นสต็อก (ใส่ 640 รอเจ้าของ)
 * รหัสอลู: ไฟล์ถอดทุนไม่มีรหัส → ใช้รหัสตามที่ใช้จริงในสโตร์ (เจ้าของแจ้ง ส.ค.69)
 *   วงกบ = "Velora 01" · บาน = "Velora 02"  (จับคู่ผ่าน resolveStock: sku ตรง หรือ ชื่อมีรหัส)
 *   ⚠ ลูกฟูก 2 ทาง ยังไม่มีรหัส — ไฟล์ถอดทุนก็ไม่มีบรรทัดนี้ (คิดทุน Velora มีแค่ วงกบ/บาน) รอเจ้าของบอกรหัส
 */
const vFit = (rail: string) => rail === "ยัดในช่อง";
export const VELORA_SWING: CutSpec = {
  id: "velora_swing",
  name: "Velora บานเปิด",
  stockLen: 640, // TODO: ไฟล์ไม่ระบุ — รอเจ้าของยืนยัน
  rails: ["ยัดในช่อง", "ครอบวงกบ"],
  opts: [{ key: "hwColor", label: "สีอุปกรณ์", choices: ["ขาว", "ดำ"] }],
  defaults: { W: 220, H: 200, N: 1, rail: "ยัดในช่อง", honk: false, hwColor: "ขาว" },
  profiles: [
    { name: "วงกบบน", code: "JR02885", len: (o) => o.W + (vFit(o.rail) ? 0 : 2), qty: () => 1, note: "ตัด 45° 2 ฝั่ง" },
    { name: "วงกบข้าง", code: "JR02885", len: (o) => o.H + (vFit(o.rail) ? 0 : 1), qty: () => 2, note: "ตัด 45° 1 ฝั่ง" },
    { name: "กรอบบาน แนวนอน", code: "JR02886", len: (o) => o.W - (vFit(o.rail) ? 5.7 : 3.5), qty: () => 2, note: "เข้ามุม 45°" },
    { name: "กรอบบาน แนวตั้ง", code: "JR02886", len: (o) => o.H - (vFit(o.rail) ? 3.3 : 2.2), qty: () => 2, note: "เข้ามุม 45°" },
    { name: "ลูกฟูก 2 ทาง แนวตั้ง", code: "-", len: (o) => o.H + (vFit(o.rail) ? 0 : 1), qty: (o) => (vFit(o.rail) ? 2 : 0) },
    { name: "ลูกฟูก 2 ทาง แนวนอน", code: "-", len: (o) => o.W + (vFit(o.rail) ? 0 : 2), qty: (o) => (vFit(o.rail) ? 1 : 0) },
  ],
  hardware: [
    // รหัสตามสีฮาร์ดแวร์ (ชุดเดียวกับคิดราคา) — ดำ JR00560/JR00356 · ขาว JR00561/JR00355
    { name: "บานพับ", sku: (o: any) => (String(o.hwColor ?? "ขาว") === "ดำ" ? "JR00560" : "JR00561"), qty: () => 4, unit: "ตัว" },
    { name: "มือจับ (ล็อค)", sku: (o: any) => (String(o.hwColor ?? "ขาว") === "ดำ" ? "JR00356" : "JR00355"), qty: () => 1, unit: "ชุด" },
    { name: "ซิลิโคน ใน+นอก", sku: "JR00504", qty: (o) => Math.ceil(((2 * (o.W + o.H)) / 100) * 2 / 12.5), unit: "หลอด" },
  ],
};

/**
 * ⑦ SMS 240 บานเฟี้ยม (บานเฟี้ยมsms.xlsx · HOMELIFE 240 Fabricators Guide · ไฟล์ มม. → พอร์ต ซม.)
 * rail = config พับ "xLyR" (ตารางจากไฟล์ครบ 46 sheet) — N คิดจาก config อัตโนมัติ · glass = ความหนากระจก (เลือกรหัสคิ้ว)
 * ยังไม่พอร์ต: sheet "แบ่งบาน" (รอความหมาย P1/P2) + ฮาร์ดแวร์โรงงาน
 */
type BifoldCfg = { d: number; post: number; lock: number; handle: number; stop: number };
const SMS240_CFG: Record<string, BifoldCfg> = {
  "2L0R": { d: 18.2, post: 3, lock: 1, handle: 0, stop: 0 }, "0L2R": { d: 18.2, post: 3, lock: 1, handle: 0, stop: 0 },
  "2L1R": { d: 18.2, post: 4, lock: 1, handle: 1, stop: 2 }, "1L2R": { d: 18.2, post: 4, lock: 1, handle: 1, stop: 2 },
  "3L0R": { d: 18.2, post: 4, lock: 1, handle: 1, stop: 0 }, "0L3R": { d: 18.2, post: 4, lock: 1, handle: 1, stop: 0 },
  "1L3R": { d: 18.5, post: 6, lock: 1, handle: 1, stop: 2 }, "3L1R": { d: 18.5, post: 6, lock: 1, handle: 1, stop: 2 },
  "2L2R": { d: 18.5, post: 6, lock: 2, handle: 0, stop: 0 },
  "4L0R": { d: 18.2, post: 6, lock: 2, handle: 0, stop: 0 }, "0L4R": { d: 18.2, post: 6, lock: 2, handle: 0, stop: 0 },
  "1L4R": { d: 18.5, post: 7, lock: 2, handle: 1, stop: 2 }, "2L3R": { d: 18.5, post: 7, lock: 2, handle: 1, stop: 2 },
  "3L2R": { d: 18.5, post: 7, lock: 2, handle: 1, stop: 2 }, "4L1R": { d: 18.5, post: 7, lock: 2, handle: 1, stop: 2 },
  "5L0R": { d: 18.2, post: 7, lock: 2, handle: 1, stop: 0 }, "0L5R": { d: 18.2, post: 7, lock: 2, handle: 1, stop: 0 },
  "1L5R": { d: 18.5, post: 9, lock: 2, handle: 1, stop: 2 }, "5L1R": { d: 18.5, post: 9, lock: 2, handle: 1, stop: 2 },
  "3L3R": { d: 18.5, post: 9, lock: 1, handle: 2, stop: 2 },
  "6L0R": { d: 18.2, post: 9, lock: 3, handle: 0, stop: 0 }, "0L6R": { d: 18.2, post: 9, lock: 3, handle: 0, stop: 0 },
  "1L6R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 2 }, "2L5R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 2 },
  "3L4R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 2 }, "4L3R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 2 },
  "5L2R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 2 }, "6L1R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 2 },
  "7L0R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 0 }, "0L7R": { d: 18.5, post: 10, lock: 3, handle: 1, stop: 0 },
  "0L8R": { d: 18.5, post: 12, lock: 3, handle: 1, stop: 0 },
  "3L5R": { d: 18.5, post: 12, lock: 3, handle: 1, stop: 2 }, "5L3R": { d: 18.5, post: 12, lock: 3, handle: 1, stop: 2 },
  "4L4R": { d: 18.5, post: 12, lock: 4, handle: 0, stop: 0 },
  "3L6R": { d: 18.5, post: 13, lock: 4, handle: 1, stop: 2 }, "4L5R": { d: 18.5, post: 13, lock: 4, handle: 1, stop: 2 },
  "5L4R": { d: 18.5, post: 13, lock: 4, handle: 1, stop: 2 }, "6L3R": { d: 18.5, post: 13, lock: 4, handle: 1, stop: 2 },
  "5L5R": { d: 18.5, post: 15, lock: 4, handle: 1, stop: 2 },
  "5L6R": { d: 18.5, post: 16, lock: 5, handle: 1, stop: 2 }, "6L5R": { d: 18.5, post: 16, lock: 5, handle: 1, stop: 2 },
  "5L7R": { d: 18.5, post: 18, lock: 5, handle: 1, stop: 2 }, "6L6R": { d: 18.5, post: 18, lock: 6, handle: 0, stop: 0 },
  "7L7R": { d: 18.5, post: 21, lock: 6, handle: 1, stop: 2 }, "7L8R": { d: 18.5, post: 22, lock: 7, handle: 1, stop: 2 },
};
const smsCfg = (o: { rail: string }) => SMS240_CFG[o.rail] ?? SMS240_CFG["2L2R"];
// N จริงคิดจาก config (xLyR) เสมอ — กันกรอก N ไม่ตรง config
const smsN = (o: { rail: string; N: number }) => {
  const m = /^(\d+)L(\d+)R$/.exec(o.rail);
  return m ? Number(m[1]) + Number(m[2]) : Math.max(1, o.N);
};
// มุมตัด 45°/90° (JR_เฟี้ยม_SMS_รวม.xlsx sheet "JR คำนวณ 45-90") — 90°=สูตรเดิม (lookup smsCfg.d ต่อ config)
//   45°: สมมาตร(L=R) → ((W/2−6−(N/2+1)×0.4)/(N/2)) · ไม่สมมาตร → (W−6−(N+1)×0.4)/N
const smsIsSym = (o: CutInput) => { const m = /^(\d+)L(\d+)R$/.exec(o.rail); return !!m && m[1] === m[2]; };
const smsSashW = (o: CutInput) => {
  const N = smsN(o);
  if ((o.cutAngle ?? "45°") === "90°") return (o.W - smsCfg(o).d - 11.325 * (N - 1)) / N;
  return smsIsSym(o) ? (o.W / 2 - 6 - (N / 2 + 1) * 0.4) / (N / 2) : (o.W - 6 - (N + 1) * 0.4) / N;
};
const smsBead = (o: { glass?: number }) => (Number(o.glass ?? 6) <= 6 ? "B24008" : Number(o.glass ?? 6) <= 12 ? "B24016" : "B24013");

// LUT อุปกรณ์เฟี้ยม (จากตาราง 45-90 · คอลัมน์ K + N-V) — key = ซ้าย_ขวา_แบ่งบาน(1/0)
//   ค่า = [บานพับเดียว, บานพับต่างระดับ, ล้อตายซ้าย, ล้อตายขวา, ล้อปลายซ้าย, ล้อปลายขวา, ล้อกลางMeeting, ล้อกลางInter, สลักล็อค]
const SMS240_HW: Record<string, number[]> = {
  // 2 บาน — พอร์ตเพิ่ม 21 ส.ค.69 จากชีต "240_2Panel(L)" / "(R)" (เดิมตกหล่น → อุปกรณ์เป็น 0 หมด)
  //   ชีต (L): ล้อแขวนบานตายซ้าย 05-006 ×1 · ล้อแขวนบานสุดท้าย 05-009 ×1 · บานพับมีมือจับ 05-004 ×1 · สลักล็อค ×1
  "2_0_0": [1,0,1,0,0,1,0,0,1], "0_2_0": [1,0,0,1,1,0,0,0,1],
  "2_1_0": [1,0,1,1,0,1,0,0,1], "1_2_0": [1,0,1,1,1,0,0,0,1], "3_0_0": [0,1,1,0,0,0,0,1,1], "0_3_0": [0,1,0,1,0,0,0,1,1],
  "1_3_0": [0,1,1,1,0,0,0,1,1], "2_2_1": [2,0,1,1,0,0,1,0,2], "3_1_0": [0,1,1,1,0,0,0,1,1], "4_0_0": [0,1,1,0,0,1,0,1,2],
  "0_4_0": [0,1,0,1,1,0,0,1,2], "1_4_0": [0,2,1,1,1,0,0,1,2], "2_3_0": [1,1,1,1,0,1,0,1,2], "3_2_0": [1,1,1,1,1,0,0,1,2],
  "4_1_0": [0,2,1,1,0,1,0,1,2], "5_0_0": [1,1,1,0,0,0,0,2,2], "0_5_0": [1,1,0,1,0,0,0,2,2], "1_5_0": [1,1,1,1,0,0,0,2,2],
  "3_3_0": [0,2,1,1,0,0,0,2,2], "3_3_1": [0,2,1,1,0,0,0,2,6], "5_1_0": [1,1,1,1,0,0,0,2,2], "6_0_0": [1,2,1,0,0,1,0,2,3],
  "0_6_0": [1,2,0,1,1,0,0,2,3], "1_6_0": [1,2,1,1,1,0,0,2,3], "3_4_0": [0,3,1,1,1,0,0,2,3], "4_3_0": [0,3,1,1,0,1,0,2,3],
  "5_2_0": [2,1,1,1,1,0,0,2,3], "6_1_0": [1,2,1,1,0,1,0,2,3], "7_0_0": [2,1,1,0,0,0,0,3,3], "0_7_0": [2,1,0,1,0,0,0,3,3],
  "3_5_0": [1,2,1,1,0,0,0,3,3], "4_4_0": [0,4,1,1,0,0,1,2,4], "5_3_0": [1,2,1,1,0,0,0,3,3], "3_6_0": [1,3,1,1,1,0,0,3,4],
  "4_5_0": [1,3,1,1,0,1,0,3,4], "5_4_0": [1,3,1,1,1,0,0,3,4], "6_3_0": [1,3,1,1,0,1,0,3,4], "5_5_0": [2,2,1,1,0,0,0,4,4],
  "5_6_0": [2,3,1,1,1,0,0,4,5], "6_5_0": [2,3,1,1,0,1,0,4,5], "5_7_0": [3,2,1,1,0,0,0,5,5], "6_6_0": [2,4,1,1,0,0,1,4,6],
  "7_7_0": [4,2,1,1,0,0,0,6,6], "7_8_0": [4,3,1,1,0,1,0,6,7],
};
// อุปกรณ์เฟี้ยม 9 ตัว: [ชื่อ, SKUดำ, SKUขาว] (สลักล็อคไม่มีสี) — เรียงตรงกับ index ใน SMS240_HW
const SMS240_HW_DEFS: [string, string, string][] = [
  ["ชุดบานพับ (ระดับเดียว)", "JR00602", "JR00610"],
  ["ชุดบานพับ (ต่างระดับ)", "JR00603", "JR00611"],
  ["ล้อแขวนบานตาย ซ้าย", "JR00604", "JR00612"],
  ["ล้อแขวนบานตาย ขวา", "JR00605", "JR00613"],
  ["ล้อแขวนปลาย ซ้าย", "JR00606", "JR00614"],
  ["ล้อแขวนปลาย ขวา", "JR00607", "JR00615"],
  ["ล้อแขวนบานกลาง (Meeting)", "JR00608", "JR00616"],
  ["ล้อแขวนบานกลาง (Inter)", "JR00609", "JR00617"],
];
// หาแถว LUT: L_R_แบ่งบาน → ถ้าไม่เจอลองสลับ flag แบ่งบาน (บาง config มีแค่แบบเดียว)
const sms240Lut = (o: CutInput): number[] | null => {
  const m = /^(\d+)L(\d+)R$/.exec(o.rail); if (!m) return null;
  const L = m[1], R = m[2], f = o.fold2 === "แบ่งบาน" ? "1" : "0";
  return SMS240_HW[`${L}_${R}_${f}`] ?? SMS240_HW[`${L}_${R}_${f === "1" ? "0" : "1"}`] ?? null;
};

export const SMS240_BIFOLD: CutSpec = {
  id: "sms240_bifold",
  name: "SMS 240 บานเฟี้ยม (HOMELIFE)",
  stockLen: 640,
  rails: Object.keys(SMS240_CFG),
  opts: [
    { key: "glass", label: "กระจก (มม.)", type: "number" },
    { key: "fold2", label: "การพับ", choices: ["แบ่งบาน", "เดี่ยว"] },
    // อุปกรณ์เฟี้ยมมีแค่ ดำ/เงิน (ไม่มีขาว) — ตรงชื่อในสต็อก "อุปกรณ์ชุดบานเฟี้ยม-สีดำ/สีเงิน"
    { key: "hwColor", label: "สีอุปกรณ์", choices: ["เงิน", "ดำ"] },
    { key: "cutAngle", label: "มุมตัด", choices: ["45°", "90°"] },
  ],
  defaults: { W: 350, H: 250, N: 4, rail: "2L2R", honk: false, glass: 6, fold2: "แบ่งบาน", hwColor: "เงิน", cutAngle: "45°" },
  profiles: [
    { name: "เฟรมบน", code: "B24001", len: (o) => o.W - 6, qty: () => 1 },
    { name: "บังใบบน", code: "B24002", len: (o) => o.W - 8.6, qty: () => 1 },
    { name: "เฟรมล่าง", code: "B24003", len: (o) => o.W - 6, qty: () => 1 },
    { name: "ตัวตับธรณี", code: "B24004", len: (o) => o.W - 6, qty: () => 1 },
    { name: "เฟรมข้าง (ซ้าย+ขวา)", code: "B24005", len: (o) => o.H, qty: () => 2 },
    { name: "บังใบข้าง (ซ้าย+ขวา)", code: "B24006", len: (o) => o.H - 9.6, qty: () => 2 },
    { name: "ขวางบน+ล่าง", code: "B24007", len: smsSashW, qty: (o) => 2 * smsN(o) },
    { name: "เสา", code: "B24007", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).post },
    // เสากุญแจ: จำนวนมาจาก config เสมอ (smsCfg.lock) ไม่ผูกมุมตัด — มุมตัดกระทบแค่ความยาวขวาง/คิ้ว (สมมาตรบางคอนฟิก INT(N/2) ผิดจากค่าจริง เช่น 3L3R=1 ไม่ใช่ 3)
    { name: "เสากุญแจ", code: "B24007", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).lock },
    { name: "เสากุญแจมือจับ", code: "B24007", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).handle },
    { name: "บังใบ (บานสวิง)", code: "B24009", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).stop },
    { name: "คิ้วตบกระจกแนวนอน", code: smsBead, len: smsSashW, qty: (o) => 2 * smsN(o) },
    { name: "คิ้วตบกระจกแนวตั้ง", code: smsBead, len: (o) => o.H - 24.2, qty: (o) => 2 * smsN(o) },
  ],
  // กระจก (ไม่ใช่เส้นตัดอลู): (H−21.5) × (ขวาง−1.3) ซม. × N แผ่น
  // ⑤ อุปกรณ์ (มี SKU · จำนวนจาก LUT 42 config × แบ่งบาน · SKU พลิกดำ/ขาว) + ยางเฟรม/กรอบบาน
  hardware: [
    ...SMS240_HW_DEFS.map((d, i) => ({
      name: d[0],
      sku: (o: CutInput) => (o.hwColor === "ดำ" ? d[1] : d[2]),
      qty: (o: CutInput) => sms240Lut(o)?.[i] ?? 0,
      unit: "ชุด",
    })),
    // ชุดสลักล็อค = 05-014 · รหัส JR00563 ตามไฟล์ตัดประกอบ JR_เฟี้ยม_SMS_รวม.xlsx ช่อง D55 (เจ้าของยืนยัน 31 ส.ค.69 "ยึดตามไฟล์นี้")
    //   ⚠ แถว JR00563 ในสโตร์ตอนนี้ชื่อ "CDQ ชุดบานเฟี้ยม CMECH" ราคา ฿0 — ถ้าชื่อไม่ตรงของจริง แก้ชื่อในสโตร์ได้เลย
    //   (24 ส.ค.69 เคยปลดออกเพราะชื่อไม่ตรง · 31 ส.ค.69 เจ้าของสั่งให้ยึดไฟล์ = ใส่คืน)
    { name: "ชุดสลักล็อค (Twin Bolt · 05-014)", sku: "JR00563", qty: (o) => sms240Lut(o)?.[8] ?? 0, unit: "ชุด" },
    { name: "ซิลิโคน ใน+นอก", sku: "JR00504", qty: (o) => Math.ceil(((2 * (o.W + o.H)) / 100) * 2 / 12.5), unit: "หลอด" },
    { name: "ยางเฟรม (บน+ล่าง+ข้าง×2)", sku: "JR00804", qty: (o) => Math.round((2 * o.W + 2 * o.H) / 100 * 10) / 10, unit: "ม." },
    { name: "ยางกรอบบาน (วน 2 รอบ/บาน)", sku: "JR00805", qty: (o) => Math.round(2 * (smsSashW(o) + (o.H - 9.2)) * 2 * smsN(o) / 100 * 10) / 10, unit: "ม." },
  ],
};

/**
 * ⑧ เฟี้ยมยูโร 45° (JR_เฟี้ยมยูโร.xlsx sheet "JR คำนวณ" — เลือกไฟล์นี้เพราะมีเบอร์ดาย F#### ครบ)
 * L = บานพับซ้าย (ที่เหลือ = ขวา) → กรณี ชนผนัง-คู่/คี่ · คู่+คู่ / คี่+คี่ / คู่+คี่ (M + ชิ้นพิเศษตามตารางไฟล์)
 * ยังไม่พอร์ต: 6 sheet CORNER (เฟี้ยมเข้ามุม — สูตรต่างจริง รอยืนยันนิยามเปิด/ปิดบาน) + ฮาร์ดแวร์ LUT
 */
type EuroCase = { M: number; mid: number; stop: number; lockJamb: number; lockPair: number };
const EURO_CASES: Record<string, EuroCase> = {
  "ชนผนัง-คู่": { M: 5, mid: 1, stop: 0, lockJamb: 1, lockPair: 0 },
  "ชนผนัง-คี่": { M: 1.8, mid: 0, stop: 1, lockJamb: 0, lockPair: 0 },
  "คู่+คู่": { M: 7.1, mid: 2, stop: 0, lockJamb: 0, lockPair: 0 },
  "คี่+คี่": { M: 2.3, mid: 0, stop: 2, lockJamb: 0, lockPair: 0 },
  "คู่+คี่": { M: 5.8, mid: 0, stop: 1, lockJamb: 0, lockPair: 1 },
};
const euroCase = (o: { N: number; L?: number }): EuroCase => {
  const L = o.L ?? Math.ceil(o.N / 2);
  const R = o.N - L;
  const hi = Math.max(L, R), lo = Math.min(L, R);
  const key = lo === 0
    ? (hi % 2 === 0 ? "ชนผนัง-คู่" : "ชนผนัง-คี่")
    : (hi % 2 === 0 && lo % 2 === 0 ? "คู่+คู่" : hi % 2 === 1 && lo % 2 === 1 ? "คี่+คี่" : "คู่+คี่");
  return EURO_CASES[key];
};
const eIsU = (rail: string) => rail === "รางยู";
// ขวาง 45°: (W − เฟรม 1.8×2 − จุดข้าง 0.95×จุด − รอยซ้อน 0.8×รอย − M) / N
const euroSashW = (o: { W: number; N: number; L?: number }) => {
  const L = o.L ?? Math.ceil(o.N / 2);
  const lo = Math.min(L, o.N - L);
  const pts = lo === 0 ? 1 : 2;
  const laps = o.N - pts;
  return (o.W - 2 * 1.8 - pts * 0.95 - laps * 0.8 - euroCase(o).M) / o.N;
};
const euroSashH = (o: { H: number; rail: string }) => o.H - 5.5 - 2 * 0.7 - (eIsU(o.rail) ? 0 : 2.5);
// จำนวนบานพับเฟี้ยม HD-641 — ตาราง LUT จากไฟล์ (ขึ้นกับจำนวนบาน · รูปแบบพับ · ความสูง)
//   ชุดเดียวกับที่คิดราคา 4.0 ใช้ (ตัวแปร HINGE) — แก้ที่นี่ต้องแก้ที่นั่นด้วย
const euroHinge = (o: { N: number; L?: number; H: number }): number => {
  const L = o.L ?? Math.ceil(o.N / 2);
  const wall = L === 0 || L === o.N;      // รวบชนผนัง (X-0 / 0-X)
  const hmm = o.H * 10;                   // ซม. → มม.
  const T: Record<string, [number, number, number, number]> = {
    "2w": [2700, 7, 9999, 10], "3w": [3000, 7, 9999, 13], "3m": [9999, 9, 9999, 12],
    "4w": [9999, 11, 9999, 16], "4m": [3000, 14, 9999, 26],
    "5w": [9999, 11, 9999, 16], "5m": [9999, 14, 9999, 20],
    "6w": [9999, 15, 9999, 22], "6m": [3000, 14, 9999, 22],
  };
  const t = T[`${o.N}${wall ? "w" : "m"}`] ?? T["2w"];
  return hmm <= t[0] ? t[1] : t[3];
};
const euroBead = (o: { glass?: number }) => (Number(o.glass ?? 6) <= 12 ? "F7935" : "F7949"); // มู่ลี่ = F7853 (เลือกมือ)

export const EURO_BIFOLD: CutSpec = {
  id: "euro_bifold",
  name: "เฟี้ยมยูโร 45° (Bi-Fold)",
  stockLen: 640,
  rails: ["เฟรมล่าง", "รางยู"],
  opts: [
    { key: "L", label: "พับซ้าย (บาน)", type: "number" },
    { key: "glass", label: "กระจก (มม.)", type: "number" },
  ],
  defaults: { W: 249.5, H: 210, N: 4, L: 2, rail: "เฟรมล่าง", honk: false, glass: 6 },
  profiles: [
    { name: "เฟรมบนบานเฟี้ยม", code: "F7968", len: (o) => o.W - 3.6, qty: () => 1 },
    { name: "เฟรมล่าง/รางยู", code: (o) => (eIsU(o.rail) ? "F7932" : "F7969"), len: (o) => o.W - 3.6, qty: () => 1 },
    { name: "เฟรมข้างบานเฟี้ยม", code: "F7970", len: (o) => o.H, qty: () => 2 },
    { name: "คิ้วตบเฟรมข้าง", code: "F7971", len: (o) => o.H - 7.5 - (eIsU(o.rail) ? 0 : 4.5), qty: () => 2 },
    { name: "ตบปิดเฟรม (ตั้ง)", code: "F7973", len: (o) => o.H - 7.5 - (eIsU(o.rail) ? 0 : 4.5), qty: () => 2 },
    { name: "ตบปิดเฟรม (นอน)", code: "F7973", len: (o) => o.W - 4, qty: (o) => (eIsU(o.rail) ? 1 : 2) },
    { name: "กรอบบานเฟี้ยม (ตั้ง)", code: "F7972", len: euroSashH, qty: (o) => 2 * o.N },
    { name: "กรอบบานเฟี้ยม (ขวาง 45°)", code: "F7972", len: euroSashW, qty: (o) => 2 * o.N },
    { name: "ชนกลางบานคู่", code: "F7974", len: euroSashH, qty: (o) => euroCase(o).mid },
    { name: "บังใบ", code: "F7975", len: euroSashH, qty: (o) => euroCase(o).stop },
    { name: "รับล็อคเฟรมข้างบานคู่", code: "F7961", len: (o) => o.H - 5.5 - 2.5, qty: (o) => euroCase(o).lockJamb },
    { name: "รับล็อคบานคู่+บานคี่", code: "F7962", len: euroSashH, qty: (o) => euroCase(o).lockPair },
    { name: "คิ้วกระจก (ตั้ง)", code: euroBead, len: (o) => euroSashH(o) - 16, qty: (o) => 2 * o.N },
    { name: "คิ้วกระจก (นอน)", code: euroBead, len: (o) => euroSashW(o) - 12, qty: (o) => 2 * o.N },
  ],
  // อุปกรณ์ตามไฟล์ตัดประกอบ ⑤ (JR_เฟี้ยมยูโร.xlsx) — ชุดเดียวกับคิดราคา 4.0
  hardware: [
    { name: "HD-640 บานพับล้อบน", sku: "HD-640", qty: () => 1, unit: "ตัว" },
    { name: "HD-641 บานพับเฟี้ยม", sku: "HD-641", qty: euroHinge, unit: "ตัว" },
    { name: "HD-642 บานพับมือจับ", sku: "HD-642", qty: () => 1, unit: "ตัว" },
    { name: "HD-643 บานพับไกด์ล่าง", sku: "HD-643", qty: () => 1, unit: "ตัว" },
    { name: "HD-474 มือจับกลอน", sku: "JR00213", qty: () => 1, unit: "ตัว" },
    { name: "HD-312 ตลับกลอนล็อค", sku: "HD-312", qty: () => 1, unit: "ตัว" },
    { name: "HD-1180 ก้านสไลด์", sku: "HD-1180", qty: () => 2, unit: "ตัว" },
    { name: "HD-213 ฉากเข้ามุม", sku: "HD-213", qty: (o) => 4 * o.N, unit: "ตัว" },
    { name: "HD-200 ฉากประคองมุม", sku: "HD-200", qty: (o) => 12 * o.N, unit: "ตัว" },
    // ยาง/สักหลาด — สูตรชุดเดียวกับคิดราคา 4.0 · รหัสยางเจ้าของให้ 28 ส.ค.69 (อัด JR00768 · รอง JR00769 · ลูกโป่ง JR00770)
    // ⚠ คิดเป็น มม. แล้ว ÷1000 — ต้องปัดเศษลำดับเดียวกับฝั่งคิดราคา ไม่งั้นต่างกัน 0.1 ม.
    { name: "ยางลูกโป่ง 6mm", sku: "JR00770", qty: (o) => Math.round(((o.W * 10 - 36) * 2 + o.H * 10 + (o.H * 10 - 120) * 2
      + (o.H * 10 - 94) * (2 * o.N) * 2 + (o.H * 10 - 94) * (2 * o.N) * 2 + euroSashW(o) * 10 * 3 + (o.H * 10 - 80)) / 1000 * 10) / 10, unit: "ม." },
    { name: "สักหลาด 5mm", qty: (o) => Math.round(((o.H * 10 - 94) * 2 + (o.H * 10 - 80) * 2) / 1000 * 10) / 10, unit: "ม." },
    { name: "ยางอัด", sku: "JR00768", qty: (o) => Math.round(((o.H * 10 - 224) + (euroSashW(o) * 10 - 130)) * 2 * o.N / 1000 * 10) / 10, unit: "ม." },
    { name: "ยางรอง", sku: "JR00769", qty: (o) => Math.round(((o.H * 10 - 224) + (euroSashW(o) * 10 - 130)) * 2 * o.N / 1000 * 10) / 10, unit: "ม." },
  ],
  // กระจก: (ขวาง−13มม.)×(สูงบาน−1.3ซม.) × N แผ่น ตามไฟล์
};

// ═══ เฟี้ยมยูโร CORNER (เข้ามุม 2 ผนัง) — JR_เฟี้ยมยูโร.xlsx sheet CORNER (6 sheet ตรวจครบ) ═══
// โครงต่างจากบานเดี่ยว: แต่ละผนังมี W/จำนวนบานของตัวเอง (WA/nA, WB/nB) → ใช้ opts ไม่ใช้ W/N ในจอ
// ขวาง 45° ต่อด้าน = (W − 1.8 − 0.95 − 0.8×(n−1) − OFFSET)/n · OFFSET: ปิด=6.2 · เปิด n คู่=10.2/คี่=7.7
// นิยาม "ฝั่งเปิด" กายภาพ (ช่างมองด้านไหนเปิด) — ทำเป็น toggle openSide ตามดรอปดาว H4/H6 ในไฟล์ (คณิตยืนยันตรงเลขตรวจทาน · label ฝั่งควรยืนยันหน้างาน)
const cIsU = (r: string) => r === "รางยู";
const cornerBead = (g: number) => (g < 0 ? "F7853" : g <= 12 ? "F7935" : "F7949");
const cornerSashW = (W: number, n: number, open: boolean) => {
  const off = !open ? 6.2 : (n % 2 === 0 ? 10.2 : 7.7);
  return (W - 1.8 - 0.95 - 0.8 * (n - 1) - off) / n;
};
type CornerCase = { mid: number; cornerLock: number; stop: number };
const cornerCase = (nA: number, nB: number): CornerCase => {
  const eA = nA % 2 === 0, eB = nB % 2 === 0;
  if (eA && eB) return { mid: 1, cornerLock: 1, stop: 0 };
  return { mid: 0, cornerLock: 0, stop: 2 };
};
// อ่านค่า corner จาก input (opts) — fallback default กันพัง
const CI = (o: CutInput) => ({
  WA: Number(o.WA) || 300, WB: Number(o.WB) || 300, H: o.H,
  nA: Math.max(1, Math.round(Number(o.nA) || 2)), nB: Math.max(1, Math.round(Number(o.nB) || 2)),
  openSide: String(o.openSide ?? "A"), u: cIsU(o.rail), glass: Number(o.glass ?? 6),
});
const cFramePost = (o: CutInput) => o.H - (CI(o).u ? 6.9 : 9.4);
const cSxA = (o: CutInput) => { const c = CI(o); return cornerSashW(c.WA, c.nA, c.openSide === "A"); };
const cSxB = (o: CutInput) => { const c = CI(o); return cornerSashW(c.WB, c.nB, c.openSide === "B"); };
const cBead = (o: CutInput) => cornerBead(CI(o).glass);

export const EURO_BIFOLD_CORNER: CutSpec = {
  id: "euro_bifold_corner",
  name: "เฟี้ยมยูโร เข้ามุม (CORNER) — ใช้ผนัง A/B",
  stockLen: 640,
  rails: ["เฟรมล่าง", "รางยู"],
  opts: [
    { key: "WA", label: "กว้างผนัง A (ซม.)", type: "number" },
    { key: "WB", label: "กว้างผนัง B (ซม.)", type: "number" },
    { key: "nA", label: "บานฝั่ง A", type: "number" },
    { key: "nB", label: "บานฝั่ง B", type: "number" },
    { key: "openSide", label: "ฝั่งเปิดบาน", choices: ["A", "B"] },
    { key: "glass", label: "กระจก (มม.)", type: "number" },
  ],
  defaults: { W: 0, H: 260, N: 1, rail: "เฟรมล่าง", honk: false, WA: 300, WB: 300, nA: 2, nB: 2, openSide: "A", glass: 6 },
  profiles: [
    { name: "เฟรมบน A", code: "F7968", len: (o) => CI(o).WA - 1.8, qty: () => 1 },
    { name: "เฟรมบน B", code: "F7968", len: (o) => CI(o).WB - 1.8, qty: () => 1 },
    { name: "เฟรมล่าง/รางยู A", code: (o) => (CI(o).u ? "F7932" : "F7969"), len: (o) => CI(o).WA - 1.8, qty: () => 1 },
    { name: "เฟรมล่าง/รางยู B", code: (o) => (CI(o).u ? "F7932" : "F7969"), len: (o) => CI(o).WB - 1.8, qty: () => 1 },
    { name: "เฟรมข้าง", code: "F7970", len: (o) => o.H, qty: () => 2 },
    { name: "คิ้วตบเฟรมข้าง", code: "F7971", len: (o) => o.H - (CI(o).u ? 7.5 : 12), qty: () => 2 },
    { name: "ตบปิดเฟรม (ตั้ง)", code: "F7973", len: (o) => o.H - (CI(o).u ? 7.5 : 12), qty: () => 2 },
    { name: "ตบปิดเฟรม (นอน) A", code: "F7973", len: (o) => CI(o).WA - 7.6, qty: () => 2 },
    { name: "ตบปิดเฟรม (นอน) B", code: "F7973", len: (o) => CI(o).WB - 7.6, qty: () => 2 },
    { name: "กรอบตั้ง A", code: "F7972", len: cFramePost, qty: (o) => 2 * CI(o).nA },
    { name: "กรอบตั้ง B", code: "F7972", len: cFramePost, qty: (o) => 2 * CI(o).nB },
    { name: "กรอบขวาง 45° A", code: "F7972", len: cSxA, qty: (o) => 2 * CI(o).nA },
    { name: "กรอบขวาง 45° B", code: "F7972", len: cSxB, qty: (o) => 2 * CI(o).nB },
    { name: "ชนกลางบานคู่", code: "F7974", len: (o) => cFramePost(o) + 0.4, qty: (o) => cornerCase(CI(o).nA, CI(o).nB).mid },
    { name: "รับล็อคเสาเข้ามุมบานคู่", code: "F7963", len: (o) => cFramePost(o) + 0.4, qty: (o) => cornerCase(CI(o).nA, CI(o).nB).cornerLock },
    { name: "เสาเข้ามุม", code: "F7964", len: (o) => cFramePost(o) + 0.4, qty: () => 1 },
    { name: "บังใบ", code: "F7975", len: (o) => cFramePost(o) + 0.4, qty: (o) => cornerCase(CI(o).nA, CI(o).nB).stop },
    { name: "คิ้วกระจก (ตั้ง)", code: cBead, len: (o) => cFramePost(o) - 16, qty: (o) => 2 * (CI(o).nA + CI(o).nB) },
    { name: "คิ้วกระจก (นอน) A", code: cBead, len: (o) => cSxA(o) - 12, qty: (o) => 2 * CI(o).nA },
    { name: "คิ้วกระจก (นอน) B", code: cBead, len: (o) => cSxB(o) - 12, qty: (o) => 2 * CI(o).nB },
  ],
};

// ═══════════════════════ FUJI (ไฟล์ มม. → พอร์ต ซม. ÷10 · รหัส F####/B####) ═══════════════════════
// ⑨ FUJI บานเลื่อนสลับ 2/3 ราง (JR_FUJI_บานเลื่อน.xlsx) — ราง = เลือกชีต · qty สเกลตามราง
const FUJI_RC: Record<string, { p: number; sd: number; sa: number; hook: number }> = {
  "2ราง": { p: 2, sd: 4.92, sa: 3.9, hook: 2 },
  "3ราง": { p: 3, sd: 5.04, sa: 5.2, hook: 4 },
};
const frc = (o: CutInput) => FUJI_RC[o.rail] ?? FUJI_RC["2ราง"];
const fSash = (o: CutInput) => (o.W - frc(o).sd) / frc(o).p + frc(o).sa; // ขวาง (ซม.)
// งานใน (รางเตี้ย) = ชีต "เลื่อนสลับ ภายใน" / "เลื่อน3ราง ภายใน" — เฟรมล่างเปลี่ยนเป็น F7902 ตัวเตี้ย
//   ⚠ ค่าหักทั้งหมดอ่านจากคอลัมน์ E–K ของ "แผงแก้สูตร" (คอลัมน์ D คือ "สูตรตัด (เดิม)" ของเก่า)
const fIn = (o: CutInput) => String((o as unknown as { work?: string }).work ?? "") === "ภายใน";
const fPost = (o: CutInput) => o.H - (fIn(o) ? 4.8 : 7.4);   // "สูงกรอบบาน" — เสา/ตบเกี่ยว/ปิดตบเกี่ยว ใช้ค่านี้
const fU = (o: CutInput) => o.H - (fIn(o) ? 5.3 : 9.0);      // ยูข้าง/ตบยูข้าง
// คิ้วกระจก เลือกตามความหนากระจก (เจ้าของยืนยัน 20 ส.ค.69) — หน้าที่เดียวกัน คนละกรณี
//   F7919 = กระจก 6-13 มม. · F7917 = กระจก 13-15 มม.
const fBead = (o: CutInput) => ((Number(o.glass) || 6) > 13 ? "F7917" : "F7919");
// ⚠ ใช้เฟรม "3 ราง" (F7976 บน-ล่าง · F7978 ข้าง) เป็นหลักทั้ง 2 และ 3 บาน — เจ้าของเคาะ 20 ส.ค.69
//   ไฟล์มีชีต "เลื่อนสลับ2ราง" ที่ใช้ F7977/F7979 อยู่ด้วย แต่ไม่เอาเข้าระบบ (กันเลือกผิด)
export const FUJI_SLIDE: CutSpec = {
  id: "fuji_slide", name: "FUJI บานเลื่อนสลับ (2/3 บาน · นอก/ใน)", stockLen: 640,
  rails: ["2ราง", "3ราง"],
  opts: [{ key: "work", label: "งาน", choices: ["ภายนอก", "ภายใน"] }, ...HANDLE_OPTS_LR],
  defaults: { W: 350, H: 240, N: 2, rail: "2ราง", honk: false, work: "ภายนอก", handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" },
  profiles: [
    { name: "เฟรมข้าง", code: "F7978", len: (o) => o.H, qty: () => 2 },
    // งานนอก = F7976 บน+ล่าง 2 เส้น · งานใน = บน F7976 1 เส้น + ล่าง F7902 (ตัวเตี้ย) 1 เส้น
    // F7869 ตัวหนา — เจ้าของเคาะ 20 ส.ค.69 ให้ใช้กับ รางบน + รางล่างกันน้ำ ทุกรูปแบบการเลื่อน
    //   ⚠ ไฟล์ Excel ใบตัดเขียน F7976 (ตัวปกติ) — เว็บยึด F7869 ตามที่เจ้าของสั่ง
    { name: "เฟรม บน-ล่าง", code: "F7869", len: (o) => o.W - 4.2, qty: (o) => (fIn(o) ? 1 : 2), note: "งานใน = เฉพาะเฟรมบน" },
    { name: "เฟรมล่าง (งานใน)", code: "F7902", len: (o) => o.W - 4.2, qty: (o) => (fIn(o) ? 1 : 0) },
    { name: "ตบกันสาด", code: "F7992", len: (o) => o.W, qty: (o) => (fIn(o) ? 0 : 1), note: "งานในไม่มีกันสาด" },
    { name: "เสา", code: "F7980", len: fPost, qty: (o) => 2 * frc(o).p },
    { name: "ขวาง", code: "F7980", len: fSash, qty: (o) => 2 * frc(o).p, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: fBead, len: (o) => fPost(o) - 15.6, qty: (o) => 2 * frc(o).p },
    { name: "คิ้ว ขวาง", code: fBead, len: (o) => fSash(o) - 12.6, qty: (o) => 2 * frc(o).p, note: "อลูเดียวกับคิ้วตั้ง" },
    { name: "ตบเกี่ยว", code: "F7983", len: fPost, qty: (o) => frc(o).hook },
    // เสารับแรง — ไฟล์ Excel ไม่ได้ใส่มา แต่ของจริงต้องมี (เจ้าของเช็คหน้างานยืนยัน 20 ส.ค.69)
    //   สูงเกิน 2.6 ม. ใส่เพิ่ม "ผสมกับ" ตบเกี่ยว (ไม่ใช่แทนกัน) · ตัดยาวเท่าตบเกี่ยว จำนวนเท่ากัน
    //   หลักการเดียวกับ SMS (เสาเกี่ยวรับแรง B20010) · คิดราคา 4.0 ใช้เกณฑ์เดียวกัน
    { name: "เสารับแรง", code: "F7951", len: fPost, qty: (o) => (o.H > 260 ? frc(o).hook : 0), note: "ไฟล์ตัดประกอบไม่มี — เจ้าของสั่งเพิ่ม · สูงเกิน 2.6 ม. · ยาวเท่าตบเกี่ยว" },
    { name: "ยูข้าง", code: "F7986", len: fU, qty: () => 2 },
    { name: "ตบเฟรมบน", code: "F7993", len: (o) => o.W - 4.2, qty: () => 3, stockLens: [500] },
    { name: "ตบยูข้าง", code: "F7988", len: fU, qty: () => 2 },
    // F7988 ใช้ 4 หน้าที่ (เจ้าของยืนยัน 20 ส.ค.69): ตบยูข้าง · ปิดตบเกี่ยว · ตบกันสาด#2 · ปิดรับล็อค
    { name: "ปิดตบเกี่ยว", code: "F7988", len: fPost, qty: (o) => (fIn(o) ? 4 : frc(o).hook) },
    { name: "ตบกันสาด#2", code: "F7988", len: (o) => o.W, qty: (o) => (fIn(o) ? 0 : 1) },
    { name: "ราง", code: "F7994", len: (o) => o.W - 4.2, qty: () => 3, stockLens: [500] },
  ],
  // ⑤ อุปกรณ์ FUJI เลื่อน (มี SKU ในไฟล์ คอลัมน์ AK-AY · ใช้ตาราง lookup มือจับเดียวกับ SMS)
  //   สปส.บาน = frc(o).p (ไฟล์ตั้ง 2 สำหรับ 2ราง — สเกลตาม p ให้ 3ราง)
  hardware: [
    { name: "ล้อ-15x20x230", sku: "JR00577", qty: (o) => 2 * frc(o).p, unit: "ตัว" },
    ...handleHardware("LR"),
    { name: "สปิงก็อท", sku: "JR00592", qty: (o) => 4 * frc(o).p, unit: "ตัว" },
    { name: "ฉากประกอบมุม", sku: "JR00480", qty: (o) => 12 * frc(o).p, unit: "ตัว" },
    { name: "ยางรูน้ำ", sku: "JR00589", qty: (o) => 2 + Math.max(0, Math.ceil((o.W - 4.2 - 150) / 50)), unit: "อัน" },
    { name: "วาวรูน้ำ", sku: "JR00485", qty: (o) => 2 + Math.max(0, Math.ceil((o.W - 4.2 - 150) / 50)), unit: "อัน" },
    { name: "สักหลาด (ม.)", sku: "JR00794", unit: "ม.", noStock: true, note: "สะสมม้วน",
      qty: (o, ctx) => Math.round((2 * 2 * (ctx.len("ขวาง") + ctx.len("เสา")) * frc(o).p + ctx.len("ตบเกี่ยว") * frc(o).hook) / 100 * 10) / 10 },
    ...fujiSlideConsum(),
  ],
};

// วัสดุสิ้นเปลืองที่ไฟล์ใบตัดไม่ได้แตกไว้ แต่คิดราคา 4.0 คิดเงินอยู่ (ต้องมีทั้งสองฝั่ง ไม่งั้นค่าของหาย)
//   สูตรเดียวกับชีตคิดทุน ยูโร: น็อต 8+4×บาน · ซิลิโคน เส้นรอบรูป ×2 ÷ 12.5 ม./หลอด
function fujiSlideConsum(panels: (o: CutInput) => number = (o) => frc(o).p): HardwareDef[] {
  return [
    { name: "น็อต 1\" (ประกอบบาน+เฟรม)", sku: "JR00864", qty: (o) => 8 + 4 * panels(o), unit: "ตัว" },
    { name: "ซิลิโคน ใน+นอก", sku: "JR00504", qty: (o) => Math.ceil(((2 * (o.W + o.H)) / 100) * 2 / 12.5), unit: "หลอด" },
  ];
}

// ⑨b FUJI บานเลื่อนเปิดคู่กลาง (ชีต "เลื่อนแบ่ง4" · "เลื่อนแบ่ง6-กลาง") — บานคู่แยกกลาง
//   4 บาน = งานนอก (เฟรม F7976 · คิ้ว F7917 · เสาหัก 7.4) · 6 บาน = งานใน (เฟรม F7902 · คิ้ว F7919 · เสาหัก 4.8)
//   ทั้งสองชีตมี "เฟรม ล่าง F7925 (ต่อชนกลาง)" 1 เส้น + "ปิดรับล็อค" 1 เส้น (รหัสเปล่าในไฟล์)
const FUJI_CTR: Record<number, { sd: number; sa: number; post: number; u: number; hook: number; rail: number }> = {
  4: { sd: 4.89, sa: 3.9, post: 7.4, u: 9.0, hook: 4, rail: 2 },
  6: { sd: 5.1, sa: 5.2, post: 4.8, u: 5.3, hook: 8, rail: 3 },
};
const fc = (o: CutInput) => FUJI_CTR[o.N] ?? FUJI_CTR[4];
const fcPost = (o: CutInput) => o.H - fc(o).post;
const fcSash = (o: CutInput) => (o.W - fc(o).sd) / o.N + fc(o).sa;
export const FUJI_SLIDE_CENTER: CutSpec = {
  id: "fuji_slide_center", name: "FUJI บานเลื่อนเปิดคู่กลาง (4 / 6 บาน · นอก/ใน)", stockLen: 640, rails: [],
  opts: [{ key: "work", label: "งาน", choices: ["ภายนอก", "ภายใน"] }, ...HANDLE_OPTS_LR],
  defaults: { W: 600, H: 240, N: 4, work: "ภายนอก", handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" },
  profiles: [
    { name: "เฟรมข้าง", code: "F7978", len: (o) => o.H, qty: () => 2 },
    // เฟรมบน = F7976 เสมอ · เฟรมล่าง: งานนอก F7976 (ธรณีกันน้ำ) · งานใน F7902 (ตัวเตี้ย)
    //   ⚠ ห้ามเอามารวมกัน — บานเลื่อนต้องเลือกได้ว่าใช้ภายนอกหรือภายใน (เจ้าของย้ำ 20 ส.ค.69)
    { name: "เฟรมบน", code: "F7869", len: (o) => o.W - 4.2, qty: () => 1 },
    { name: "เฟรมล่างกันน้ำ (งานนอก)", code: "F7869", len: (o) => o.W - 4.2, qty: (o) => (fIn(o) ? 0 : 1) },
    { name: "เฟรมล่าง (งานใน)", code: "F7902", len: (o) => o.W - 4.2, qty: (o) => (fIn(o) ? 1 : 0) },
    { name: "เสา", code: "F7980", len: fcPost, qty: (o) => 2 * o.N },
    { name: "ขวาง", code: "F7980", len: fcSash, qty: (o) => 2 * o.N, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: fBead, len: (o) => fcPost(o) - 15.6, qty: (o) => 2 * o.N },
    { name: "คิ้ว ขวาง", code: fBead, len: (o) => fcSash(o) - 12.6, qty: (o) => 2 * o.N, note: "อลูเดียวกับคิ้วตั้ง" },
    // ชนกลาง เลือกตามความสูง (เจ้าของยืนยัน 20 ส.ค.69) — ไม่เกิน 2.8 ม. ใช้ต่อชนกลาง · เกินนั้นใช้ตัวรับแรง
    { name: "ต่อชนกลาง (ไม่เกิน 2.8 ม.)", code: "F7925", len: fcPost, qty: (o) => (o.H <= 280 ? 1 : 0) },
    { name: "ชนกลางรับแรง (เกิน 2.8 ม.)", code: "F7855", len: fcPost, qty: (o) => (o.H > 280 ? 1 : 0) },
    { name: "ตบเกี่ยว", code: "F7983", len: fcPost, qty: (o) => fc(o).hook },
    { name: "เสารับแรง", code: "F7951", len: fcPost, qty: (o) => (o.H > 260 ? fc(o).hook : 0), note: "ไฟล์ตัดประกอบไม่มี — เจ้าของสั่งเพิ่ม · สูงเกิน 2.6 ม." },
    { name: "ยูข้าง", code: "F7986", len: (o) => o.H - fc(o).u, qty: () => 2 },
    { name: "ตบเฟรมบน", code: "F7993", len: (o) => o.W - 4.2, qty: () => 3, stockLens: [500] },
    { name: "ปิดตบเกี่ยว", code: "F7988", len: fcPost, qty: (o) => fc(o).hook },
    { name: "ปิดรับล็อค", code: "F7988", len: fcPost, qty: () => 1 },
    // ตบกันสาด — งานใน (รางเตี้ย) ไม่ใช้ (เจ้าของเคาะ 20 ส.ค.69)
    { name: "ปิดตบกันสาด", code: "F7988", len: (o) => o.W, qty: (o) => (fIn(o) ? 0 : 1) },
    { name: "รางเลื่อน", code: "F7994", len: (o) => o.W - 4.2, qty: (o) => fc(o).rail, stockLens: [500] },
    { name: "ตบกันสาด", code: "F7992", len: (o) => o.W, qty: (o) => (fIn(o) ? 0 : 1) },
  ],
  hardware: [
    { name: "ล้อ-15x20x230", sku: "JR00577", qty: (o) => 2 * o.N, unit: "ตัว" },
    ...handleHardware("LR"),
    { name: "สปิงก็อท", sku: "JR00592", qty: (o) => 4 * o.N, unit: "ตัว" },
    { name: "ฉากประกอบมุม", sku: "JR00480", qty: (o) => 12 * o.N, unit: "ตัว" },
    { name: "ยางรูน้ำ", sku: "JR00589", qty: (o) => 2 + Math.max(0, Math.ceil((o.W - 4.2 - 150) / 50)), unit: "อัน" },
    { name: "วาวรูน้ำ", sku: "JR00485", qty: (o) => 2 + Math.max(0, Math.ceil((o.W - 4.2 - 150) / 50)), unit: "อัน" },
    { name: "สักหลาด (ม.)", sku: "JR00794", unit: "ม.", noStock: true, note: "สะสมม้วน",
      qty: (o, ctx) => Math.round((2 * 2 * (ctx.len("ขวาง") + ctx.len("เสา")) * o.N + ctx.len("ตบเกี่ยว") * fc(o).hook) / 100 * 10) / 10 },
    ...fujiSlideConsum((o) => o.N),
  ],
};



// ⑨c FUJI บานเลื่อน 4 / 5 บาน (ชีต "เลื่อน4 (2)" · "เลื่อน5") — เฟรม 2 ชุดต่อกัน
//   4 บาน = 2 ราง + 2 ราง ต่อกัน (เฟรม 2 ราง F7977/F7979) · 5 บาน = 3 ราง + 2 ราง (เฟรม 3 ราง F7976)
//   ที่เพิ่มจากรุ่น 2/3 บาน: ต่อเฟรมข้าง F7989 · ต่อราง F7990 (ตัวต่อระหว่างเฟรม 2 ชุด)
//   ⚠ ทุกตัวเลขอ่านจากแผงแก้สูตรในไฟล์ตรง ๆ (คอลัมน์ E–K = ค่าหัก · L = จำนวน/ชุด)
const FUJI_MULTI: Record<number, {
  sd: number; sa: number; side79: number; side78: number; joinSide: number;
  topFrame: string; joinRail: number; awning: number; hook: number; topCap: number; rail: number;
}> = {
  // เลื่อน4 (2): ขวาง = ((กว้าง−21−1−1−3.6−21)/4)+(78×3/4) → หักรวม 4.76 ซม. · บวก 5.85 ซม.
  4: { sd: 4.76, sa: 5.85, side79: 4, side78: 0, joinSide: 2, topFrame: "F7977", joinRail: 4, awning: 2, hook: 6, topCap: 4, rail: 4 },
  // เลื่อน5: ขวาง = ((กว้าง−21−3−3−4.8−21)/5)+(78×4/5) → หักรวม 5.28 ซม. · บวก 6.24 ซม.
  5: { sd: 5.28, sa: 6.24, side79: 2, side78: 2, joinSide: 2, topFrame: "F7976", joinRail: 4, awning: 1, hook: 8, topCap: 5, rail: 5 },
};
const fm = (o: CutInput) => FUJI_MULTI[o.N] ?? FUJI_MULTI[4];
const fmPost = (o: CutInput) => o.H - 7.4;                       // "สูงกรอบบาน"
const fmSash = (o: CutInput) => (o.W - fm(o).sd) / o.N + fm(o).sa;
export const FUJI_SLIDE_MULTI: CutSpec = {
  id: "fuji_slide_multi", name: "FUJI บานเลื่อน 4 / 5 บาน (เฟรมต่อ)", stockLen: 640, rails: [],
  opts: [...HANDLE_OPTS_LR],
  defaults: { W: 800, H: 240, N: 4, handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" },
  profiles: [
    { name: "เฟรมข้าง (2 ราง)", code: "F7979", len: (o) => o.H, qty: (o) => fm(o).side79 },
    { name: "เฟรมข้าง (3 ราง)", code: "F7978", len: (o) => o.H, qty: (o) => fm(o).side78 },
    { name: "ต่อเฟรมข้าง", code: "F7989", len: (o) => o.H, qty: (o) => fm(o).joinSide },
    // เฟรมบน + รางล่างกันน้ำ = F7869 ตัวหนา ทุกรูปแบบการเลื่อน (เจ้าของสั่ง 20 ส.ค.69 · ทับไฟล์ที่เขียน F7977/F7976)
    { name: "เฟรม บน-ล่าง", code: "F7869", len: (o) => o.W - 4.2, qty: () => 2 },
    { name: "ต่อราง", code: "F7990", len: (o) => o.W - 4.2, qty: (o) => fm(o).joinRail },
    { name: "ตบกันสาด", code: "F7992", len: (o) => o.W, qty: (o) => fm(o).awning },
    { name: "เสา", code: "F7980", len: fmPost, qty: (o) => 2 * o.N },
    { name: "ขวาง", code: "F7980", len: fmSash, qty: (o) => 2 * o.N, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: fBead, len: (o) => fmPost(o) - 15.6, qty: (o) => 2 * o.N },
    { name: "คิ้ว ขวาง", code: fBead, len: (o) => fmSash(o) - 12.6, qty: (o) => 2 * o.N, note: "อลูเดียวกับคิ้วตั้ง" },
    { name: "ตบเกี่ยว", code: "F7983", len: fmPost, qty: (o) => fm(o).hook },
    // เสารับแรง — ไฟล์ตัดประกอบไม่มี · เจ้าของสั่งเพิ่ม (สูงเกิน 2.6 ม. · ยาว/จำนวนเท่าตบเกี่ยว)
    { name: "เสารับแรง", code: "F7951", len: fmPost, qty: (o) => (o.H > 260 ? fm(o).hook : 0), note: "ไฟล์ตัดประกอบไม่มี — เจ้าของสั่งเพิ่ม" },
    { name: "ยูข้าง", code: "F7986", len: (o) => o.H - 9.0, qty: () => 2 },
    { name: "ตบเฟรมบน", code: "F7993", len: (o) => o.W - 4.2, qty: (o) => fm(o).topCap, stockLens: [500] },
    { name: "ตบยูข้าง", code: "F7988", len: (o) => o.H - 9.0, qty: () => 2 },
    { name: "ราง", code: "F7994", len: (o) => o.W - 4.2, qty: (o) => fm(o).rail, stockLens: [500] },
  ],
  hardware: [
    { name: "ล้อ-15x20x230", sku: "JR00577", qty: (o) => 2 * o.N, unit: "ตัว" },
    ...handleHardware("LR"),
    { name: "สปิงก็อท", sku: "JR00592", qty: (o) => 4 * o.N, unit: "ตัว" },
    { name: "ฉากประกอบมุม", sku: "JR00480", qty: (o) => 12 * o.N, unit: "ตัว" },
    { name: "ยางรูน้ำ", sku: "JR00589", qty: (o) => 2 + Math.max(0, Math.ceil((o.W - 4.2 - 150) / 50)), unit: "อัน" },
    { name: "วาวรูน้ำ", sku: "JR00485", qty: (o) => 2 + Math.max(0, Math.ceil((o.W - 4.2 - 150) / 50)), unit: "อัน" },
    { name: "สักหลาด (ม.)", sku: "JR00794", unit: "ม.", noStock: true, note: "สะสมม้วน",
      qty: (o, ctx) => Math.round((2 * 2 * (ctx.len("ขวาง") + ctx.len("เสา")) * o.N + ctx.len("ตบเกี่ยว") * fm(o).hook) / 100 * 10) / 10 },
    ...fujiSlideConsum((o) => o.N),
  ],
};

/**
 * ⑩ FUJI บานเปิด/กระทุ้ง (casement · JR_FUJI_บานเปิด-บานกระทุ้ง v2.xlsx — เทียบทุกเส้นกับชีทจริง "FUJI บานเปิด")
 * v2 เปลี่ยน 3 อย่าง (เจ้าของยืนยัน มุ้ง/กันสาด = ตัวเลือก ใส่/ไม่ใส่):
 *   1) รหัสเฟรมข้าง/เฟรมบน ผูกกับมุ้ง (2 sheet แยกกันจริงในไฟล์): ไม่ใส่มุ้ง = F7859 (sheet "FUJI บานเปิด") · ใส่มุ้ง = F7938 (sheet "FUJI บานเปิด+มุ้ง")
 *   2) เพิ่ม opt "มุ้ง" → ใส่ = เสามุ้ง F7944 + ขวางมุ้ง(อลูเดียวกัน) + คิ้วมุ้ง ตั้ง/ขวาง F7949 (ยาวเท่า เสา/ขวาง/คิ้วตั้ง/คิ้วขวาง เดิมทุกเส้น)
 *   3) เพิ่ม opt "กันสาด" → ใส่ = กันสาด F7948 ยาว=W (มม.) qty 1
 * เส้นเดิม 7 เส้น (เฟรมข้าง/บน/ล่าง/เสา/ขวาง/คิ้วตั้ง/คิ้วขวาง) สูตรความยาวตรงกับไฟล์ v2 เป๊ะ (ไม่เปลี่ยน) — เทียบละเอียดในรายงาน PR
 */
export const FUJI_SWING: CutSpec = {
  id: "fuji_swing", name: "FUJI บานเปิด (เปิด/กระทุ้ง)", stockLen: 640, rails: [],
  opts: [
    { key: "mesh", label: "มุ้ง", choices: ["ไม่ใส่", "ใส่"] },
    { key: "awning", label: "กันสาด", choices: ["ไม่ใส่", "ใส่"] },
    { key: "winHandleColor", label: "สีมือจับ", choices: ["อบขาว", "ดำ"] },
    { key: "winHandleSide", label: "มือจับ ด้าน", choices: ["ซ้าย", "ขวา"] },
  ],
  defaults: { W: 80, H: 140, N: 1, rail: "", honk: false, mesh: "ไม่ใส่", awning: "ไม่ใส่", winHandleColor: "อบขาว", winHandleSide: "ซ้าย" },
  profiles: [
    // รหัสผูกกับมุ้ง: ไม่ใส่=F7859 (sheet เดิม) · ใส่=F7938 (sheet +มุ้ง) — ยาวเท่าเดิมทั้ง 2 กรณี
    { name: "เฟรมข้าง", code: (o) => (o.mesh === "ใส่" ? "F7938" : "F7859"), len: (o) => o.H, qty: () => 2 },
    { name: "เฟรม บน", code: (o) => (o.mesh === "ใส่" ? "F7938" : "F7859"), len: (o) => o.W - 5.0, qty: () => 1, note: "อลูเดียวกับเฟรมข้าง" },
    { name: "เฟรม ล่าง", code: "F7939", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "เสา", code: "F7943", len: (o) => o.H - 3.7, qty: () => 2 },
    { name: "ขวาง", code: "F7943", len: (o) => o.W - 3.7, qty: () => 2, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: "F7935", len: (o) => o.H - 3.7 - 16.0, qty: () => 2 },
    { name: "คิ้ว ขวาง", code: "F7935", len: (o) => o.W - 3.7 - 12.0, qty: () => 2, note: "อลูเดียวกับคิ้วตั้ง" },
    // ตัวเลือก "มุ้ง" — ยาวเท่า เสา/ขวาง/คิ้วตั้ง/คิ้วขวาง ทุกเส้น (Excel v2 FUJI บานเปิด+มุ้ง R60-63)
    { name: "เสามุ้ง", code: "F7944", len: (o) => o.H - 3.7, qty: (o) => (o.mesh === "ใส่" ? 2 : 0), note: "ยาวเท่าเสา" },
    { name: "ขวางมุ้ง", code: "F7944", len: (o) => o.W - 3.7, qty: (o) => (o.mesh === "ใส่" ? 2 : 0), note: "อลูเดียวกับเสามุ้ง · ยาวเท่าขวาง" },
    { name: "คิ้วมุ้ง ตั้ง", code: "F7949", len: (o) => o.H - 3.7 - 16.0, qty: (o) => (o.mesh === "ใส่" ? 2 : 0), note: "ยาวเท่าคิ้วตั้ง" },
    { name: "คิ้วมุ้ง ขวาง", code: "F7949", len: (o) => o.W - 3.7 - 12.0, qty: (o) => (o.mesh === "ใส่" ? 2 : 0), note: "อลูเดียวกับคิ้วมุ้งตั้ง · ยาวเท่าคิ้วขวาง" },
    // ตัวเลือก "กันสาด"
    { name: "กันสาด", code: "F7948", len: (o) => o.W, qty: (o) => (o.awning === "ใส่" ? 1 : 0) },
  ],
  // ⑤ อุปกรณ์ FUJI_SWING (ชุดเฉพาะตัว — ไม่ใช่ชุดประตู) — มุ้ง/กันสาด ไม่มีฮาร์ดแวร์เพิ่ม (ไฟล์ v2 ไม่มีรายการ)
  hardware: fujiSwingHardware(),
};

// ⑪ FUJI ประตูเดี่ยว มีธรณี (dropdown เสา 10/8 ซม.)
export const FUJI_DOOR: CutSpec = {
  id: "fuji_door", name: "FUJI ประตูเดี่ยว มีธรณี", stockLen: 640, rails: [],
  opts: [{ key: "box", label: "เสา", choices: ["10 cm · 7864", "8 cm · 7943B"] }, ...SWING_DOOR_OPTS],
  defaults: { W: 90, H: 210, N: 1, rail: "", honk: false, box: "10 cm · 7864", ...SWING_DOOR_DEF },
  profiles: [
    { name: "เฟรมข้าง", code: "F7859", len: (o) => o.H, qty: () => 2 },
    { name: "เฟรม บน", code: "F7859", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "เฟรม ล่าง", code: "F7938", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "เสา", code: (o) => (o.box === "8 cm · 7943B" ? "7943B" : "7864"), len: (o) => o.H - 3.7, qty: () => 2 },
    { name: "ขวาง", code: (o) => (o.box === "8 cm · 7943B" ? "7943B" : "7864"), len: (o) => o.W - 3.7, qty: () => 2, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: "F7935", len: (o) => o.H - 3.7 - (o.box === "8 cm · 7943B" ? 16.0 : 20.0), qty: () => 2 },
    { name: "คิ้ว ขวาง", code: "F7935", len: (o) => o.W - 3.7 - (o.box === "8 cm · 7943B" ? 12.0 : 16.0), qty: () => 2 },
    { name: "ตบธรณี", code: "F7960", len: (o) => o.W - 5.0, qty: () => 1 },
  ],
  // ⑤ อุปกรณ์ FUJI ประตูเดี่ยว (SKU ชุดเดียวกับบานโซลิด · มีธรณี → น็อต 8)
  hardware: casementDoorHardware(() => true),
};

// ⑫ FUJI บานติดตาย (Fix)
export const FUJI_FIX: CutSpec = {
  id: "fuji_fix", name: "FUJI บานติดตาย (Fix)", stockLen: 640, rails: [],
  defaults: { W: 180, H: 200, N: 1, rail: "", honk: false },
  profiles: [
    { name: "เฟรมข้าง", code: "F7937", len: (o) => o.H, qty: () => 2 },
    { name: "เฟรม บน", code: "F7937", len: (o) => o.W - 5.0, qty: () => 1, note: "อลูเดียวกับเฟรมข้าง" },
    { name: "เฟรม-ล่าง", code: "F7858", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "คิ้ว ตั้ง", code: "F7935", len: (o) => o.H - 9.0, qty: () => 2 },
    { name: "คิ้ว ขวาง", code: "F7935", len: (o) => o.W - 5.0, qty: () => 2, note: "อลูเดียวกับคิ้วตั้ง" },
  ],
};

// ⑬ FUJI บานยก HUNG (JR_บานยก_ฟูจิ.xlsx sheet "JR คำนวณ" · ไฟล์เป็น ซม. อยู่แล้ว · รหัส B#### ผูกสต็อกได้)
// ⑤ อุปกรณ์ 24 รายการ (sheet "HUNG Takeoff"/"HUNG dies" · รหัสผู้ผลิต 06-xxx/02-xxx · คอลัมน์ "รหัส SKU JR" ว่างทั้งหมด → noStock ทุกตัว)
const HUNG_HANDLE_CODE: Record<string, string> = { "ดำ": "BL", "ขาว": "WH", "เทาซาฮาร่า": "GS", "มะฮอกกานี": "WMH" };
const hungHandleCode = (o: CutInput) => HUNG_HANDLE_CODE[o.hungHandleColor ?? "ดำ"] ?? "WGT";
export const FUJI_HUNG: CutSpec = {
  id: "fuji_hung", name: "FUJI บานยก (HUNG)", stockLen: 640, rails: [],
  opts: [
    { key: "hungHandleColor", label: "สีมือจับบานยก", choices: ["ดำ", "ขาว", "เทาซาฮาร่า", "มะฮอกกานี", "อื่นๆ (ลายไม้)"] },
    { key: "glass", label: "กระจก (มม.)", type: "number" },
  ],
  defaults: { W: 104.3, H: 288.8, N: 1, rail: "", honk: false, hungHandleColor: "ดำ", glass: 6 },
  profiles: [
    { name: "เฟรมบน (HEAD)", code: "B28009", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "ตบปิดเฟรมบน (COVER HEAD)", code: "B28010", len: (o) => o.W - 9.4, qty: () => 1 },
    { name: "กรอบบาน แนวนอน (SASH↔)", code: "B28011", len: (o) => o.W - 15.4, qty: () => 4 },
    { name: "กรอบบาน แนวตั้ง (SASH↕)", code: "B28011", len: (o) => (o.H - 4.6) / 2 - 0.1, qty: () => 4, note: "อลูเดียวกับ SASH↔" },
    { name: "คิ้วยึดเสาเกี่ยว (ADAPTOR)", code: "B28012", len: (o) => o.W - 13.2, qty: () => 2 },
    { name: "เสาเกี่ยว (INTERLOCK)", code: "B28013", len: (o) => o.W - 11.2, qty: () => 2 },
    { name: "เฟรมล่าง (SILL)", code: "B28014", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "เสาเสริมเฟรมข้าง (JAMB)", code: "B28015", len: (o) => o.H - 6.9, qty: () => 2 },
    { name: "เฟรมข้าง (NARROW FRAME)", code: "B10004", len: (o) => o.H, qty: () => 2 },
  ],
  hardware: [
    { name: "ไกด์ประคองกรอบบาน (06-003)", qty: () => 4, unit: "PCS", noStock: true },
    { name: "ตะขอเกี่ยวตลับเชือก (06-002)", qty: () => 4, unit: "PCS", noStock: true },
    { name: "ตลับล้อพูเล่ย์ (06-004)", qty: () => 2, unit: "PCS", noStock: true },
    { name: "ตลับใส่เชือก clutch (06-001)", qty: () => 4, unit: "PCS", noStock: true },
    { name: "เชือกไนล่อน 6มม. ดำ (06-007)", qty: (o) => (30 * o.H - 337) / 1000, unit: "M", noStock: true, note: "ตามความสูง H — ไม่ปัดเศษ (ตรงไฟล์)" },
    { name: "ฝาปิดมุมกรอบบาน 90° (06-005)", qty: () => 8, unit: "PCS", noStock: true },
    { name: "ฝาปิดรูเสาเกี่ยว ซ้าย+ขวา (06-006)", qty: () => 2, unit: "Pair", noStock: true },
    { name: "ตัวเบรคบาน stopper (06-011)", qty: () => 2, unit: "PCS", noStock: true },
    { name: "ประเก็นกันน้ำเฟรมบน (06-012)", qty: () => 1, unit: "Pair", noStock: true },
    { name: "ประเก็นกันน้ำเฟรมล่าง (06-010)", qty: () => 1, unit: "Pair", noStock: true },
    { name: "ยางกันลมบานยก (06-013)", qty: () => 2, unit: "PCS", noStock: true },
    { name: (o) => `มือจับบานยก (06-008-${hungHandleCode(o)})`, qty: () => 1, unit: "PCS", noStock: true },
    { name: "ล็อคกลางบานยก latch (06-019)", qty: () => 1, unit: "PCS", noStock: true },
    { name: "ขอล็อคกลางบานยก keeper (06-020)", qty: () => 1, unit: "PCS", noStock: true },
    { name: "สกรูหัวจม #7x8 (06-014)", qty: () => 4, unit: "PCS", noStock: true },
    { name: "สกรูหัวจม #8x12 (06-015)", qty: () => 32, unit: "PCS", noStock: true },
    { name: "สกรูหัวนูน #8x10 (06-016)", qty: () => 8, unit: "PCS", noStock: true },
    { name: "สกรูหัวนูน #7x40 (06-017)", qty: () => 8, unit: "PCS", noStock: true },
    { name: "สกรูหัวนูน #8x38 (06-018)", qty: () => 8, unit: "PCS", noStock: true },
    { name: "สักหลาด 5มม. mohair (02-067)", unit: "M", noStock: true,
      qty: (o, ctx) => Math.ceil((4 * ctx.len("เสาเสริมเฟรมข้าง (JAMB)") + ctx.len("ตบปิดเฟรมบน (COVER HEAD)") + ctx.len("เฟรมล่าง (SILL)") + 2 * ctx.len("เสาเกี่ยว (INTERLOCK)")) / 100) },
    { name: "ยางเฟรมข้าง jambliner (02-031)", unit: "M", noStock: true,
      qty: (o, ctx) => Math.ceil((4 * ctx.len("เสาเสริมเฟรมข้าง (JAMB)")) / 100) },
    { name: "ยางอัดกระจก ใหญ่ (02-068)", unit: "M", noStock: true, note: "6มม.: ×2 เต็ม · 8มม.: ปกติ",
      qty: (o, ctx) => {
        const sum = ctx.len("กรอบบาน แนวนอน (SASH↔)") + ctx.len("กรอบบาน แนวตั้ง (SASH↕)");
        return Math.ceil((Number(o.glass ?? 6) <= 6 ? 0.08 : 0.04) * sum);
      } },
    { name: "ยางอัดกระจก 8มม. เล็ก (02-069)", unit: "M", noStock: true, note: "เฉพาะกระจก >6มม.",
      qty: (o, ctx) => (Number(o.glass ?? 6) <= 6 ? 0 : Math.ceil(0.04 * (ctx.len("กรอบบาน แนวนอน (SASH↔)") + ctx.len("กรอบบาน แนวตั้ง (SASH↕)")))) },
  ],
};

// ═══════════════════════ ประตู 4 รุ่น (ไฟล์เป็น ซม. อยู่แล้ว — ไม่ต้อง ÷10) ═══════════════════════
// รหัสกล่องอลู → ชื่อในสต็อก "หมวดอลูมิเนียม" รูปแบบ: กล่อง 2"x4" (แยกต่อสี · เลือกสีที่ dropdown สีอลู)
// ⚠ ห้ามใช้รหัสหลวมอย่าง "2x4" — หมวด "อุปกรณ์" มีกล่องไฟฟ้า (กล่องลอย-2x4/กล่องกันนํ้า-2x4) จะหักผิดของ
// ฉาก 6 หุน / แซด 4" = อลูมิเนียม ไม่ใช่เหล็ก (เจ้าของยืนยัน 27 ส.ค.69) — ผูกสโตร์ด้วยชื่อเหมือนกล่อง
//   สโตร์ตั้งชื่อ "ฉาก 6 หุน-<สี>" ครบทุกสีแล้ว (JR01893-01901)
//   ⚠ "แซด 4"" ยังไม่มีในสโตร์ — ตั้งชื่อ "ตัวZ 4"-<สี>" เมื่อไร ระบบผูกให้เอง (box-link รองรับชนิด ตัวZ แล้ว)
const ANGLE_6 = 'ฉาก 6 หุน';
const ZBAR_4 = 'แซด 4"';

const boxCode = (size: string) => {
  const [a, b] = String(size).split(/[×xX*]/).map((s) => s.trim());
  return b ? `กล่อง ${a}"x${b}"` : `กล่อง ${a}`;
};
// คาน "ผสม" (เช่น "1×4+1×1.6", "2×4+4×4") = กล่อง 2 ตัวประกบกัน ตัดยาวเท่ากันทั้งคู่
// ห้ามส่งทั้งก้อนเข้า boxCode ตรงๆ — split บน × จะได้ กล่อง 2"x4+4" (รหัสผี ไม่มีในสต็อก หักไม่ติดเงียบๆ)
// → แตกด้วย + ก่อน แล้วค่อยแปลงทีละตัว · โปรไฟล์หลักใช้ตัวแรก + โปรไฟล์ "กล่องเสริม" ใช้ตัวที่สอง
const beamBoxCodes = (beam?: string): string[] =>
  String(beam ?? "").split("+").map((s) => s.trim()).filter(Boolean).map(boxCode);

// ⑮ PC Door (JR_PCDoor) — บานเปิดเมืองทอง + บานเลื่อน sms · N มาจาก split
// เส้นสต็อก 640 (6.4 ม.) — เจ้าของยืนยัน (ไฟล์ไม่มีคอลัมน์เส้น · รุ่นนี้มีชิ้น sms)
const pcBeamCut = (o: CutInput) => (o.beam === "2×4" ? 5 : 2.5);
const pcN = (o: CutInput) => (o.split === "แบ่ง 4" ? 4 : 2);
const pcNoSill = (o: CutInput) => o.sill === "ไม่มีธรณี";
export const PC_DOOR: CutSpec = {
  id: "pc_door", name: "ประตู PC Door (เปิดเมืองทอง + เลื่อน sms)", stockLen: 640, rails: [],
  opts: [
    { key: "beam", label: "คาน (กล่อง)", choices: ["1×4", "2×4"] },
    { key: "split", label: "รูปแบบบาน", choices: ["แบ่ง 2", "แบ่ง 4"] },
    { key: "sill", label: "ธรณี", choices: ["มีธรณี", "ไม่มีธรณี"] },
    ...HANDLE_OPTS_LR,
  ],
  defaults: { W: 300, H: 240, N: 2, rail: "", honk: false, beam: "1×4", split: "แบ่ง 2", sill: "มีธรณี", handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" },
  profiles: [
    { name: "คาน", code: (o) => boxCode(o.beam ?? "1×4"), len: (o) => o.W, qty: () => 1, note: "ตัดเท่าช่อง" },
    { name: "ฝาครอบรางบน", code: "-", len: (o) => o.W - 3.3 - 2.5, qty: () => 1 },
    { name: "รางบนบานเลื่อน", code: "-", len: (o) => o.W - 4.5 - 2.5, qty: () => 1 },
    // รหัส F#### เจ้าของยืนยัน 24 ส.ค.69 ("6 เส้นตรง เพิ่มในใบตัดด้วย"): วงกบ=F7859 · กรอบเมืองทอง=F7864
    { name: "วงกบบานเปิด", code: "F7859", len: (o) => o.H - pcBeamCut(o), qty: () => 1 },
    { name: "เสารับบานเลื่อน", code: "-", len: (o) => o.H - pcBeamCut(o), qty: () => 1 },
    { name: "ชนกลางรับบานเลื่อน", code: "-", len: (o) => o.H - pcBeamCut(o) - 4, qty: () => 1 },
    // เจ้าของสั่ง 3 ก.ย.69: ชนกลางใส่เมื่อ "แบ่ง 4 บานขึ้นไป" เท่านั้น
    { name: "ชนกลางบานเลื่อน", code: "B20046", len: (o) => o.H - pcBeamCut(o) - 4, qty: (o) => (o.split === "แบ่ง 4" ? 1 : 0), note: "ไฟล์เขียนรหัสเปล่า '20046'" },
    { name: "กรอบบานเปิด เมืองทอง (สูง)", code: "F7864", len: (o) => o.H - pcBeamCut(o) - (pcNoSill(o) ? 3 : 6.3), qty: pcN },
    // กว้างเปิด −1.9 (แบ่ง2) / +0.5 (แบ่ง4) · กว้างเลื่อน −10.2 / −10 — แก้ตามกระดานคำนวณในไฟล์ 24 ส.ค.69 (เดิมพอร์ตมา −0.7 / −11.4 ผิด)
    { name: "กรอบบานเปิด เมืองทอง (กว้าง)", code: "F7864", len: (o) => o.W / pcN(o) + (o.split === "แบ่ง 4" ? 0.5 : -1.9), qty: pcN },
    // เสาตั้ง (สูง) = B20051 · เสานอน (กว้าง) = B20054 (เจ้าของให้รหัส 3 ก.ย.69)
    //   ⚠ เจ้าของแจ้งว่าจะแก้อีกรอบ: เพิ่มเสาเกี่ยว B20009 + ลดจำนวนเสากุญแจ — รอไฟล์
    { name: "กรอบบานเลื่อน sms (สูง)", code: "B20051", len: (o) => o.H - pcBeamCut(o) - (pcNoSill(o) ? 5.8 : 10.3), qty: pcN },
    { name: "กรอบบานเลื่อน sms (กว้าง)", code: "B20054", len: (o) => o.W / pcN(o) - (o.split === "แบ่ง 4" ? 10 : 10.2), qty: pcN },
    // ── เพิ่มตามคิดราคา 4.0 (เจ้าของสั่ง 24 ส.ค.69) — ชีตไฟล์ตกหล่นแถวพวกนี้ ──
    { name: "ธรณี F7938B", code: "F7938B", len: (o) => o.W, qty: (o) => (pcNoSill(o) ? 0 : 1) },
    { name: "ตบธรณี F7960", code: "F7960", len: (o) => o.W, qty: (o) => (pcNoSill(o) ? 0 : 1) },
    { name: "เสารับล็อกเปิดกลาง F7945C", code: "F7945C", len: (o) => o.H - pcBeamCut(o), qty: (o) => (o.split === "แบ่ง 4" ? 1 : 0) },
    // คิ้วกระจก: เจ้าของสั่ง 3 ก.ย.69 "PC Door คิ้วกระจกไม่ใช้" — ถอดออกทั้งใบตัดและคิดราคา
  ],
  // ⑤ อุปกรณ์ PC Door (มี SKU · ใช้ตาราง lookup มือจับเดียวกับ SMS) · บานเลื่อน = pcN/2 · สีบานพับ/กลอน ตามสีมือจับ
  hardware: [
    { name: "ล้อรางบน Hafele 100kg", sku: "JR00544", qty: (o) => pcN(o) / 2, unit: "กล่อง", note: "1/บานเลื่อน" },
    ...handleHardware("LR"),
    { name: "น็อตประกอบบาน 1\"", sku: "JR00864", qty: (o) => 4 * (pcN(o) / 2), unit: "ตัว" },
    { name: "สักหลาด 5×3", sku: "JR00794", unit: "เมตร", noStock: true, note: "กรอบบาน+เฟรมข้าง (สะสมม้วน)",
      qty: (o, ctx) => Math.round((4 * (ctx.len("กรอบบานเลื่อน sms (สูง)") + ctx.len("กรอบบานเลื่อน sms (กว้าง)")) * (pcN(o) / 2) + 2 * o.H) / 100 * 10) / 10 },
    { name: "หัวต่อราง ซ้าย", sku: "JR02968", qty: (o) => pcN(o) / 2, unit: "อัน", note: "1/บานเลื่อน" },
    { name: "หัวต่อราง ขวา", sku: "JR02969", qty: (o) => pcN(o) / 2, unit: "อัน", note: "1/บานเลื่อน" },
    { name: "ฝาครอบราง", sku: (o) => (o.handleColor === "ดำ" ? "JR03057" : "JR03056"), qty: (o) => pcN(o), unit: "เส้น", note: "ขาว JR03056 · ดำ JR03057" },
    { name: "บานพับไม่บาก", sku: (o) => (o.handleColor === "ดำ" ? "JR00474" : "JR00473"), qty: (o) => 4 * (pcN(o) / 2), unit: "ตัว", note: "4/บานเปิด" },
    { name: "กลอน", sku: (o) => (o.handleColor === "ดำ" ? "JR00627" : "JR00630"), qty: (o) => pcN(o) / 2, unit: "อัน", note: "1/บานเปิด" },
    { name: "ปลายกลอน", sku: "JR00598", qty: (o) => pcN(o) / 2, unit: "อัน", note: "1/บานเปิด" },
  ],
};

// ⑯ ประตูรั้วบานเลื่อน — รื้อใหม่ทั้งก้อน 24 ส.ค.69 ยึด "JR_ประตูรั้ว.xlsx" ทุกบรรทัด (เจ้าของสั่ง "คิดใหม่ทำใหม่")
// ─────────────────────────────────────────────────────────────────────────────
// ⑥ แผงแก้ค่า ในไฟล์ = ค่าคงที่ชุดนี้ · แก้ที่นี่ที่เดียว ทั้งใบตัดและคิดราคาเปลี่ยนตาม
//   (คิดราคา 4.0 ใช้ชุดเดียวกัน — ดู GATE_CONST ที่ products.mjs อ้างถึงในคอมเมนต์)
const gR1 = (x: number) => Math.round(x * 10) / 10;
const gR2 = (x: number) => Math.round(x * 100) / 100;
const GATE = {
  standIn: 15.5,     // หักเสาตั้ง ยัดใน
  standOut: 17.5,    // หักเสาตั้ง แปะนอก
  slatCutIn: 20.4,   // หักใบระแนง ยัดใน
  slatAddOut: 5,     // บวกใบระแนง แปะนอก
  tail: 30,          // หางยื่น (เสานอน = W + 30)
  tailFront: 40,     // หางหน้าลง
  tailBack: 15,      // หางท้ายลง
  guideAddOut: 5,    // บวกเสารับไกด์ แปะนอก
  railCut: 50,       // หักราง (ยาว = W×2 − 50)
  stock: 600,        // ยาวเส้นสต็อก (ซม.)
} as const;

// ด้านโชว์ (ซม.) — ตรงดรอปดาวน์ในไฟล์
const GATE_SHOW: Record<string, number> = { "1 cm": 1, "5 cm": 5, '1"': 2.54, '1½"': 3.81, '1.6"': 4.06, '4"': 10.16 };
const gShow = (s?: string) => GATE_SHOW[s ?? '1.6"'] ?? 4.06;
/**
 * กล่องใบระแนง — ตัวเลือก → "ชื่อรหัสจริงในสโตร์"
 * ⚠ ห้ามสร้างรหัสจากขนาดเอง สโตร์เขียนไม่เหมือนกันทุกตัว
 *   "1×5" = 1 × 5 เซนติเมตร (ไม่ใช่นิ้ว) สโตร์ชื่อ "กล่อง 1x5" — เจ้าของยืนยัน 26 ส.ค.69
 */
export const GATE_BOX_CODE: Record<string, string> = {
  "1×1": 'กล่อง 1"x1"', "1×1.5": 'กล่อง 1"x1.5"', "1×1.6": 'กล่อง 1"x1.6"',
  "1×4": 'กล่อง 1"x4"', "1×5 ซม.": "กล่อง 1x5",
  "1.6×1.6": 'กล่อง 1.6"x1.6"', "1.6×4": 'กล่อง 1.6"x4"',
};
export const GATE_BOXES = Object.keys(GATE_BOX_CODE);
/** คีย์กล่องฝั่งคิดราคา 4.0 (material / spec.gboxB) → คีย์ในใบตัด — ใช้ที่ from-recipe */
export const GATE_BOX_FROM_CALC: Record<string, string> = {
  "1x1": "1×1", "1x1.5": "1×1.5", "1x1.6": "1×1.6", "1x4": "1×4",
  "1x5": "1×5 ซม.", "1.6x1.6": "1.6×1.6", "1.6x4": "1.6×4",
};
const gateBoxCode = (v: unknown) => GATE_BOX_CODE[String(v ?? "1×1.6")] ?? GATE_BOX_CODE["1×1.6"];
const gOut = (o: CutInput) => o.fit === "แปะนอก";

// ② คำนวณ (ตรงไฟล์)
const gStand = (o: CutInput) => o.H - (gOut(o) ? GATE.standOut : GATE.standIn);      // เสาตั้ง
/** ช่วงกระจายใบ — ไฟล์เขียน "ตั้ง=เสานอน / นอน=เสาตั้ง" (นอน กระจายบนเสาตั้งที่หักกรอบแล้ว) */
const gSpan = (o: CutInput) => (o.slatDir === "นอน" ? gStand(o) : o.W);
/** ยาว/ใบระแนง — ตั้ง วิ่งตามเสาตั้ง · นอน วิ่งตามเสานอน(W) · ยัดในหัก 20.4 · แปะนอกบวก 5 */
const gSlatLen = (o: CutInput) => {
  const base = o.slatDir === "นอน" ? o.W : gStand(o);
  return gR1(base + (gOut(o) ? GATE.slatAddOut : -GATE.slatCutIn));
};
// เส้นทแยงค้ำหาง = √(หางยื่น² + (หางหน้าลง − หางท้ายลง)²) = 39.1
const GATE_DIAG = gR1(Math.sqrt(GATE.tail ** 2 + (GATE.tailFront - GATE.tailBack) ** 2));
const gAlt = (o: CutInput) => o.slatType === "ระแนงสลับ";

/**
 * จำนวนใบระแนง — ตรงไฟล์
 *   เดี่ยว : nf = INT(ช่วง ÷ pitchA) + 1   (pitch = ด้านโชว์ + ช่องห่าง)
 *   สลับ  : เรียงใบตามรูปแบบ A×aRun, B×bRun วนไป เติมจนเต็มช่วง แล้วนับแยก A/B
 *           (ไฟล์ตัวอย่าง 350 ซม. โชว์ 4.06 ห่าง 5 · A3:B5 → รวม 39 = A 15 + B 24)
 *   ห่างจริง = (ช่วง − หน้ารวม) ÷ (n − 1)
 */
function gCounts(o: CutInput) {
  const span = gSpan(o), fA = gShow(o.showA), fB = gShow(o.showB), gap = o.gap ?? 5;
  const single = Math.max(1, Math.trunc(span / (fA + gap) + 1e-9) + 1);
  if (!gAlt(o)) return { nA: single, nB: 0, faceSum: gR1(single * fA), gapReal: single > 1 ? gR2((span - single * fA) / (single - 1)) : 0 };
  const aRun = Math.max(1, Math.round(o.aRun ?? 3)), bRun = Math.max(1, Math.round(o.bRun ?? 5));
  let cum = 0, nA = 0, nB = 0;
  for (let k = 1; k <= 999; k++) {
    const isA = ((k - 1) % (aRun + bRun)) < aRun;
    const next = cum + (isA ? fA : fB);
    if (next + (k - 1) * gap > span + 1e-9) break;
    cum = next; if (isA) nA++; else nB++;
  }
  const n = nA + nB;
  return { nA, nB, faceSum: gR1(cum), gapReal: n > 1 ? gR2((span - cum) / (n - 1)) : 0 };
}

export const GATE_SLIDE: CutSpec = {
  id: "gate_slide", name: "ประตูรั้วบานเลื่อน (โครงกล่อง 2×4 45° + หางเสือ + ระแนง)", stockLen: GATE.stock, rails: [],
  packBars: true,   // ④ ในไฟล์นับ "เส้นที่ต้องซื้อ" — ต้องจัดชิ้นลงเส้นจริง ไม่ใช่รวมยาวหาร
  opts: [
    { key: "fit", label: "แบบประกอบ", choices: ["ยัดใน", "แปะนอก"] },
    { key: "slatDir", label: "แนวระแนง", choices: ["ตั้ง", "นอน"] },
    { key: "slatType", label: "ชนิดใบ", choices: ["ระแนง", "ระแนงสลับ"] },
    { key: "boxA", label: "กล่องใบระแนง (A)", choices: GATE_BOXES },
    { key: "showA", label: "ด้านโชว์ (A)", choices: Object.keys(GATE_SHOW) },
    { key: "gap", label: "ช่องห่างที่ต้องการ (ซม.)", type: "number" },
    { key: "boxB", label: "[สลับ] กล่อง B", choices: GATE_BOXES },
    { key: "showB", label: "[สลับ] ด้านโชว์ B", choices: Object.keys(GATE_SHOW) },
    { key: "aRun", label: "[สลับ] A กี่ท่อน/ชุด", type: "number" },
    { key: "bRun", label: "[สลับ] B กี่ท่อน/ชุด", type: "number" },
  ],
  defaults: {
    W: 350, H: 180, N: 1, rail: "", honk: false,
    fit: "ยัดใน", slatDir: "ตั้ง", slatType: "ระแนง",
    boxA: "1×1.6", showA: '1.6"', gap: 5, boxB: "1×1.6", showB: '1.6"', aRun: 3, bRun: 5,
  },
  // ③ ใบตัด — เรียงตรงลำดับในไฟล์ 1…10
  profiles: [
    { name: "เสาตั้งข้าง (2×4)", code: boxCode("2×4"), len: gStand, qty: () => 2, note: "ยัดใน H−15.5 / แปะนอก H−17.5" },
    { name: "เสานอนบน (2×4, รวมหาง)", code: boxCode("2×4"), len: (o) => o.W + GATE.tail, qty: () => 1, note: "W+30" },
    { name: "เสานอนล่าง (2×4, รวมหาง)", code: boxCode("2×4"), len: (o) => o.W + GATE.tail, qty: () => 1, note: "W+30 (เหมือนบน)" },
    { name: "เสาตั้งท้ายหาง (2×4)", code: boxCode("2×4"), len: gStand, qty: () => 1, note: "เท่าเสาตั้ง" },
    { name: "เส้นทแยงค้ำมุมบน (2×4)", code: boxCode("2×4"), len: () => GATE_DIAG, qty: () => 1, note: "√(30²+25²)=39.1" },
    { name: "ใบระแนง A", code: (o) => gateBoxCode(o.boxA), len: gSlatLen, qty: (o) => gCounts(o).nA, note: "แนว=ตามที่เลือก · คิดแค่ช่อง" },
    { name: "ใบระแนง B (สลับ)", code: (o) => gateBoxCode(o.boxB), len: (o) => (gAlt(o) ? gSlatLen(o) : 0), qty: (o) => gCounts(o).nB, note: "เฉพาะระแนงสลับ · ยาวเท่า A" },
    // สโตร์ชื่อ "ฉากข้อต่อ 2\"" (JR02944) — คนละตัวกับ "ฉาก 2\"" ที่เคยผูกผิด (เจ้าของให้รหัส 26 ส.ค.69)
    { name: 'ฉากข้อต่อ 2" (เฉพาะแปะนอก)', code: "JR02944", len: (o) => o.W, qty: (o) => (gOut(o) ? 1 : 0), note: "ยาว=เสานอน(W)" },
    { name: "เสารับไกด์ (4×4) — เสาแยก", code: boxCode("4×4"), len: (o) => o.H + (gOut(o) ? GATE.guideAddOut : 0), qty: () => 1, note: "ยัดใน H / แปะนอก H+5" },
    // ราง = ฉากเหล็ก 1.5" + เพลา 4 หุน — เหล็ก ไม่ใช่อลู ยังไม่มีรหัสในสโตร์ (ดูสรุปของที่ยังไม่มี)
    { name: 'ราง ฉากเหล็ก 1.5"+เพลา 4หุน', code: "-", len: (o) => o.W * 2 - GATE.railCut, qty: () => 1, note: "ยาว=กว้าง×2−50" },
  ],
  // ⑤ อุปกรณ์ — ไฟล์เขียนกำกับว่า "ไม่สต็อก ซื้อต่อออเดอร์ เว้นรหัส" → ตั้งใจไม่ผูก sku
  hardware: [
    { name: 'ล้อวิ่ง 3"', sku: "JR02942", qty: (o) => 2 + (o.W > 400 ? Math.ceil((o.W - 400) / 100) : 0), unit: "ตัว", note: "2 + กว้าง>400 เพิ่มทุก 100 ซม. (R3.9)" },
    { name: "ล้อไกด์ประคองหลัง", sku: "JR02943", qty: () => 4, unit: "ตัว" },
    { name: "มอเตอร์", qty: (o) => (o.gateDrive === "มือผลัก" ? 0 : 1), unit: "ตัว", noStock: true, note: "ออปชั่น · ไม่สต็อก" },
    { name: "รีโมท", qty: (o) => Math.max(0, Math.round(o.gateRemote ?? 0)), unit: "ตัว", noStock: true, note: "ออปชั่น · ตามจำนวน" },
  ],
};


// ⑰ บานโซลิด (JR_บานโซลิด) — บานเปิดทึบ + ลูกฟูก + เส้นคาด · รองรับแม่-ลูก · เส้น 600 ยืนยันในไฟล์
// ⚠ รหัส "7864" ต้องเปล่า (ไม่ใส่ F) — ชื่อในสต็อกคือ "กรอบประตู 7864"
const sMother = (o: CutInput) => (o.N === 1 ? o.W : o.doorSplit === "แม่-ลูก" ? (o.motherW ?? o.W) : o.W / o.N);
const sChild = (o: CutInput) => (o.N === 1 ? 0 : o.doorSplit === "แม่-ลูก" ? o.W - (o.motherW ?? 0) : o.W / o.N);
const sChildN = (o: CutInput) => Math.max(o.N - 1, 0);
const sFrameH = (o: CutInput) => o.H - 3.7;
const sBattenM = (o: CutInput) => Math.max(0, Math.trunc((sMother(o) - 18) / 3.8));
const sBattenC = (o: CutInput) => (sChild(o) > 0 ? Math.max(0, Math.trunc((sChild(o) - 18) / 3.8)) : 0);
const sCorrM = (o: CutInput) => Math.ceil(sMother(o) / 10);
const sCorrC = (o: CutInput) => (sChild(o) > 0 ? Math.ceil(sChild(o) / 10) : 0);
const sHasSill = (o: CutInput) => o.sill === "มี";
// ตลับกุญแจ/ไส้กุญแจ/แผ่นรับล็อค ผูกกับมือจับใบแม่เท่านั้น — Digital lock/ไม่ใส่ = ไม่มีตลับกลไก
const sMotherLockGate = (o: CutInput) => o.motherHandle !== "Digital lock" && o.motherHandle !== "ไม่ใส่";
export const SOLID_DOOR: CutSpec = {
  id: "solid_door", name: "บานโซลิด (เปิดทึบ+ลูกฟูก · แม่-ลูก)", stockLen: 600, rails: [],
  opts: [
    { key: "sill", label: "ธรณี", choices: ["มี", "ไม่มี"] },
    { key: "doorSplit", label: "แบ่งบาน", choices: ["แม่-ลูก", "เท่ากัน"] },
    { key: "motherW", label: "บานแม่ กว้าง (ซม.)", type: "number" },
    { key: "hwColor", label: "สีอุปกรณ์", choices: ["ขาว", "ดำ"] },
    { key: "lockType", label: "ตลับกุญแจ", choices: ["ล็อคปกติ", "มัลติพ้อยล็อค"] },
    { key: "openDir", label: "ทิศเปิด", choices: ["เปิดออก", "เปิดเข้า"] },
    // Cmech แยก 2 sub-choice ตรงไฟล์ (⑤.1 แถว 67-68) · motherHandle เพิ่ม Digital lock/ไม่ใส่ (แถว 69-71,77 เช็ค B57)
    { key: "motherHandle", label: "มือจับใบแม่", choices: ["คิงโบ ล็อค+กุญแจ", "คิงโบ ดัมมี่+ดัมมี่", "Cmech ล็อค+กุญแจ", "Cmech ดัมมี่+ดัมมี่", "Digital lock", "ไม่ใส่", "อื่นๆ"] },
    { key: "childHandle", label: "มือจับใบลูก", choices: ["ไม่ใส่", "คิงโบ ล็อค+กุญแจ", "คิงโบ ดัมมี่+ดัมมี่", "Cmech ล็อค+กุญแจ", "Cmech ดัมมี่+ดัมมี่", "อื่นๆ"] },
  ],
  defaults: { W: 120, H: 279, N: 2, rail: "", honk: false, sill: "มี", doorSplit: "แม่-ลูก", motherW: 80, hwColor: "ขาว", lockType: "ล็อคปกติ", openDir: "เปิดออก", motherHandle: "คิงโบ ล็อค+กุญแจ", childHandle: "ไม่ใส่" },
  profiles: [
    { name: "วงกบบน F7859", code: "F7859", len: (o) => o.W - 5, qty: () => 1 },
    { name: "วงกบข้าง F7859", code: "F7859", len: (o) => o.H, qty: () => 2 },
    { name: "ธรณี F7938B", code: "F7938B", len: (o) => o.W - 5, qty: (o) => (sHasSill(o) ? 1 : 0) },
    { name: "ตบธรณี F7960", code: "F7960", len: (o) => o.W - 5, qty: (o) => (sHasSill(o) ? 1 : 0) },
    { name: "เสริมใต้บาน F7863", code: "F7863", len: (o) => o.W - 5, qty: (o) => (sHasSill(o) ? 0 : 1) },
    // รหัสจริงในสโตร์คือ F7864 (F7864-เสาบานเปิด 10 ซม. · 7 สี) — เดิมเขียน "7864" ไม่มี F เลยหักสต็อกไม่ได้
    { name: "กรอบบานตั้ง F7864", code: "F7864", len: (o) => o.H - 3.7, qty: (o) => 2 * o.N },
    { name: "คิ้วตั้ง F7935", code: "F7935", len: (o) => o.H - 23.7, qty: (o) => 2 * o.N },
    { name: "เปิดกลาง F7945c", code: "F7945C", len: (o) => o.H - 5.4, qty: sChildN },
    { name: "กรอบนอน บานแม่ F7864", code: "F7864", len: (o) => sMother(o) - (o.N === 1 ? 3.7 : 1.95), qty: () => 2 },
    { name: "กรอบนอน บานลูก F7864", code: "F7864", len: (o) => (sChild(o) > 0 ? sChild(o) - (o.N === 1 ? 3.7 : 1.95) : 0), qty: (o) => 2 * sChildN(o) },
    { name: "คิ้วนอน บานแม่ F7935", code: "F7935", len: (o) => sMother(o) - (o.N === 1 ? 19.7 : 17.95), qty: () => 2 },
    { name: "คิ้วนอน บานลูก F7935", code: "F7935", len: (o) => (sChild(o) > 0 ? sChild(o) - (o.N === 1 ? 19.7 : 17.95) : 0), qty: (o) => 2 * sChildN(o) },
    { name: "ลูกฟูก บานแม่ (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sCorrM(o) * 2 },
    { name: "ลูกฟูก บานลูก (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sCorrC(o) * 2 * sChildN(o) },
    { name: "เส้นคาด บานแม่ (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sBattenM(o) * 2 },
    { name: "เส้นคาด บานลูก (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sBattenC(o) * 2 * sChildN(o) },
  ],
  // ⑤ อุปกรณ์ บานโซลิด (มี SKU · เงื่อนไขสี ดำ↔ขาว + ตลับ/ทิศ/มือจับแม่-ลูก) — พอร์ตตรงไฟล์
  hardware: [
    { name: "บานพับ hyda", sku: (o) => (o.hwColor === "ดำ" ? "JR00488" : "JR00489"), unit: "ตัว",
      qty: (o) => (o.H > 300 || sMother(o) > 120 ? 5 : 4) + (sChild(o) > 0 ? (o.H > 300 || sChild(o) > 120 ? 5 : 4) * sChildN(o) : 0) },
    { name: "สปิงก็อท", sku: "JR00592", qty: (o) => 4 * o.N, unit: "ตัว" },
    { name: "ฉากประคองมุม", sku: "JR00267", qty: (o) => 8 * o.N, unit: "ตัว" },
    { name: "มือจับ ล็อค+กุญแจ (คิงโบ)", sku: (o) => (o.hwColor === "ดำ" ? "JR00314" : "JR00315"), unit: "ชุด",
      qty: (o) => (o.motherHandle === "คิงโบ ล็อค+กุญแจ" ? 1 : 0) + (sChildN(o) > 0 && o.childHandle === "คิงโบ ล็อค+กุญแจ" ? 1 : 0) },
    { name: "มือจับ ดัมมี่+ดัมมี่ (คิงโบ)", sku: (o) => (o.hwColor === "ดำ" ? "JR00312" : "JR00313"), unit: "ชุด",
      qty: (o) => (o.motherHandle === "คิงโบ ดัมมี่+ดัมมี่" ? 1 : 0) + (sChildN(o) > 0 && o.childHandle === "คิงโบ ดัมมี่+ดัมมี่" ? 1 : 0) },
    { name: "มือจับ Cmech ล็อค+กุญแจ", unit: "ชุด", noStock: true, note: "เว้นรหัส รอผูก",
      qty: (o) => (o.motherHandle === "Cmech ล็อค+กุญแจ" ? 1 : 0) + (sChildN(o) > 0 && o.childHandle === "Cmech ล็อค+กุญแจ" ? 1 : 0) },
    { name: "มือจับ Cmech ดัมมี่+ดัมมี่", unit: "ชุด", noStock: true, note: "เว้นรหัส รอผูก",
      qty: (o) => (o.motherHandle === "Cmech ดัมมี่+ดัมมี่" ? 1 : 0) + (sChildN(o) > 0 && o.childHandle === "Cmech ดัมมี่+ดัมมี่" ? 1 : 0) },
    otherHandleRow("motherHandle", { label: "มือจับใบแม่ (อื่นๆ)" }),
    otherHandleRow("childHandle", { label: "มือจับใบลูก (อื่นๆ)", gate: (o) => sChildN(o) > 0 }),
    // ตลับ/ไส้/รับล็อค = 0 เมื่อมือจับใบแม่ Digital lock หรือ ไม่ใส่ (ตรงไฟล์ ⑤.1 แถว 69-71)
    { name: "ตลับกุญแจไฮด้า", sku: (o) => (o.lockType === "มัลติพ้อยล็อค" ? "JR00553" : "JR00551"), qty: (o) => (sMotherLockGate(o) ? 1 : 0), unit: "ตัว" },
    { name: "ไส้กุญแจ", sku: (o) => (o.openDir === "เปิดเข้า" ? "JR00498" : "JR00499"), qty: (o) => (sMotherLockGate(o) ? 1 : 0), unit: "ตัว", note: "auto เข้า/ออก" },
    { name: "แผ่นรับล็อค", sku: "JR00562", qty: (o) => (sMotherLockGate(o) ? 1 : 0), unit: "ชุด" },
    { name: "Digital lock (ซื้อแยก)", qty: (o) => (o.motherHandle === "Digital lock" ? 1 : 0), unit: "ชุด", noStock: true, note: "ไม่ตัดสต็อก · ซื้อแยก" },
    { name: "CDQ บานเปิด (บานลอง)", sku: "JR00596", qty: sChildN, unit: "ตัว" },
    { name: "ปลายกลอน (บานลอง)", sku: "JR00598", qty: sChildN, unit: "ตัว" },
    { name: "น็อตเฟรม 1\"", sku: "JR00864", qty: (o) => (sHasSill(o) ? 8 : 6), unit: "ตัว" },
    { name: "ยางกรอบบาน", sku: "JR00771", unit: "เมตร",
      qty: (o) => Math.round((2 * (sMother(o) + o.H) + (sChild(o) > 0 ? 2 * (sChild(o) + o.H) * sChildN(o) : 0)) / 100 * 10) / 10 },
    { name: "ยางวงกบ", sku: "JR00771", unit: "เมตร",
      qty: (o) => Math.round((sHasSill(o) ? 2 * (o.W + o.H) : o.W + 2 * o.H) / 100 * 10) / 10 },
  ],
};

// ⑱ บานเปิดครอบวงกบไม้ (JR_บานเปิดครอบวงกบไม้) — กล่องเรียบ/บังใบล้วน · N ∈ {1,2}
// ⚠ ไฟล์ไม่มีคอลัมน์เส้นสต็อก → ใช้ 600 (รอเจ้าของยืนยัน)
// กล่องครอบวงกบ = กล่องเรียบ 4"x4" (เจ้าของยืนยัน) — สต็อกมี 1.6"x4" กับไม่ระบุขนาดด้วย ต้องใส่ขนาดเต็มกันจับผิดตัว
const wDoor1 = (o: CutInput) => (o.N === 1 ? o.W : o.doorSplit === "เท่ากัน" ? o.W / 2 : (o.motherW ?? o.W));
const wDoor2 = (o: CutInput) => (o.N === 2 ? (o.doorSplit === "เท่ากัน" ? o.W / 2 : o.W - (o.motherW ?? 0)) : 0);
const wSill = (o: CutInput) => o.sill === "มีธรณี";
export const WOODJAMB_SWING: CutSpec = {
  id: "woodjamb_swing", name: "บานเปิดครอบวงกบไม้", stockLen: 600, rails: [],
  opts: [
    { key: "doorSplit", label: "แบบแบ่ง (2 บาน)", choices: ["แม่ลูก", "เท่ากัน"] },
    { key: "motherW", label: "บานแม่ กว้าง (ซม.)", type: "number" },
    { key: "sill", label: "ธรณี", choices: ["มีธรณี", "ไม่มีธรณี"] },
  ],
  defaults: { W: 130, H: 210, N: 2, rail: "", honk: false, doorSplit: "แม่ลูก", motherW: 80, sill: "มีธรณี" },
  profiles: [
    { name: 'กล่องเรียบ 4"x4" แนวตั้ง (ครอบข้าง)', code: 'กล่องเรียบ 4"x4"', len: (o) => o.H - 4.3, qty: () => 2 },
    { name: 'กล่องเรียบ 4"x4" แนวนอน (ครอบบน)', code: 'กล่องเรียบ 4"x4"', len: (o) => o.W - 0.7, qty: () => 1 },
    { name: "บังใบกล่อง แนวนอน (บน)", code: "-", len: (o) => o.W - 0.4, qty: () => 1, note: "45° 2ฝั่ง" },
    { name: "บังใบกล่อง แนวตั้ง (ข้าง)", code: "-", len: (o) => o.H - 0.2 - (wSill(o) ? 4.5 : 0), qty: () => 2, note: "45° 1ฝั่ง" },
    { name: "ธรณี", code: "-", len: (o) => o.W - 0.4, qty: (o) => (wSill(o) ? 1 : 0) },
    { name: "กรอบบานบังใบ แนวตั้ง", code: "-", len: (o) => o.H - 0.2 - 0.8 + 2.7 - (wSill(o) ? 3.2 : 0), qty: (o) => o.N },
    { name: "กรอบบานไม่บังใบ แนวตั้ง", code: "-", len: (o) => o.H - 0.2 - 0.8 - (wSill(o) ? 3.2 : 0), qty: (o) => o.N },
    { name: "กรอบบานบังใบ แนวนอน — บาน1", code: "-", len: (o) => wDoor1(o) - 0.8 + 2.7, qty: () => 1 },
    { name: "กรอบบานบังใบ แนวนอน — บาน2", code: "-", len: (o) => wDoor2(o) - 0.8 + 2.7, qty: (o) => (o.N === 2 ? 1 : 0) },
    { name: "กรอบบานไม่บังใบ แนวนอน — บาน1", code: "-", len: (o) => wDoor1(o) - 0.8 - 3.2, qty: () => 1 },
    { name: "กรอบบานไม่บังใบ แนวนอน — บาน2", code: "-", len: (o) => wDoor2(o) - 0.8 - 3.2, qty: (o) => (o.N === 2 ? 1 : 0) },
  ],
  hardware: [
    { name: "บานพับ hyda", qty: (o) => (o.H > 300 || o.W / o.N > 120 ? 5 : 4) * o.N, unit: "ชิ้น" },
    { name: "มือจับ+ล็อค (ใบหลัก)", qty: () => 1, unit: "ชุด" },
    { name: "ชุดกลอน (ใบลอง)", qty: (o) => Math.max(o.N - 1, 0), unit: "ชุด" },
    { name: "น็อตเฟรม", qty: (o) => (wSill(o) ? 8 : 6), unit: "ตัว" },
    { name: "ยาง", qty: (o) => Math.round((2 * (o.W + o.H)) / 100 * o.N), unit: "ม." },
    { name: "ซิลิโคน ใน+นอก", sku: "JR00504", qty: (o) => Math.ceil((2 * (o.W + o.H)) / 100 * 2 / 12.5), unit: "หลอด" },
  ],
};

// ═══════════════════════ หลังคา / กันสาด / ระแนง (ไฟล์เป็น ซม. อยู่แล้ว) ═══════════════════════
// ⚠ ไฟล์กลุ่มนี้ "ไม่มีคอลัมน์รหัสอลู" → ผูก boxCode() เฉพาะรายการที่ไฟล์ระบุขนาดกล่องชัด · ที่เหลือ "-"
// ⚠ เหล็ก (ฉาก6หุน/แซด4"/กล่องเหล็ก/เพลท) ห้ามผูก boxCode — คนละของกับกล่องอลู
const ceil = (x: number) => Math.ceil(x - 1e-9);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
// ตารางชนิดแผ่นมุง: max = ระยะจันทันสูงสุด · w = กว้างใช้งาน/แผ่น (ซม.)
const ROOF_SHEET: Record<string, { max: number; w: number }> = {
  "ไวนิล": { max: 75, w: 25 }, "ดีไลท์": { max: 100, w: 100 }, "เมทัลชีท": { max: 100, w: 34 },
  "โพลีตัน": { max: 122, w: 122 }, "ชินโคร์ HC": { max: 138, w: 138 }, "ชินโคร์ Sup": { max: 138, w: 138 },
  // ── เพิ่ม 12 ชนิดที่คิดราคามีแต่ใบตัดยังไม่รู้จัก (เจ้าของให้ตัวเลข 2 ก.ย.69) ──
  //   เจ้าของยืนยัน: "ระยะจันทัน คือระยะกว้าง 138ซม. กับ กว้าง 100 ซม." → max = w (จันทันวางตามแนวรอยต่อแผ่น)
  //   ตรงแพตเทิร์นเดิมของแผ่นแผงกว้าง: ดีไลท์ 100/100 · โพลีตัน 122/122 · ชินโคร์ HC 138/138
  //   ⚠ "ระยะแป 50 ซม." ที่เจ้าของบอก เป็นคนละตัว (แปวางขวางจันทัน) ไม่ใช่ค่าในตารางนี้
  "ชินโคร์ Shade 4มม": { max: 138, w: 138 },
  "ชินโคร์ Prime 10มม": { max: 138, w: 138 },
  // เมทัลชีท 3 ชนิดตามไฟล์ถอดทุน v20.1 (3 ก.ย.69) — สูตร E8 นับแถบ CEILING(กว้าง/34) เหมือน "เมทัลชีท" เดิม
  //   (แทน 8 แบบเดิม PVC/เหล็ก-EPS/ฟอยล์-PU/เหล็ก-PU × 1"/2" ที่ไฟล์ใหม่ไม่มีแล้ว)
  'เมทัลชีท EPS 2 นิ้ว เหล็ก': { max: 100, w: 34 }, 'เมทัลชีท EPS 2 นิ้ว PVC': { max: 100, w: 34 }, 'เมทัลชีท EPS 1 นิ้ว PVC': { max: 100, w: 34 },
};
const SHEET_TYPES = [
  "ไวนิล", "ดีไลท์", "เมทัลชีท", "โพลีตัน", "ชินโคร์ HC", "ชินโคร์ Sup",
  "ชินโคร์ Shade 4มม", "ชินโคร์ Prime 10มม",
  'เมทัลชีท EPS 2 นิ้ว เหล็ก', 'เมทัลชีท EPS 2 นิ้ว PVC', 'เมทัลชีท EPS 1 นิ้ว PVC',
];
const sMax = (o: CutInput) => ROOF_SHEET[o.sheet ?? "ไวนิล"]?.max ?? 100;
const sW = (o: CutInput) => ROOF_SHEET[o.sheet ?? "ไวนิล"]?.w ?? 25;
const dblP = (o: CutInput) => (o.purlin === "แปคู่" ? 2 : 1);

// ⑲ กันสาดเพิง (JR_กันสาด) — เส้น 600 ยืนยันในสูตร
// ⏳ ค่าหัก กล่องเหล็ก (F43) / ครอบเพลท (F44) = 0 ในไฟล์ → 2 แถวนี้ยังเป็นค่าดิบ ใช้ตัดจริงไม่ได้ (รอเจ้าของ)
const aRake = (o: CutInput) => r1((o.P ?? 0) / Math.cos(((o.deg ?? 7) * Math.PI) / 180));
// จันทันรวม — ช่างกรอกเองได้ (opt rakeTotal>0 = ใช้ตามนั้น แทนอัตโนมัติ) ตรง Excel B9 (ว่าง=อัตโนมัติ ⌈W/max⌉+1)
const aNr = (o: CutInput) => (o.rakeTotal && o.rakeTotal > 0 ? Math.round(o.rakeTotal) : ceil(o.W / sMax(o)) + 1);
const aBays = (o: CutInput) => aNr(o) - 1;
const aNp = (o: CutInput) => ceil((o.P ?? 0) / 50) + 1;
const aEndSide = (o: CutInput) => (o.roofEnd === "ปิดปลาย" ? 0 : o.roofEnd === "ยื่นปลาย" ? 10 : 10.2);
const aEndJack = (o: CutInput) => (o.roofEnd === "ยื่นปลาย" ? 14.5 : o.roofEnd === "ปิดปลาย" ? 2.5 : 10.2);
const aOut = (o: CutInput) => o.roofEnd === "ยื่นปลาย";
export const AWNING: CutSpec = {
  id: "awning", name: "กันสาดเพิง (หลังคา)", stockLen: 600, rails: [],
  packBars: true,   // ปัดขึ้นเส้นเต็ม จัดชิ้นลงเส้นจริง — ให้ตรงคิดราคา 4.0 (เจ้าของเคาะ 27 ส.ค.69)
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "P", label: "ยื่น P (ซม.)", type: "number" },
    { key: "deg", label: "องศาเอียง", type: "number" },
    { key: "purlin", label: "แป", choices: ["แปคู่", "แปเดี่ยว"] },
    { key: "roofEnd", label: "ปลายหลังคา", choices: ["รางน้ำ", "ปิดปลาย", "ยื่นปลาย"] },
    { key: "rakeTotal", label: "จันทันรวม (ช่างกรอกเอง — 0/ว่าง=อัตโนมัติ)", type: "number" },
  ],
  defaults: { W: 300, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", P: 150, deg: 7, purlin: "แปคู่", roofEnd: "รางน้ำ", rakeTotal: 0 },
  profiles: [
    { name: "จันทันรัดรอบ (กว้าง หน้า-หลัง)", code: boxCode("1.6×4"), len: (o) => o.W - 0.4, qty: () => 2 },
    { name: "จันทันรัดรอบ (ยื่น ข้าง)", code: boxCode("1.6×4"), len: (o) => aRake(o) - aEndSide(o), qty: () => 2 },
    { name: "จันทันซอย 1.6×4", code: boxCode("1.6×4"), len: (o) => aRake(o) - aEndJack(o), qty: aNr },
    { name: "แป (ยัดในช่อง)", code: (o) => boxCode(o.purlin === "แปเดี่ยว" ? "1.6×1.6" : "1×1.5"), len: (o) => (o.W - aNr(o) * 4.5) / aBays(o), qty: (o) => aBays(o) * aNp(o) * dblP(o), note: "แปเดี่ยว=กล่อง1.6×1.6 · แปคู่=กล่อง1×1½" },
    { name: "ฉาก 6 หุน", code: ANGLE_6, len: (o) => o.W, qty: (o) => ceil(o.W / 600), note: "⚠ ไฟล์: ยาว=W แต่จำนวน=⌈W/600⌉" },
    { name: 'แซด 4"', code: ZBAR_4, len: (o) => o.W, qty: (o) => ceil(o.W / 600) },
    { name: "เพลทเหล็ก", code: "-", len: () => 0, qty: (o) => 2 * aNr(o), note: "2/จันทัน · ไม่มีความยาว" },
    { name: "กล่องครอบเพลท 1.6×4", code: boxCode("1.6×4"), len: (o) => aRake(o) * 0.25, qty: aNr, note: "25% ของยื่นเอียง · ⏳ ไฟล์ยังไม่ใส่ค่าหักเพิ่ม (F44=0)" },
    { name: "รัดรอบ (หน้า)", code: boxCode("1×1.5"), len: (o) => (aOut(o) ? 0 : o.W + (o.roofEnd === "ปิดปลาย" ? 1 : 5.4)), qty: (o) => (aOut(o) ? 0 : 1) },
    { name: "รัดรอบ (ข้าง)", code: boxCode("1×1.5"), len: (o) => (aOut(o) ? 0 : aRake(o) + (o.roofEnd === "ปิดปลาย" ? 0.5 : 2.7)), qty: (o) => (aOut(o) ? 0 : 2) },
    { name: "รางน้ำอลู", code: "-", len: (o) => o.W, qty: (o) => (o.roofEnd === "รางน้ำ" ? ceil(o.W / 600) : 0) },
    { name: "แผ่นหลังคา", code: "-", len: aRake, qty: (o) => ceil(o.W / sW(o)) },
  ],
};

// ⑳ กันสาด ตัวแอล / เพิงตรง (JR_กันสาด_L) — เส้น 600 ยืนยันในไฟล์
// ⚠ บัคในไฟล์: ตัวคิดแถวแป (AK/AL) ไม่เช็ค "ตัวแอล" → เลือก "เพิงตรง" จำนวนแปยังผันตาม "ยื่น B" (พอร์ตตามไฟล์ ไม่แก้ให้ — รอเจ้าของเคาะ)
// ⏳ ค่าหัก ชนตะเข้ (B91) / กล่องเหล็ก (B92) / ครอบเพลท (B93) = 0 ในไฟล์
const lIsL = (o: CutInput) => o.shape === "ตัวแอล";
const lRaftA = (o: CutInput) => r1(Math.sqrt((o.PA ?? 0) ** 2 + (o.drop ?? 0) ** 2));
const lRaftB = (o: CutInput) => r1(Math.sqrt((o.PB ?? 0) ** 2 + (o.drop ?? 0) ** 2));
const lNrA = (o: CutInput) => ceil((o.LA ?? 0) / sMax(o)) + 1;
const lNrB = (o: CutInput) => (lIsL(o) ? ceil((o.LB ?? 0) / sMax(o)) + 1 : 0);
const lPitchA = (o: CutInput) => r2((o.LA ?? 0) / (lNrA(o) - 1));
const lPitchB = (o: CutInput) => (lNrB(o) > 1 ? r2((o.LB ?? 0) / (lNrB(o) - 1)) : 0);
const lHip = (o: CutInput) => r1(Math.sqrt((o.PA ?? 0) ** 2 + (o.PB ?? 0) ** 2 + (o.drop ?? 0) ** 2));
const lEaveA = (o: CutInput) => (lIsL(o) ? (o.LA ?? 0) - (o.PB ?? 0) : (o.LA ?? 0));
const lEaveB = (o: CutInput) => (lIsL(o) ? (o.LB ?? 0) - (o.PA ?? 0) : 0);
const lJackA = (o: CutInput) => (lIsL(o) && lPitchA(o) > 0 ? Math.min(lNrA(o) - 1, Math.trunc(((o.PB ?? 0) - 0.001) / lPitchA(o))) : 0);
const lJackB = (o: CutInput) => (lIsL(o) && lPitchB(o) > 0 ? Math.min(lNrB(o) - 1, Math.trunc(((o.PA ?? 0) - 0.001) / lPitchB(o))) : 0);
const lFullA = (o: CutInput) => (lIsL(o) ? lNrA(o) - 1 - lJackA(o) : lNrA(o));
const lFullB = (o: CutInput) => (lIsL(o) ? lNrB(o) - 1 - lJackB(o) : 0);
const lTotA = (o: CutInput) => lJackA(o) + lFullA(o);
const lTotB = (o: CutInput) => (lIsL(o) ? lJackB(o) + lFullB(o) : 0);
const lCut = (o: CutInput) => (o.roofEnd === "รางน้ำ" ? 10.2 : o.roofEnd === "ยื่นปลาย" ? 10 : 12.5);
const lSag = (o: CutInput) => (o.hipMode ?? "ยุบ") === "ยุบ";
// แถวแปต่อปีก = Σ ต่อช่อง ⌈min(ลึกหัวช่อง, ลึกท้ายช่อง)/50⌉+1
function lPurlinRows(o: CutInput, wing: "A" | "B"): number {
  if (wing === "B" && !lIsL(o)) return 0;
  const [pitch, nr, near, far] = wing === "A"
    ? [lPitchA(o), lNrA(o), o.PB ?? 0, o.PA ?? 0]
    : [lPitchB(o), lNrB(o), o.PA ?? 0, o.PB ?? 0];
  if (!pitch || nr < 2 || !near) return 0;
  let sum = 0;
  for (let k = 1; k <= 30 && k <= nr - 1; k++) {
    const d = (x: number) => (x >= near ? far : lSag(o) ? (x / near) * far : (1 - x / near) * far);
    sum += ceil(Math.min(d((k - 1) * pitch), d(k * pitch)) / 50) + 1;
  }
  return sum;
}
const lJackLen = (o: CutInput, j: number, wing: "A" | "B") =>
  wing === "A"
    ? r1((lSag(o) ? (j * lPitchA(o)) / (o.PB || 1) : 1 - (j * lPitchA(o)) / (o.PB || 1)) * lRaftA(o))
    : r1((lSag(o) ? (j * lPitchB(o)) / (o.PA || 1) : 1 - (j * lPitchB(o)) / (o.PA || 1)) * lRaftB(o));
const L_JACK_ROWS = 8; // ⚠ ไฟล์รองรับแค่ 5 แถว/ปีก (เกิน 5 ไฟล์ตกจันทันเงียบ) — โค้ดทำ 8
export const AWNING_L: CutSpec = {
  id: "awning_l", name: "กันสาด ตัวแอล / เพิงตรง", stockLen: 600, rails: [],
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "shape", label: "รูปแบบ", choices: ["ตัวแอล", "เพิงตรง"] },
    { key: "LA", label: "ยาวผนัง A (ซม.)", type: "number" },
    { key: "LB", label: "ยาวผนัง B (ซม.)", type: "number" },
    { key: "PA", label: "ยื่น A (ซม.)", type: "number" },
    { key: "PB", label: "ยื่น B (ซม.)", type: "number" },
    { key: "drop", label: "สูง (ตก) (ซม.)", type: "number" },
    { key: "hipMode", label: "มุมตะเข้", choices: ["ยุบ", "นูน"] },
    { key: "roofEnd", label: "ปลายหลังคา", choices: ["รางน้ำ", "ปิดปลาย", "ยื่นปลาย"] },
    { key: "purlin", label: "แป", choices: ["แปคู่", "แปเดี่ยว"] },
  ],
  defaults: { W: 0, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", shape: "ตัวแอล", LA: 400, LB: 300, PA: 150, PB: 120, drop: 18, hipMode: "ยุบ", roofEnd: "รางน้ำ", purlin: "แปคู่" },
  profiles: [
    { name: "จันทันเต็ม A", code: boxCode("1.6×4"), len: (o) => r1(lRaftA(o) - lCut(o)), qty: lFullA },
    ...Array.from({ length: L_JACK_ROWS }, (_, i) => ({
      name: `jack A #${i + 1}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => (i + 1 <= lJackA(o) ? lJackLen(o, i + 1, "A") : 0),
      qty: (o: CutInput) => (i + 1 <= lJackA(o) ? 1 : 0),
    })),
    { name: "จันทันเต็ม B", code: boxCode("1.6×4"), len: (o) => (lIsL(o) ? r1(lRaftB(o) - lCut(o)) : 0), qty: lFullB },
    ...Array.from({ length: L_JACK_ROWS }, (_, i) => ({
      name: `jack B #${i + 1}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => (i + 1 <= lJackB(o) ? lJackLen(o, i + 1, "B") : 0),
      qty: (o: CutInput) => (i + 1 <= lJackB(o) ? 1 : 0),
    })),
    { name: "จันทันตะเข้", code: boxCode("1.6×4"), len: (o) => (lIsL(o) ? lHip(o) : 0), qty: (o) => (lIsL(o) ? 1 : 0), note: "⏳ ไฟล์ยังไม่ใส่ค่าหักชนตะเข้ (B91=0)" },
    { name: "ราง ปีก A", code: "-", len: lEaveA, qty: () => 1 },
    { name: "ราง ปีก B", code: "-", len: lEaveB, qty: (o) => (lIsL(o) ? 1 : 0) },
    { name: "แผ่นหลังคา A", code: "-", len: lRaftA, qty: (o) => ceil((o.LA ?? 0) / sW(o)) },
    { name: "แผ่นหลังคา B", code: "-", len: (o) => (lIsL(o) ? lRaftB(o) : 0), qty: (o) => (lIsL(o) ? ceil((o.LB ?? 0) / sW(o)) : 0) },
    { name: "รางน้ำอลู ปีก A", code: "-", len: lEaveA, qty: (o) => (o.roofEnd === "รางน้ำ" ? 1 : 0) },
    { name: "รางน้ำอลู ปีก B", code: "-", len: lEaveB, qty: (o) => (o.roofEnd === "รางน้ำ" && lIsL(o) ? 1 : 0) },
    { name: "รัดรอบ ผนัง A", code: "-", len: (o) => o.LA ?? 0, qty: () => 1 },
    { name: "รัดรอบ ผนัง B", code: "-", len: (o) => (lIsL(o) ? o.LB ?? 0 : 0), qty: (o) => (lIsL(o) ? 1 : 0) },
    { name: "รัดรอบ ราง A", code: "-", len: lEaveA, qty: () => 1 },
    { name: "รัดรอบ ราง B", code: "-", len: lEaveB, qty: (o) => (lIsL(o) ? 1 : 0) },
    { name: "รัดรอบ ปลาย A", code: "-", len: lRaftA, qty: (o) => (lIsL(o) ? 1 : 2) },
    { name: "รัดรอบ ปลาย B", code: "-", len: (o) => (lIsL(o) ? lRaftB(o) : 0), qty: (o) => (lIsL(o) ? 1 : 0) },
    { name: "แป 1×1½ ปีก A", code: boxCode("1×1.5"), len: (o) => r1(((o.LA ?? 0) - lNrA(o) * 4.5) / (lNrA(o) - 1)), qty: (o) => lPurlinRows(o, "A") * dblP(o) },
    { name: "แป 1×1½ ปีก B", code: boxCode("1×1.5"), len: (o) => (lIsL(o) ? r1(((o.LB ?? 0) - lNrB(o) * 4.5) / (lNrB(o) - 1)) : 0), qty: (o) => (lIsL(o) ? lPurlinRows(o, "B") * dblP(o) : 0) },
    { name: "ฉาก 6หุน A (เหล็ก)", code: "-", len: (o) => o.LA ?? 0, qty: (o) => ceil((o.LA ?? 0) / 600) },
    { name: "ฉาก 6หุน B (เหล็ก)", code: "-", len: (o) => (lIsL(o) ? o.LB ?? 0 : 0), qty: (o) => (lIsL(o) ? ceil((o.LB ?? 0) / 600) : 0) },
    { name: 'แซด 4" A (เหล็ก)', code: "-", len: (o) => o.LA ?? 0, qty: (o) => ceil((o.LA ?? 0) / 600) },
    { name: 'แซด 4" B (เหล็ก)', code: "-", len: (o) => (lIsL(o) ? o.LB ?? 0 : 0), qty: (o) => (lIsL(o) ? ceil((o.LB ?? 0) / 600) : 0) },
    { name: "เพลทเหล็ก", code: "-", len: () => 0, qty: (o) => 2 * (lTotA(o) + lTotB(o)) },
    { name: "กล่องเหล็ก 1×1 A", code: "-", len: lRaftA, qty: lTotA, note: "⏳ ไฟล์ยังไม่ใส่ค่าหัก (B92=0)" },
    { name: "กล่องเหล็ก 1×1 B", code: "-", len: (o) => (lIsL(o) ? lRaftB(o) : 0), qty: lTotB },
    { name: "กล่องครอบเพลท 1.6×4 A", code: boxCode("1.6×4"), len: (o) => r1(lRaftA(o) / 3), qty: lTotA, note: "⏳ ไฟล์ยังไม่ใส่ค่าหัก (B93=0)" },
    { name: "กล่องครอบเพลท 1.6×4 B", code: boxCode("1.6×4"), len: (o) => (lIsL(o) ? r1(lRaftB(o) / 3) : 0), qty: lTotB },
    { name: "ฝาครอบ A (ไวนิล/โพลี)", code: "-", len: lRaftA, qty: (o) => (o.sheet === "ไวนิล" ? ceil((o.LA ?? 0) / sW(o)) : o.sheet === "โพลีตัน" ? lTotA(o) : 0) },
    { name: "ฝาครอบ B", code: "-", len: (o) => (lIsL(o) ? lRaftB(o) : 0), qty: (o) => (!lIsL(o) ? 0 : o.sheet === "ไวนิล" ? ceil((o.LB ?? 0) / sW(o)) : o.sheet === "โพลีตัน" ? lTotB(o) : 0) },
  ],
};

// ㉑ หลังคาจั่วตรง (JR_จั่วหลายด้าน · ชีต "จั่วตรง") — เส้น 600
// หมายเหตุ: JR_กันสาด ชีต2 "หลังคาจั่ว" เป็นรุ่นเก่ากว่า (รายการไม่ตรงกัน) — ไม่พอร์ต รอเจ้าของยืนยันว่าใช้อันไหน
const gSlope = (o: CutInput) => r1(Math.sqrt((o.W / 2) ** 2 + (o.ridgeH ?? 0) ** 2));
const gN = (o: CutInput) => ceil((o.D ?? 0) / sMax(o)) + 1;
const gPitch = (o: CutInput) => r2((o.D ?? 0) / (gN(o) - 1));
const gCutEnd = (o: CutInput) => (o.roofEnd === "รางน้ำ" ? 10.2 : 10);
const gPurRows = (o: CutInput) => ceil(o.W / 2 / 50) + 1;
export const GABLE_STRAIGHT: CutSpec = {
  id: "gable_straight", name: "หลังคาจั่วตรง (1 ช่วง · 2 สโลป)", stockLen: 600, rails: [],
  packBars: true,   // ปัดขึ้นเส้นเต็ม จัดชิ้นลงเส้นจริง — ให้ตรงคิดราคา 4.0
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "D", label: "ยื่น/ลึก D (ซม.)", type: "number" },
    { key: "ridgeH", label: "สูงสัน (ซม.)", type: "number" },
    { key: "purlin", label: "แป", choices: ["แปคู่", "แปเดี่ยว"] },
    { key: "roofEnd", label: "ปลาย", choices: ["รางน้ำ", "ปล่อยปลาย"] },
  ],
  defaults: { W: 400, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", D: 300, ridgeH: 60, purlin: "แปคู่", roofEnd: "รางน้ำ" },
  profiles: [
    { name: "จันทัน 1.6×4 (2 ฝั่ง)", code: boxCode("1.6×4"), len: (o) => r1(gSlope(o) - gCutEnd(o)), qty: (o) => 2 * gN(o) },
    { name: "สัน/อกไก่ 4×4", code: boxCode("4×4"), len: (o) => r1(((o.D ?? 0) - 10.2) / ceil(((o.D ?? 0) - 10.2) / 600)), qty: (o) => ceil(((o.D ?? 0) - 10.2) / 600) },
    { name: "คานตัว T คานนอน 4×4", code: boxCode("4×4"), len: (o) => r1(o.W - 20.4), qty: (o) => gN(o) - 1 },
    { name: "คานตัว T เสาตั้ง 4×4", code: boxCode("4×4"), len: (o) => r1((o.ridgeH ?? 0) - 10.2), qty: (o) => gN(o) - 1 },
    { name: "แป 1×1½", code: boxCode("1×1.5"), len: (o) => r1(gPitch(o) - 4.5), qty: (o) => (gN(o) - 1) * gPurRows(o) * 2 * dblP(o) },
    { name: "รางน้ำอลู", code: "-", len: (o) => r1((o.D ?? 0) / ceil((o.D ?? 0) / 600)), qty: (o) => (o.roofEnd === "รางน้ำ" ? 2 * ceil((o.D ?? 0) / 600) : 0) },
    { name: "รัดรอบ 4×4 (แนวยื่น 2 ข้าง)", code: boxCode("4×4"), len: (o) => r1((o.D ?? 0) / ceil((o.D ?? 0) / 600)), qty: (o) => 2 * ceil((o.D ?? 0) / 600) },
    { name: "รัดรอบ 4×4 (แนวกว้าง ปลาย)", code: boxCode("4×4"), len: (o) => r1(o.W / ceil(o.W / 600)), qty: (o) => ceil(o.W / 600), note: "เว้นฝั่งผนัง = 1 ด้าน" },
    { name: "แผ่นหลังคา (2 สโลป)", code: "-", len: gSlope, qty: (o) => 2 * ceil((o.D ?? 0) / sW(o)) },
  ],
};

// ㉒ กลาสเฮ้าส์ (JR_กลาสเฮ้าส์) — เพิงตรง หลังคา+เสาในตัว
// ⚠ ไฟล์ไม่มีคอลัมน์เส้นสต็อก → 600 (เดา · อิงไฟล์หลังคาอื่นในชุด) · ⚠ ไฟล์ไม่มีแผงค่าหักเลย → จันทัน/เสา ตัดเต็มไม่หักปลาย (รอเจ้าของยืนยัน)
const ghDrop = (o: CutInput) => (o.hiH ?? 0) - (o.loH ?? 0);
const ghRaft = (o: CutInput) => r1(Math.sqrt((o.D ?? 0) ** 2 + ghDrop(o) ** 2));
const ghN = (o: CutInput) => ceil(o.W / sMax(o)) + 1;
export const GLASSHOUSE: CutSpec = {
  id: "glasshouse", name: "กลาสเฮ้าส์ (เพิงตรง · หลังคา+เสาในตัว)", stockLen: 600, rails: [],
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "D", label: "ยาว ทิศลาด (ซม.)", type: "number" },
    { key: "hiH", label: "สูงฝั่งสูง ชนบ้าน (ซม.)", type: "number" },
    { key: "loH", label: "สูงฝั่งต่ำ หน้า (ซม.)", type: "number" },
  ],
  defaults: { W: 400, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", D: 300, hiH: 270, loH: 240 },
  profiles: [
    { name: "จันทันรัดรอบ 4×4 หน้า-หลัง", code: boxCode("4×4"), len: (o) => o.W, qty: () => 2 },
    { name: "จันทันรัดรอบ 4×4 ข้าง (สโลป)", code: boxCode("4×4"), len: ghRaft, qty: () => 2 },
    { name: "จันทันซอย 1.6×4 (ตัวใน)", code: boxCode("1.6×4"), len: ghRaft, qty: (o) => Math.max(ghN(o) - 2, 0) },
    { name: "แป 1×1½", code: boxCode("1×1.5"), len: (o) => r1((o.W - ghN(o) * 4.5) / (ghN(o) - 1)), qty: (o) => (ghN(o) - 1) * (ceil((o.D ?? 0) / 50) + 1) * 2, note: "ไฟล์ ×2 ตายตัว (ไม่มีตัวเลือกแป)" },
    { name: "ราง (เท่ากว้าง)", code: "-", len: (o) => o.W, qty: () => 1 },
    { name: "แผ่นหลังคา", code: "-", len: ghRaft, qty: (o) => ceil(o.W / sW(o)) },
    { name: "เสา 4×4 (ฝั่งต่ำ/หน้า)", code: boxCode("4×4"), len: (o) => o.loH ?? 0, qty: () => 2 },
    { name: "กล่อง 1.6×4 ตั้ง (ฝั่งสูง/บ้าน)", code: boxCode("1.6×4"), len: (o) => o.hiH ?? 0, qty: () => 2 },
  ],
};

/**
 * ㉒.5 กลาสเฮ้าส์หลายด้าน (JR_กลาสเฮ้าส์หลายด้าน · เต็ม) — สูงเท่ากันทั้งหลัง · กว้าง/ยื่นต่อด้าน (สูงสุด 6 ด้าน) · ตะเข้เข้ามุม
 * พอร์ตจากไฟล์ "เต็ม" (มีตาราง ③.5 จันทันรายตัว M:AB) ไม่ใช่ "_ตัวอย่าง" (ย่อ ไม่มี jack) — ไฟล์เต็มละเอียด/แม่นกว่า
 * โครงสร้าง input: side{n}W/side{n}P (n=1..6, ด้านที่ไม่ใช้ = เว้นว่าง/0) + joint{n} (n=1..5, รอยต่อด้าน n↔n+1)
 *   ตรงกับผังไฟล์ (แถว 10-15 = ด้าน 1-6 · แถว 19-23 = รอยต่อ 1-2 .. 5-6) · สูง/ปลายหลังคา/ชนิดแผ่น/แป = ใช้ร่วมทั้งหลัง
 * ⚠ ตาราง MH_SHEET (ระยะจันทัน max + กว้างแผ่น) เป็นของไฟล์นี้เอง แยกจาก ROOF_SHEET ด้านบน — ไฟล์นี้ไวนิล max=100 (ไม่ใช่ 75 แบบ AWNING/GABLE/GLASSHOUSE เดี่ยว) ห้ามปนกัน
 * ตรรกะจันทันรายตัว (③.5): ตำแหน่ง k=0..F-1 ต่อด้าน · ยาว = ROUND(E×MIN(1, ซ้าย, ขวา),1)
 *   ซ้าย = ถ้าไม่ชนตะเข้ฝั่งซ้าย(AD=0)=1 · ชนตะเข้=สัดส่วนระยะจากขอบซ้าย/ยื่นด้านซ้าย (สั้นลงเป็นเส้นตรงเข้าหามุม)
 *   ขวา = ทำนองเดียวกันฝั่งขวา (AE) · ปลายที่ชนตะเข้ (AD/AE≠0) ตำแหน่งริมสุด(k=0 หรือ F-1) จะได้ 0 เสมอ = "ชนตะเข้ ไม่นับ" (ตะเข้เป็นเส้นแยกอยู่แล้ว)
 *   ปลายที่ไม่ชนตะเข้ (ผนัง/เปิดโล่ง) ตำแหน่งริมจะเต็ม (=E) → จัดเป็น "รัดรอบ 4×4" (ขอบ) ไม่ใช่ "1.6×4" (ในตัว/jack)
 * เลขที่ตรวจข้าม 4 ด้านตัวอย่างในไฟล์ (W/P: 400/150, 300/100, 350/200, 200/150 · รอยต่อ 1-2 นูน, 2-3 เว้า, 3-4 นูน · สูง 270/240):
 *   ด้าน1: J=500 F=6 ตำแหน่ง[153,153,153,153,153,0] · ด้าน2: J=250 F=4 [0,58,43.5,0] (ประกบตะเข้ 2 ฝั่ง)
 *   ด้าน3: J=400 F=5 [0,202.2,202.2,134.8,0] · ด้าน4: J=400 F=5 [0,76.5,153,153,153] (ปลายขวา=ขอบเปิด เต็ม 153)
 *   ตะเข้ 1-2=182.8 · 2-3=225.6 · 3-4=251.8 (ยืนยันด้วยการจำลองสูตรแยกอิสระ ไม่ใช่จากไฟล์ cache เพราะไฟล์ไม่เก็บค่าที่คำนวณแล้ว)
 * ⏳ จุดที่ไม่ชัวร์ (รอเจ้าของเคาะ):
 *   1) "รัดรอบ 1.6×4 ฝั่งบ้าน" (แถว 45 เฉพาะไฟล์เต็ม) — ไฟล์ให้แค่จำนวนรวม/ด้าน ไม่มีคอลัมน์ยาว · สมมติยาว=ราง(J) เทียบกลาสเฮ้าส์เดี่ยว (ไม่ยืนยัน)
 *   2) "เสา 4×4 ฝั่งต่ำ" / "กล่อง 1.6×4 ตั้ง ฝั่งสูง" (~2/ด้าน) — ไฟล์เขียนชัดว่าเป็น "ตัวเลขรวมเผื่อ ปรับได้" ไม่ใช่ค่าคำนวณแม่น (ไม่ได้หักจำนวนที่รอยต่อลอยอาจใช้ร่วมกัน) — พอร์ตตามไฟล์เป๊ะ (คร่าวๆ) ไม่ได้แก้ให้แม่นกว่า
 *   3) ตะเข้/รัดรอบ ไม่มีค่าหักปลายตัดต่อ (เหมือน AWNING_L B91=0) — ยาวที่คำนวณคือยาวทางเรขาคณิตล้วน ยังไม่หักมุมตัดจริงหน้างาน
 *   4) เส้นสต็อก 600 — ไฟล์ไม่มีคอลัมน์เส้น (เดาจากไฟล์หลังคาอื่นในชุดเดียวกัน เหมือน GLASSHOUSE เดี่ยว/AWNING)
 */
const MH_SIDES = 6;
const MH_POS = 16; // ตำแหน่งจันทันสูงสุดต่อด้าน (ไฟล์ใช้คอลัมน์ M..AB = 16 ตำแหน่ง)
const MH_SHEET: Record<string, { max: number; w: number }> = {
  "ไวนิล": { max: 100, w: 25 }, "ดีไลท์": { max: 100, w: 100 }, "เมทัลชีท": { max: 100, w: 34 },
  "โพลีตัน": { max: 122, w: 122 }, "ชินโคร์ HC": { max: 138, w: 138 }, "ชินโคร์ Sup": { max: 138, w: 138 },
};
const mhSMax = (o: CutInput) => MH_SHEET[o.sheet ?? "ไวนิล"]?.max ?? 100;
const mhSW = (o: CutInput) => MH_SHEET[o.sheet ?? "ไวนิล"]?.w ?? 25;
const mhW = (o: CutInput, i: number): number => Number(o[(`side${i}W`) as keyof CutInput] ?? 0) || 0;
const mhP = (o: CutInput, i: number): number => Number(o[(`side${i}P`) as keyof CutInput] ?? 0) || 0;
const mhActive = (o: CutInput, i: number) => i >= 1 && i <= MH_SIDES && mhW(o, i) > 0;
const mhJoint = (o: CutInput, i: number): string => String(o[(`joint${i}`) as keyof CutInput] ?? "");
const mhDrop = (o: CutInput) => (o.hiH ?? 0) - (o.loH ?? 0);
const mhE = (o: CutInput, i: number) => (mhActive(o, i) ? r1(Math.sqrt(mhP(o, i) ** 2 + mhDrop(o) ** 2)) : 0);
const mhAD = (o: CutInput, i: number): number => {
  if (i <= 1 || !mhActive(o, i) || !mhActive(o, i - 1)) return 0;
  const j = mhJoint(o, i - 1);
  return j === "นูน" ? mhP(o, i - 1) : j === "เว้า" ? -mhP(o, i - 1) : 0;
};
const mhAE = (o: CutInput, i: number): number => {
  if (i >= MH_SIDES || !mhActive(o, i) || !mhActive(o, i + 1)) return 0;
  const j = mhJoint(o, i);
  return j === "นูน" ? mhP(o, i + 1) : j === "เว้า" ? -mhP(o, i + 1) : 0;
};
const mhJ = (o: CutInput, i: number) => (mhActive(o, i) ? mhW(o, i) + mhAD(o, i) + mhAE(o, i) : 0);
const mhF = (o: CutInput, i: number) => (mhActive(o, i) ? ceil(mhJ(o, i) / mhSMax(o)) + 1 : 0);
const mhAF = (o: CutInput, i: number) => { const f = mhF(o, i); return f <= 1 ? 0 : mhJ(o, i) / (f - 1); };
// ยาวจันทันตำแหน่ง k (0-based) ต่อด้าน — ROUND(E×MIN(1,ซ้าย,ขวา),1) · 0=ชนตะเข้ไม่นับ · =E → เต็ม/ไม่ตัด
const mhPos = (o: CutInput, i: number, k: number): number => {
  const f = mhF(o, i);
  if (!mhActive(o, i) || k > f - 1 || k < 0) return 0;
  const e = mhE(o, i), ad = mhAD(o, i), ae = mhAE(o, i), af = mhAF(o, i), j = mhJ(o, i);
  const leftF = ad === 0 ? 1 : (k * af) / Math.abs(ad);
  const rightF = ae === 0 ? 1 : (j - k * af) / Math.abs(ae);
  return r1(e * Math.max(0, Math.min(1, leftF, rightF)));
};
const mhAH = (o: CutInput, i: number) => (mhActive(o, i) ? ceil(mhP(o, i) / 50) + 1 : 0);
// จำนวนแถวแปต่อ "ช่อง" (bay) ระหว่างจันทัน k กับ k+1 — สั้นลงถ้าช่องนั้นเข้าใกล้ตะเข้ (จันทันสองข้างสั้น)
const mhBayRows = (o: CutInput, i: number, k: number): number => {
  const f = mhF(o, i);
  if (!mhActive(o, i) || k > f - 2 || k < 0) return 0;
  const ah = mhAH(o, i), e = mhE(o, i);
  if (e <= 0) return 0;
  const v1 = mhPos(o, i, k), v2 = mhPos(o, i, k + 1);
  return Math.max(ah - ceil((ah - 1) * (1 - Math.min(v1, v2) / e)), 0);
};
const mhI = (o: CutInput, i: number): number => {
  if (!mhActive(o, i)) return 0;
  let s = 0; for (let k = 0; k <= mhF(o, i) - 2; k++) s += mhBayRows(o, i, k);
  return s * (o.purlin === "แปคู่" ? 2 : 1);
};
const mhH = (o: CutInput, i: number) => { const f = mhF(o, i); return f <= 1 ? 0 : r1((mhJ(o, i) - f * 4.5) / (f - 1)); };
const mhK = (o: CutInput, i: number) => (mhActive(o, i) ? ceil(mhJ(o, i) / mhSW(o)) : 0);
// ตะเข้ (มุมลอย) ระหว่างด้าน i กับ i+1 — เฉพาะรอยต่อ "นูน"/"เว้า" (ไม่ใช่ "ชนผนัง"/ว่าง)
const mhHip = (o: CutInput, i: number): number => {
  if (i >= MH_SIDES) return 0;
  const jt = mhJoint(o, i);
  if ((jt !== "นูน" && jt !== "เว้า") || !mhActive(o, i) || !mhActive(o, i + 1)) return 0;
  return r1(Math.sqrt(mhP(o, i) ** 2 + mhP(o, i + 1) ** 2 + mhDrop(o) ** 2));
};
// ตำแหน่งริม (k=0 หรือ F-1) ที่ "ไม่ชนตะเข้" ฝั่งนั้น → ขอบเปิด/ผนัง = รัดรอบ 4×4 (ไม่ใช่ 1.6×4 ในตัว/jack)
const mhIsEdge = (o: CutInput, i: number, k: number) => (k === 0 && mhAD(o, i) === 0) || (k === mhF(o, i) - 1 && mhAE(o, i) === 0);
const MH_SIDE_NUMS = Array.from({ length: MH_SIDES }, (_, si) => si + 1);
const MH_JOINT_NUMS = Array.from({ length: MH_SIDES - 1 }, (_, si) => si + 1);
export const GLASSHOUSE_MULTI: CutSpec = {
  id: "glasshouse_multi", name: "กลาสเฮ้าส์หลายด้าน (ตะเข้/รอยต่อ · สูงสุด 6 ด้าน)", stockLen: 600, rails: [],
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "hiH", label: "สูงฝั่งสูง ชนบ้าน (ซม.)", type: "number" },
    { key: "loH", label: "สูงฝั่งต่ำ หน้า (ซม.)", type: "number" },
    { key: "roofEnd", label: "ปลายหลังคา", choices: ["รางน้ำ", "ปิดปลาย", "ยื่นปลาย"] },
    { key: "purlin", label: "แป", choices: ["แปคู่", "แปเดี่ยว"] },
    ...MH_SIDE_NUMS.flatMap((i) => [
      { key: `side${i}W`, label: `ด้าน ${i} กว้าง (ซม.)`, type: "number" as const },
      { key: `side${i}P`, label: `ด้าน ${i} ยื่น (ซม.)`, type: "number" as const },
      ...(i < MH_SIDES ? [{ key: `joint${i}`, label: `รอยต่อ ${i}-${i + 1}`, choices: ["นูน", "เว้า", "ชนผนัง"] }] : []),
    ]),
  ],
  defaults: {
    W: 0, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", hiH: 270, loH: 240, roofEnd: "รางน้ำ", purlin: "แปคู่",
    side1W: 400, side1P: 150, side2W: 300, side2P: 100, side3W: 350, side3P: 200, side4W: 200, side4P: 150, side5W: 0, side5P: 0, side6W: 0, side6P: 0,
    joint1: "นูน", joint2: "เว้า", joint3: "นูน", joint4: "ชนผนัง", joint5: "ชนผนัง",
  },
  profiles: [
    // จันทันรายตัว ต่อด้าน×ตำแหน่ง (③.5) — ยาวต่างกันตามตะเข้ · รหัสขอบ(4×4)/ในตัว-jack(1.6×4) แยกตามตำแหน่งริม
    ...MH_SIDE_NUMS.flatMap((i) =>
      Array.from({ length: MH_POS }, (_, k) => k).map((k) => ({
        name: `จันทัน ด้าน ${i} #${k + 1}`,
        code: (o: CutInput) => (mhIsEdge(o, i, k) ? boxCode("4×4") : boxCode("1.6×4")),
        len: (o: CutInput) => mhPos(o, i, k),
        qty: (o: CutInput) => (mhActive(o, i) && k <= mhF(o, i) - 1 && mhPos(o, i, k) > 1e-6 ? 1 : 0),
      }))
    ),
    // รัดรอบ 4×4 (ราง) ต่อด้าน — เส้นหลักตามความยาวปรับ J (คนละเส้นกับรางน้ำ/กล่องปิดปลายด้านล่าง)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `รัดรอบ 4×4 (ราง) ด้าน ${i}`, code: boxCode("4×4"),
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (mhActive(o, i) ? 1 : 0),
    })),
    // รัดรอบ 1.6×4 ฝั่งบ้าน (ledger ผนัง) ต่อด้าน — ⏳ ไม่ชัวร์ (ดูหมายเหตุจุด 1 ด้านบน)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `รัดรอบ 1.6×4 ฝั่งบ้าน ด้าน ${i}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (mhActive(o, i) ? 1 : 0),
      note: "⏳ ไฟล์ไม่มีคอลัมน์ยาว (นับรวมอย่างเดียว) — สมมติยาว=ราง(J) เทียบกลาสเฮ้าส์เดี่ยว รอเจ้าของยืนยัน",
    })),
    // เสา 4×4 (ฝั่งต่ำ ~2/ด้าน) — ไฟล์ระบุเป็นค่าเผื่อคร่าวๆ (ปรับได้) ไม่ใช่ค่าคำนวณแม่นที่รอยต่อลอย
    ...MH_SIDE_NUMS.map((i) => ({
      name: `เสา 4×4 (ฝั่งต่ำ) ด้าน ${i}`, code: boxCode("4×4"),
      len: (o: CutInput) => o.loH ?? 0, qty: (o: CutInput) => (mhActive(o, i) ? 2 : 0),
      note: "~2/ด้าน (ค่าเผื่อคร่าวๆ ตามไฟล์ · รอยต่อลอยอาจใช้ร่วมกันได้ ปรับเองหน้างาน)",
    })),
    // กล่อง 1.6×4 ตั้ง (ฝั่งสูง ~2/ด้าน)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `กล่อง 1.6×4 ตั้ง (ฝั่งสูง) ด้าน ${i}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => o.hiH ?? 0, qty: (o: CutInput) => (mhActive(o, i) ? 2 : 0),
      note: "~2/ด้าน (ค่าเผื่อคร่าวๆ ตามไฟล์ · รอยต่อลอยอาจใช้ร่วมกันได้ ปรับเองหน้างาน)",
    })),
    // แป 1×1½ ต่อด้าน — ยาวเฉลี่ยต่อช่อง (ไม่ไล่สั้นลงทีละช่อง เหมือน AWNING_L) · จำนวนสั้นลงใกล้ตะเข้ (mhI)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แป 1×1½ ด้าน ${i}`, code: boxCode("1×1.5"),
      len: (o: CutInput) => mhH(o, i), qty: (o: CutInput) => mhI(o, i),
    })),
    // แผ่นหลังคา ต่อด้าน
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แผ่นหลังคา ด้าน ${i}`, code: "-",
      len: (o: CutInput) => mhE(o, i), qty: (o: CutInput) => mhK(o, i),
    })),
    // ปลายหลังคา ต่อด้าน — ตามตัวเลือก roofEnd (รางน้ำ/ปิดปลาย/ยื่นปลาย=ไม่มี)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `รางน้ำอลู ด้าน ${i}`, code: "-",
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (o.roofEnd === "รางน้ำ" && mhActive(o, i) ? 1 : 0),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `กล่อง 1×4 ปิดปลาย ด้าน ${i}`, code: boxCode("1×4"),
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (o.roofEnd === "ปิดปลาย" && mhActive(o, i) ? 1 : 0),
    })),
    // ตะเข้ (มุมลอย) ระหว่างด้าน i กับ i+1 — เฉพาะรอยต่อ นูน/เว้า
    ...MH_JOINT_NUMS.map((i) => ({
      name: `ตะเข้ ด้าน ${i}-${i + 1}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => mhHip(o, i), qty: (o: CutInput) => (mhHip(o, i) > 0 ? 1 : 0),
      note: "⏳ ไฟล์ยังไม่ใส่ค่าหักเข้ามุม/ตัดต่อ (คล้าย AWNING_L B91=0) — ยาวเรขาคณิตล้วน",
    })),
  ],
};

/**
 * ㉒.6 กันสาดหลายด้าน (JR_กันสาดหลายด้าน.xlsx) — โครง input/③รอยต่อ/④สรุป/⑤แผงแก้ค่า "เหมือน GLASSHOUSE_MULTI เป๊ะ"
 *   (เทียบสูตรทุกเซลล์แถว 1-47 ตรงกัน 100% รวม MH_SHEET ไวนิล max=100 w=25 — ไม่ใช่ 75 แบบ AWNING/GABLE/GLASSHOUSE เดี่ยว)
 *   → ใช้ mh* helper (mhW/mhP/mhActive/mhJoint/mhDrop/mhE/mhAD/mhAE/mhJ/mhF/mhAF/mhPos/mhIsEdge/mhAH/mhBayRows/mhI/mhH/mhK/mhHip)
 *     + MH_SIDES/MH_POS/MH_SIDE_NUMS/MH_JOINT_NUMS/MH_SHEET ร่วมกับ GLASSHOUSE_MULTI ตรงๆ (ห้ามแก้ของเดิม — ใช้ร่วมเฉยๆ)
 *   ส่วนต่าง (เฉพาะกันสาด มีเพลท+เหล็ก — ไม่มีใน GLASSHOUSE_MULTI):
 *   1) ⑦ ค่าหักปลายจันทัน (แถว 63-66, $D$64) — ③.5 จันทันรายตัวของไฟล์นี้เป็น "ยาวตัดจริง" (หักปลายแล้ว) ต่างจาก
 *      GLASSHOUSE_MULTI ที่ไม่มีค่าหักนี้เลย (M8 header เขียนชัด "ยาวตัดจริง (หักปลายแล้ว ⑦)"):
 *        ยื่นปลาย−10 · ปิดปลาย−12.5 · รางน้ำ−10.2 (ค่าเดียวกับ AWNING_L lCut) — หักสม่ำเสมอทุกตำแหน่ง (ไม่ใช่แค่ริม)
 *        แล้ว floor 0 (MAX(...,0)) — ตำแหน่งชนตะเข้ (raw=0) ยังคง 0 เหมือนเดิม
 *   2) ⑥ เหล็ก+ฝาครอบ ต่อด้าน (แถว 53-61 · เฉพาะกันสาด): ฉาก6หุน/แซด4"(เหล็ก) ยาว=B(กว้างดิบ ไม่ใช่ J ที่ปรับรอยต่อ — ตามสูตรไฟล์ตรงๆ)
 *      จำนวน=⌈W/600⌉ · กล่องเหล็ก1×1 ยาว=E(จันทัน)−0(B50) · ครอบเพลท1.6×4 ยาว=E÷3(B49)−0(B51) · ทั้งคู่ จำนวน=จันทันรวม(นับ raw>0)
 *      ฝาครอบ จำนวน=ไวนิล→K(แผ่น) | โพลีตัน→จันทันรวม | อื่นๆ→0 · เพลทเหล็กรวม=2×Σจันทันรวมทุกด้าน (B61)
 * ⏳ จุดไม่ชัวร์ (รอเจ้าของเคาะ — เหมือนที่ GLASSHOUSE_MULTI ทิ้งไว้ + เพิ่มของ ⑥):
 *   - ฝาครอบ ไม่มีคอลัมน์ "ยาว" ในไฟล์ (มีแค่จำนวน) — สมมติยาว=จันทัน(E) ต่อด้าน (เทียบ AWNING_L ที่มีคอลัมน์ยาวชัดเจน=รากเดียวกัน)
 *   - ฉาก6หุน/แซด4" ใช้ B(กว้างดิบ)ไม่ใช่ J — อาจตั้งใจต่างจาก "ราง" (mhJ) จริงๆ หรือพิมพ์ผิดในไฟล์ (พอร์ตตามสูตรเป๊ะ)
 *   - ค่าหักกล่องเหล็ก/ครอบเพลท (B50/B51) = 0 ในไฟล์ (เหมือน AWNING เดี่ยว/AWNING_L)
 *   - รัดรอบ1.6×4ฝั่งบ้าน/เสา4×4/กล่อง1.6×4ตั้ง/ตะเข้ = จุด ⏳ เดียวกับที่ทิ้งไว้ใน GLASSHOUSE_MULTI (ค่าเผื่อคร่าวๆ/ไม่มีค่าหักมุมตัด)
 */
const amEndCut = (o: CutInput) => (o.roofEnd === "รางน้ำ" ? 10.2 : o.roofEnd === "ยื่นปลาย" ? 10 : 12.5); // ปิดปลาย = 12.5
// ยาวตัดจริง (③.5 หลัง ⑦) ต่อตำแหน่ง — raw=0 (ชนตะเข้) คงที่ 0 · ไม่งั้นหัก amEndCut แล้ว floor 0
const amPosCut = (o: CutInput, i: number, k: number): number => {
  const raw = mhPos(o, i, k);
  return raw <= 0 ? 0 : Math.max(r1(raw - amEndCut(o)), 0);
};
// จันทันรวมต่อด้าน (นับตำแหน่ง raw>0 · K54 ในไฟล์) — ใช้ขับจำนวนกล่องเหล็ก/ครอบเพลท/ฝาครอบ(โพลีตัน)/เพลทเหล็กรวม
const amRafterCount = (o: CutInput, i: number): number => {
  if (!mhActive(o, i)) return 0;
  let c = 0;
  for (let k = 0; k <= mhF(o, i) - 1; k++) if (mhPos(o, i, k) > 1e-6) c++;
  return c;
};
export const AWNING_MULTI: CutSpec = {
  id: "awning_multi", name: "กันสาดหลายด้าน (ตะเข้/รอยต่อ · มีเพลท+เหล็ก · สูงสุด 6 ด้าน)", stockLen: 600, rails: [],
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "hiH", label: "สูงฝั่งสูง (ซม.)", type: "number" },
    { key: "loH", label: "สูงฝั่งต่ำ (ซม.)", type: "number" },
    { key: "roofEnd", label: "ปลายหลังคา", choices: ["รางน้ำ", "ปิดปลาย", "ยื่นปลาย"] },
    { key: "purlin", label: "แป", choices: ["แปคู่", "แปเดี่ยว"] },
    ...MH_SIDE_NUMS.flatMap((i) => [
      { key: `side${i}W`, label: `ด้าน ${i} กว้าง (ซม.)`, type: "number" as const },
      { key: `side${i}P`, label: `ด้าน ${i} ยื่น (ซม.)`, type: "number" as const },
      ...(i < MH_SIDES ? [{ key: `joint${i}`, label: `รอยต่อ ${i}-${i + 1}`, choices: ["นูน", "เว้า", "ชนผนัง"] }] : []),
    ]),
  ],
  defaults: {
    W: 0, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", hiH: 270, loH: 240, roofEnd: "รางน้ำ", purlin: "แปคู่",
    side1W: 400, side1P: 150, side2W: 300, side2P: 100, side3W: 350, side3P: 200, side4W: 200, side4P: 150, side5W: 0, side5P: 0, side6W: 0, side6P: 0,
    joint1: "นูน", joint2: "เว้า", joint3: "นูน", joint4: "ชนผนัง", joint5: "ชนผนัง",
  },
  profiles: [
    // ③.5 จันทันรายตัว ต่อด้าน×ตำแหน่ง — ยาวตัดจริง (หัก ⑦ amEndCut แล้ว) · รหัสขอบ(4×4)/ในตัว-jack(1.6×4) เหมือน GLASSHOUSE_MULTI
    ...MH_SIDE_NUMS.flatMap((i) =>
      Array.from({ length: MH_POS }, (_, k) => k).map((k) => ({
        name: `จันทัน ด้าน ${i} #${k + 1}`,
        code: (o: CutInput) => (mhIsEdge(o, i, k) ? boxCode("4×4") : boxCode("1.6×4")),
        len: (o: CutInput) => amPosCut(o, i, k),
        qty: (o: CutInput) => (mhActive(o, i) && k <= mhF(o, i) - 1 && amPosCut(o, i, k) > 1e-6 ? 1 : 0),
      }))
    ),
    // รัดรอบ 4×4 (ราง) ต่อด้าน — เหมือน GLASSHOUSE_MULTI เป๊ะ (แถว 27/45 aggregate ถูกกระจายผ่านโปรไฟล์นี้ + ขอบใน③.5 แล้ว)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `รัดรอบ 4×4 (ราง) ด้าน ${i}`, code: boxCode("4×4"),
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (mhActive(o, i) ? 1 : 0),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `รัดรอบ 1.6×4 ฝั่งบ้าน ด้าน ${i}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (mhActive(o, i) ? 1 : 0),
      note: "⏳ ไฟล์ไม่มีคอลัมน์ยาว (นับรวมอย่างเดียว) — สมมติยาว=ราง(J) เหมือน GLASSHOUSE_MULTI รอเจ้าของยืนยัน",
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `เสา 4×4 (ฝั่งต่ำ) ด้าน ${i}`, code: boxCode("4×4"),
      len: (o: CutInput) => o.loH ?? 0, qty: (o: CutInput) => (mhActive(o, i) ? 2 : 0),
      note: "~2/ด้าน (ค่าเผื่อคร่าวๆ ตามไฟล์ · เหมือน GLASSHOUSE_MULTI)",
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `กล่อง 1.6×4 ตั้ง (ฝั่งสูง) ด้าน ${i}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => o.hiH ?? 0, qty: (o: CutInput) => (mhActive(o, i) ? 2 : 0),
      note: "~2/ด้าน (ค่าเผื่อคร่าวๆ ตามไฟล์ · เหมือน GLASSHOUSE_MULTI)",
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แป 1×1½ ด้าน ${i}`, code: boxCode("1×1.5"),
      len: (o: CutInput) => mhH(o, i), qty: (o: CutInput) => mhI(o, i),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แผ่นหลังคา ด้าน ${i}`, code: "-",
      len: (o: CutInput) => mhE(o, i), qty: (o: CutInput) => mhK(o, i),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `รางน้ำอลู ด้าน ${i}`, code: "-",
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (o.roofEnd === "รางน้ำ" && mhActive(o, i) ? 1 : 0),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `กล่อง 1×4 ปิดปลาย ด้าน ${i}`, code: boxCode("1×4"),
      len: (o: CutInput) => mhJ(o, i), qty: (o: CutInput) => (o.roofEnd === "ปิดปลาย" && mhActive(o, i) ? 1 : 0),
    })),
    ...MH_JOINT_NUMS.map((i) => ({
      name: `ตะเข้ ด้าน ${i}-${i + 1}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => mhHip(o, i), qty: (o: CutInput) => (mhHip(o, i) > 0 ? 1 : 0),
      note: "⏳ ไฟล์ยังไม่ใส่ค่าหักเข้ามุม/ตัดต่อ — ยาวเรขาคณิตล้วน",
    })),
    // ⑥ เหล็ก + ฝาครอบ ต่อด้าน — เฉพาะกันสาด (ไม่มีใน GLASSHOUSE_MULTI)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `ฉาก 6 หุน ด้าน ${i}`, code: ANGLE_6,
      len: (o: CutInput) => mhW(o, i), qty: (o: CutInput) => (mhActive(o, i) ? ceil(mhW(o, i) / 600) : 0),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แซด 4" ด้าน ${i}`, code: ZBAR_4,
      len: (o: CutInput) => mhW(o, i), qty: (o: CutInput) => (mhActive(o, i) ? ceil(mhW(o, i) / 600) : 0),
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `กล่องเหล็ก 1×1 ด้าน ${i}`, code: "-",
      len: (o: CutInput) => r1(mhE(o, i) - 0), qty: (o: CutInput) => amRafterCount(o, i),
      note: "⏳ ค่าหักกล่องเหล็ก (⑤ B50) = 0 ในไฟล์",
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `กล่องครอบเพลท 1.6×4 ด้าน ${i}`, code: boxCode("1.6×4"),
      len: (o: CutInput) => r1(mhE(o, i) / 3 - 0), qty: (o: CutInput) => amRafterCount(o, i),
      note: "จันทัน(E) ÷ 3 (⑤ B49) − 0 (⑤ B51) · ⏳ ค่าหักครอบเพลท=0 ในไฟล์",
    })),
    ...MH_SIDE_NUMS.map((i) => ({
      name: `ฝาครอบ ด้าน ${i}`, code: "-",
      len: (o: CutInput) => mhE(o, i),
      qty: (o: CutInput) => (o.sheet === "ไวนิล" ? mhK(o, i) : o.sheet === "โพลีตัน" ? amRafterCount(o, i) : 0),
      note: "⏳ ไฟล์ไม่มีคอลัมน์ยาว (มีแค่จำนวน) — สมมติยาว=จันทัน(E) ต่อด้าน เทียบ AWNING_L",
    })),
    {
      name: "เพลทเหล็ก (รวมทุกด้าน)", code: "-", len: () => 0,
      qty: (o: CutInput) => 2 * MH_SIDE_NUMS.reduce((s, i) => s + amRafterCount(o, i), 0),
      note: "2 × จันทันรวมทุกด้าน (⑥ B61)",
    },
  ],
};

/**
 * ㉒.7 จั่วหลายด้าน (JR_จั่วหลายด้าน.xlsx ชีต "จั่วหลายด้าน") — สันต่อเนื่องหักมุมหลายด้าน · 2 สโลป
 * ผสม GABLE_STRAIGHT (จันทัน gSlope−cut · สัน/อกไก่ 4×4 · คานตัวT · แป · แผ่นหลังคา 2 สโลป) กับโครง "หลายด้าน" (mh* ของ GLASSHOUSE_MULTI/AWNING_MULTI)
 * ต่างจาก GLASSHOUSE_MULTI/AWNING_MULTI ตรงที่ "ความลึกต่อด้าน" (C=กว้าง/2) และ "จันทันเต็ม"(E) คงที่เท่ากันทุกด้าน (มาจาก o.W + ridgeH ร่วมทั้งหลัง)
 *   มีแค่ "ยื่น(ยาวช่วง)" side{n}D ที่ต่างกันต่อด้าน (ความยาวช่วงตามแนวสันที่หักมุมต่อเนื่อง) — reuse mhJoint/mhSMax/mhSW/MH_SIDES/MH_POS/MH_SIDE_NUMS/MH_JOINT_NUMS ตรงๆ (ห้ามแก้ของเดิม — ใช้ร่วมเฉยๆ)
 *   ตาราง ⑤ ชนิดแผ่น (ไวนิล max=100 กว้าง=25 ฯลฯ) ตรงกับ MH_SHEET เป๊ะ (ไม่ใช่ ROOF_SHEET ที่ GABLE_STRAIGHT ใช้ ไวนิล max=75 — เทียบสูตรแล้วคนละตารางจริง ไม่ใช่พิมพ์ผิด)
 * สูตรตำแหน่งจันทันรายตัว (BH:BW→M:AB, header เขียนชัด "ยาวตัดจริง (หักปลาย⑤)") ตรงกับ mhPos ของ GLASSHOUSE_MULTI เป๊ะ แล้วหัก ปลายจันทัน (⑤ B52=10.2 ตายตัว) เพิ่มอีกชั้น
 *   เหมือน AWNING_MULTI (amPosCut) แต่ค่านี้ไม่สลับตาม roofEnd (คงที่ 10.2 เสมอ ต่างจาก AWNING_MULTI ที่ 10.2/10/12.5 ตามตัวเลือก)
 * เลขตรวจข้ามด้วยมือ (default 4 ด้าน W/D: 400/150→400,300/100→300,350/200→350,200/150→200 ผิด — ใช้ค่าไฟล์จริง 400/300/350/200 · กว้างรวม(o.W)=400 · สูงสัน=60 · รอยต่อ 1-2 นูน,2-3 เว้า,3-4 นูน):
 *   depth คงที่ C=200 ทุกด้าน · E(จันทันเต็ม)=208.8 ทุกด้าน (=SQRT(200²+60²))
 *   ด้าน1: J=600 F=7 ตำแหน่งดิบ[208.8×5, 104.4, 0] → ตัดจริง(−10.2)=[198.6×5, 94.2, 0] (6 เส้นใช้จริง)
 *   ตะเข้ 1-2 = SQRT(200²+200²+60²) = 289.1 (ทุกมุมค่าเดียวกันเพราะ depth คงที่)
 * ⏳ จุดไม่ชัวร์ (รอเจ้าของเคาะ):
 *   1) "ปลายหลังคา" (B6 roofEnd, dropdown ปิดปลาย/ยื่นปลาย/รางน้ำ มีจริงในไฟล์) — สแกนสูตรทั้งชีตแล้ว "ไม่ถูกอ้างในสูตรใดๆเลย" (หัก ปลายจันทัน B52=10.2 ตายตัว ไม่สลับตามค่านี้เหมือน AWNING_MULTI)
 *      → คงอ็อปชั่นไว้เพื่อครบหน้าจอไฟล์ แต่ปัจจุบันไม่มีผลต่อค่าที่คำนวณเลย (พอร์ตตามไฟล์จริง ไม่เดาเงื่อนไขเพิ่มเอง)
 *   2) "ราง/เชิงชาย" (แถวสรุป 35) สูตรไฟล์ = SUM(J10:J15) เฉยๆ (ไม่ ×2) แต่ป้ายกำกับ A35 เขียนว่า "(ยาวรวมต่อฝั่ง ×2)" — ต่างจาก GABLE_STRAIGHT
 *      ที่ "รางน้ำอลู" คูณ 2 ชัดเจนในสูตร (2*CEILING(...)) → พอร์ตตามสูตรจริง (ไม่คูณ2) รอเจ้าของยืนยันว่าป้ายพิมพ์ผิดหรือของจริงต้อง ×2 เอง
 *   3) ไฟล์นี้ไม่มีแถว "รัดรอบ" เลยทั้งชีต (ต่างจาก GLASSHOUSE_MULTI/AWNING_MULTI ที่มี รัดรอบ4×4(ราง)+รัดรอบ1.6×4ฝั่งบ้าน) — พอร์ตตามไฟล์ (ไม่เพิ่มเอง)
 *   4) ตะเข้ ไม่มีค่าหักเข้ามุม/ตัดต่อ (เหมือน GLASSHOUSE_MULTI/AWNING_MULTI) — ยาวเรขาคณิตล้วน
 */
const gmDepth = (o: CutInput) => (o.W ?? 0) / 2;
const gmD = (o: CutInput, i: number): number => Number(o[(`side${i}D`) as keyof CutInput] ?? 0) || 0;
const gmActive = (o: CutInput, i: number) => i >= 1 && i <= MH_SIDES && gmD(o, i) > 0;
const gmE = (o: CutInput) => r1(Math.sqrt(gmDepth(o) ** 2 + (o.ridgeH ?? 0) ** 2));
const gmAD = (o: CutInput, i: number): number => {
  if (i <= 1 || !gmActive(o, i) || !gmActive(o, i - 1)) return 0;
  const j = mhJoint(o, i - 1);
  return j === "นูน" ? gmDepth(o) : j === "เว้า" ? -gmDepth(o) : 0;
};
const gmAE = (o: CutInput, i: number): number => {
  if (i >= MH_SIDES || !gmActive(o, i) || !gmActive(o, i + 1)) return 0;
  const j = mhJoint(o, i);
  return j === "นูน" ? gmDepth(o) : j === "เว้า" ? -gmDepth(o) : 0;
};
const gmJ = (o: CutInput, i: number) => (gmActive(o, i) ? gmD(o, i) + gmAD(o, i) + gmAE(o, i) : 0);
const gmF = (o: CutInput, i: number) => (gmActive(o, i) ? ceil(gmJ(o, i) / mhSMax(o)) + 1 : 0);
const gmAF = (o: CutInput, i: number) => { const f = gmF(o, i); return f <= 1 ? 0 : gmJ(o, i) / (f - 1); };
// ยาวจันทันตำแหน่ง k (0-based) ต่อด้าน (ดิบ ยังไม่หักปลาย) — สูตรเดียวกับ mhPos ของ GLASSHOUSE_MULTI (E คงที่ทุกด้านที่นี่)
const gmPos = (o: CutInput, i: number, k: number): number => {
  const f = gmF(o, i);
  if (!gmActive(o, i) || k > f - 1 || k < 0) return 0;
  const e = gmE(o), ad = gmAD(o, i), ae = gmAE(o, i), af = gmAF(o, i), j = gmJ(o, i);
  const leftF = ad === 0 ? 1 : (k * af) / Math.abs(ad);
  const rightF = ae === 0 ? 1 : (j - k * af) / Math.abs(ae);
  return r1(e * Math.max(0, Math.min(1, leftF, rightF)));
};
// หัก ปลายจันทัน (⑤ B52=10.2 ตายตัว — ไม่สลับตาม roofEnd) · raw=0 (ชนตะเข้) คงที่ 0 · ยาวตัดจริง
const GM_END_CUT = 10.2;
const gmPosCut = (o: CutInput, i: number, k: number): number => {
  const raw = gmPos(o, i, k);
  return raw <= 0 ? 0 : Math.max(r1(raw - GM_END_CUT), 0);
};
// ตำแหน่งริม (k=0 หรือ F-1) ที่ "ไม่ชนตะเข้" ฝั่งนั้น → ขอบเปิด/ผนัง = รัดรอบ 4×4 (ไม่ใช่ 1.6×4 ในตัว/jack) — เหมือน mhIsEdge
const gmIsEdge = (o: CutInput, i: number, k: number) => (k === 0 && gmAD(o, i) === 0) || (k === gmF(o, i) - 1 && gmAE(o, i) === 0);
const gmAH = (o: CutInput) => ceil(gmDepth(o) / 50) + 1;
const gmBayRows = (o: CutInput, i: number, k: number): number => {
  const f = gmF(o, i);
  if (!gmActive(o, i) || k > f - 2 || k < 0) return 0;
  const ah = gmAH(o), e = gmE(o);
  if (e <= 0) return 0;
  const v1 = gmPos(o, i, k), v2 = gmPos(o, i, k + 1);
  return Math.max(ah - ceil((ah - 1) * (1 - Math.min(v1, v2) / e)), 0);
};
const gmI = (o: CutInput, i: number): number => {
  if (!gmActive(o, i)) return 0;
  let s = 0; for (let k = 0; k <= gmF(o, i) - 2; k++) s += gmBayRows(o, i, k);
  return s * (o.purlin === "แปคู่" ? 2 : 1);
};
const gmH = (o: CutInput, i: number) => { const f = gmF(o, i); return f <= 1 ? 0 : r1((gmJ(o, i) - f * 4.5) / (f - 1)); };
const gmK = (o: CutInput, i: number) => (gmActive(o, i) ? ceil(gmJ(o, i) / mhSW(o)) : 0);
// ตะเข้ (มุมลอย) ระหว่างด้าน i กับ i+1 — เฉพาะรอยต่อ "นูน"/"เว้า" · depth เท่ากันทุกด้าน → ยาวเท่ากันทุกมุมที่ตั้งฉาก
const gmHip = (o: CutInput, i: number): number => {
  if (i >= MH_SIDES) return 0;
  const jt = mhJoint(o, i);
  if ((jt !== "นูน" && jt !== "เว้า") || !gmActive(o, i) || !gmActive(o, i + 1)) return 0;
  return r1(Math.sqrt(gmDepth(o) ** 2 + gmDepth(o) ** 2 + (o.ridgeH ?? 0) ** 2));
};
// สัน/อกไก่ 4×4 — สันเดียวต่อเนื่องหักมุมทั้งหลัง (รวมยาวทุกด้าน − หักปลาย 1 ครั้ง หารเส้น 600 เท่าๆกัน) เหมือน GABLE_STRAIGHT (สูตรเดียวกัน แค่ D ตัวเดียว → รวมหลายด้าน)
const GM_RIDGE_CUT = 10.2, GM_TBEAM_H_CUT = 20.4, GM_TBEAM_V_CUT = 10.2, GM_STOCK = 600;
const gmRidgeTotal = (o: CutInput) => MH_SIDE_NUMS.reduce((s, i) => s + (gmActive(o, i) ? gmD(o, i) : 0), 0);
const gmRidgeNet = (o: CutInput) => Math.max(gmRidgeTotal(o) - GM_RIDGE_CUT, 0);
const gmRidgeBars = (o: CutInput) => (gmRidgeNet(o) > 0 ? ceil(gmRidgeNet(o) / GM_STOCK) : 0);
const gmRidgeLen = (o: CutInput) => (gmRidgeBars(o) > 0 ? r1(gmRidgeNet(o) / gmRidgeBars(o)) : 0);
// คานตัวT (คานนอน+เสาตั้ง) — จำนวน = Σ(จำนวนจันทัน−1) ทุกด้านที่ใช้งาน (ตรงสูตร B33/34 = SUM(F)−นับด้านที่ใช้งาน)
const gmTBeamCount = (o: CutInput) => MH_SIDE_NUMS.reduce((s, i) => s + (gmActive(o, i) ? gmF(o, i) - 1 : 0), 0);
export const GABLE_MULTI: CutSpec = {
  id: "gable_multi", name: "จั่วหลายด้าน (สันต่อเนื่องหักมุม · 2 สโลป · สูงสุด 6 ด้าน)", stockLen: 600, rails: [],
  opts: [
    { key: "sheet", label: "ชนิดแผ่น", choices: SHEET_TYPES },
    { key: "ridgeH", label: "สูงสัน (ซม.)", type: "number" },
    { key: "purlin", label: "แป", choices: ["แปคู่", "แปเดี่ยว"] },
    { key: "roofEnd", label: "ปลายหลังคา", choices: ["รางน้ำ", "ปิดปลาย", "ยื่นปลาย"] },
    ...MH_SIDE_NUMS.flatMap((i) => [
      { key: `side${i}D`, label: `ด้าน ${i} ยื่น(ยาวช่วง) (ซม.)`, type: "number" as const },
      ...(i < MH_SIDES ? [{ key: `joint${i}`, label: `รอยต่อ ${i}-${i + 1}`, choices: ["นูน", "เว้า", "ติดบ้าน"] }] : []),
    ]),
  ],
  defaults: {
    W: 400, H: 0, N: 1, rail: "", honk: false, sheet: "ไวนิล", ridgeH: 60, purlin: "แปคู่", roofEnd: "รางน้ำ",
    side1D: 400, side2D: 300, side3D: 350, side4D: 200, side5D: 0, side6D: 0,
    joint1: "นูน", joint2: "เว้า", joint3: "นูน", joint4: "ติดบ้าน", joint5: "ติดบ้าน",
  },
  profiles: [
    // จันทันรายตัว ต่อด้าน×ตำแหน่ง (③.5) — ยาวตัดจริง (หักปลาย ⑤) · รหัสขอบ(4×4)/ในตัว-jack(1.6×4) เหมือน GLASSHOUSE_MULTI · ไม่ ×2 (ต่อ 1 สโลป — ดูแถวถัดไป ×2 รวมสโลป)
    ...MH_SIDE_NUMS.flatMap((i) =>
      Array.from({ length: MH_POS }, (_, k) => k).map((k) => ({
        name: `จันทัน ด้าน ${i} #${k + 1} (×2 สโลป)`,
        code: (o: CutInput) => (gmIsEdge(o, i, k) ? boxCode("4×4") : boxCode("1.6×4")),
        len: (o: CutInput) => gmPosCut(o, i, k),
        qty: (o: CutInput) => (gmActive(o, i) && k <= gmF(o, i) - 1 && gmPosCut(o, i, k) > 1e-6 ? 2 : 0),
      }))
    ),
    // สัน/อกไก่ 4×4 — สันเดียวต่อเนื่องทั้งหลัง (ไม่ ×2 · ใช้ร่วม 2 สโลป)
    {
      name: "สัน/อกไก่ 4×4 (ต่อเนื่องทั้งหลัง)", code: boxCode("4×4"),
      len: gmRidgeLen, qty: gmRidgeBars,
      note: "รวมยาวทุกด้าน (ยื่น) หักปลาย 10.2 ครั้งเดียว หารเส้น 600 เท่าๆกัน — สูตรเดียวกับ GABLE_STRAIGHT",
    },
    // คานตัวT คานนอน+เสาตั้ง 4×4 — ไม่ ×2 (คานคร่อมทั้ง 2 สโลป)
    {
      name: "คานตัวT คานนอน 4×4", code: boxCode("4×4"),
      len: (o: CutInput) => r1((o.W ?? 0) - GM_TBEAM_H_CUT), qty: gmTBeamCount,
      note: "จำนวน = Σ(จำนวนจันทัน−1) ทุกด้านที่ใช้งาน",
    },
    {
      name: "คานตัวT เสาตั้ง 4×4", code: boxCode("4×4"),
      len: (o: CutInput) => r1((o.ridgeH ?? 0) - GM_TBEAM_V_CUT), qty: gmTBeamCount,
      note: "จำนวน = Σ(จำนวนจันทัน−1) ทุกด้านที่ใช้งาน",
    },
    // แป 1×1½ ต่อด้าน — ×2 สโลป (gmI คูณ แปคู่/เดี่ยวไว้ในตัวแล้ว)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แป 1×1½ ด้าน ${i} (×2 สโลป)`, code: boxCode("1×1.5"),
      len: (o: CutInput) => gmH(o, i), qty: (o: CutInput) => 2 * gmI(o, i),
    })),
    // แผ่นหลังคา ต่อด้าน — ×2 สโลป (ยาว = จันทันเต็ม ไม่หักปลาย เหมือน GABLE_STRAIGHT/GLASSHOUSE_MULTI)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `แผ่นหลังคา ด้าน ${i} (×2 สโลป)`, code: "-",
      len: gmE, qty: (o: CutInput) => 2 * gmK(o, i),
    })),
    // ราง/เชิงชาย ต่อด้าน — ⏳ ไม่ ×2 ตามสูตรไฟล์จริง (ดูจุดไม่ชัวร์ข้อ 2 ด้านบน)
    ...MH_SIDE_NUMS.map((i) => ({
      name: `ราง/เชิงชาย ด้าน ${i}`, code: "-",
      len: (o: CutInput) => gmJ(o, i), qty: (o: CutInput) => (gmActive(o, i) ? 1 : 0),
      note: "⏳ สูตรไฟล์ไม่ ×2 (แม้ป้ายเขียน 'ต่อฝั่ง ×2') — รอเจ้าของยืนยัน · roofEnd (รางน้ำ/ปิดปลาย/ยื่นปลาย) ไม่มีผลต่อค่านี้ในไฟล์",
    })),
    // ตะเข้ (มุมลอย) ระหว่างด้าน i กับ i+1 — เฉพาะรอยต่อ นูน/เว้า · ×2 ต่อมุม (หน้า+หลัง 2 สโลป — สูตรไฟล์ 2*SUMPRODUCT(...))
    ...MH_JOINT_NUMS.map((i) => ({
      name: `ตะเข้ ด้าน ${i}-${i + 1} (×2 สโลป)`, code: boxCode("1.6×4"),
      len: (o: CutInput) => gmHip(o, i), qty: (o: CutInput) => (gmHip(o, i) > 0 ? 2 : 0),
      note: "⏳ ไฟล์ยังไม่ใส่ค่าหักเข้ามุม/ตัดต่อ — ยาวเรขาคณิตล้วน (เหมือน GLASSHOUSE_MULTI/AWNING_MULTI)",
    })),
  ],
};

// ㉓ บานระแนง (JR_บานระแนง) — ระแนง / ระแนงสลับ A-B · เส้น 600 ยืนยันในสูตร
const LV_SHOW: Record<string, number> = { "1 cm": 1, "5 cm": 5, '1"': 2.54, '1.5"': 3.81, '1.6"': 4.06, '2"': 5.08, '4"': 10.16 };
const LV_BOX = ["1.6×4", "1×2", "2×4", "1×1.6"];
const lvShow = (s?: string) => LV_SHOW[s ?? '4"'] ?? 10.16;
const lvLen = (o: CutInput) => (o.slatDir === "นอน" ? o.W : o.H);
const lvSpan = (o: CutInput) => (o.slatDir === "นอน" ? o.H : o.W);
const lvAlt = (o: CutInput) => o.slatType === "ระแนงสลับ";
const lvSingle = (o: CutInput) => Math.max(Math.trunc((lvSpan(o) - (o.gapA ?? 2.5)) / (lvShow(o.showA) + (o.gapA ?? 2.5))) + 1, 2);
// ไล่ใบทีละท่อน — A ครบ aRun แล้วสลับ B ครบ bRun · หยุดเมื่อสะสมเกินช่วง
function lvCounts(o: CutInput) {
  const span = lvSpan(o), fA = lvShow(o.showA), fB = lvShow(o.showB);
  const aRun = Math.max(1, Math.round(o.aRun ?? 3)), bRun = Math.max(1, Math.round(o.bRun ?? 5));
  let P = 0, U = 0, a = 0, b = 0, prevA = true;
  for (let k = 1; k <= 200; k++) {
    const isA = (k - 1) % (aRun + bRun) < aRun;
    if (k > 1) U += prevA ? (o.gapA ?? 2.5) : (o.gapB ?? 2.5);
    P += isA ? fA : fB;
    if (P + U <= span + 1e-9) { if (isA) a++; else b++; } else break;
    prevA = isA;
  }
  return { a, b };
}
export const LOUVER_PANEL: CutSpec = {
  id: "louver_panel", name: "บานระแนง (ระแนง / ระแนงสลับ)", stockLen: 600, rails: [],
  opts: [
    { key: "slatDir", label: "แนวเกล็ด", choices: ["นอน", "ตั้ง"] },
    { key: "slatType", label: "ชนิดใบ", choices: ["ระแนง", "ระแนงสลับ"] },
    { key: "boxA", label: "กล่อง A", choices: LV_BOX },
    { key: "showA", label: "โชว์ A", choices: Object.keys(LV_SHOW) },
    { key: "aRun", label: "A กี่ท่อน/ชุด", type: "number" },
    { key: "gapA", label: "ระยะห่าง A (ซม.)", type: "number" },
    { key: "boxB", label: "กล่อง B", choices: LV_BOX },
    { key: "showB", label: "โชว์ B", choices: Object.keys(LV_SHOW) },
    { key: "bRun", label: "B กี่ท่อน/ชุด", type: "number" },
    { key: "gapB", label: "ระยะห่าง B (ซม.)", type: "number" },
  ],
  defaults: { W: 200, H: 240, N: 1, rail: "", honk: false, slatDir: "นอน", slatType: "ระแนง", boxA: "1.6×4", showA: '4"', aRun: 3, gapA: 2.5, boxB: "1×1.6", showB: '1.6"', bRun: 5, gapB: 2.5 },
  profiles: [
    { name: "ใบระแนง A", code: (o) => boxCode(o.boxA ?? "1.6×4"), len: lvLen, qty: (o) => (lvAlt(o) ? lvCounts(o).a : lvSingle(o)) },
    { name: "ใบระแนง B (สลับ)", code: (o) => boxCode(o.boxB ?? "1×1.6"), len: (o) => (lvAlt(o) ? lvLen(o) : 0), qty: (o) => (lvAlt(o) ? lvCounts(o).b : 0) },
    { name: 'โครงดาม 1"×1.6"', code: boxCode("1×1.6"), len: (o) => o.W, qty: (o) => (lvAlt(o) ? 2 : 1) * (o.H <= 250 ? 2 : 3), note: "สลับ = 2 หน้า · สูง>250 = 3 แถว · ⚠ ไฟล์ใช้ W เสมอ (ไม่ตามแนวเกล็ด)" },
  ],
};

// ㉔ บานเลื่อนรางบนเฟรมปกติ (JR_รางบนเฟรมปกติ) — Hafele · SMS / ยูโร
// ⚠ ไฟล์ไม่มีคอลัมน์เส้นสต็อก → 600 (รอเจ้าของ · ชิ้น SMS ปกติ 640)
// ⚠ "แปะนอก" รางบน = W×2 (ยาวเกินเส้น 600) — ไฟล์ตั้งใจว่า "2 ท่อน เท่า W" → จำนวนเส้นจะเพี้ยน (รอเคาะ)
const TR_BEAM: Record<string, number> = { "1×1.6": 2.5, "1.6×1.6": 4.5, "1×3": 2.5, "2×4": 5, "4×4": 10.2, "2×4+4×4": 10.2 };
const trBeam = (o: CutInput) => TR_BEAM[o.beam ?? "2×4"] ?? 5;
const trOut = (o: CutInput) => (o.fit === "แปะนอกชนผนัง" || o.fit === "แปะนอกไปต่อ" ? 1 : 0);
const trDead = (o: CutInput) => (o.sashMode === "อิสระ" ? 0 : o.sashMode === "ลากจูง" ? 1 : 2);
const trSlide = (o: CutInput) => o.N - trDead(o);
const trLock = (o: CutInput) => (o.N === 1 ? 1 : trOut(o) === 1 ? 1 : 2);
const trHook = (o: CutInput) => (o.N === 1 ? 1 : trSlide(o) + trOut(o));
const trOv = (o: CutInput) => Math.max(1, o.N - 1);
const trCsms = (o: CutInput) => (o.fit === "ยัดในช่อง" ? 16.8 : o.fit === "แปะนอกชนผนัง" ? 8.4 : o.handle === "ฝัง" ? 4.3 : 5.9);
const trCeuro = (o: CutInput) => (o.fit === "ยัดในช่อง" ? 5 : o.fit === "แปะนอกชนผนัง" ? 2.5 : 0);
const trSMS = (o: CutInput) => (o.sys ?? "SMS") === "SMS";
export const TOPRAIL_FRAME: CutSpec = {
  id: "toprail_frame", name: "บานเลื่อนรางบนเฟรมปกติ (Hafele · SMS/ยูโร)", stockLen: 600, rails: [],
  opts: [
    { key: "sys", label: "ระบบ", choices: ["SMS", "ยูโร"] },
    { key: "sashMode", label: "รูปแบบบาน", choices: ["อิสระ", "ลากจูง", "เปิดคู่กลาง"] },
    { key: "fit", label: "ช่องปูน", choices: ["ยัดในช่อง", "แปะนอกชนผนัง", "แปะนอกไปต่อ"] },
    { key: "handle", label: "มือจับ (SMS+ไปต่อ)", choices: ["ฝัง", "เมโทร"] },
    { key: "beam", label: "คาน (กล่อง)", choices: ["1×1.6", "1.6×1.6", "1×3", "2×4", "4×4", "2×4+4×4"] },
    ...HANDLE_OPTS_LR,
  ],
  defaults: { W: 360, H: 240, N: 2, rail: "", honk: false, sys: "SMS", sashMode: "อิสระ", fit: "ยัดในช่อง", handle: "ฝัง", beam: "2×4", handleBrand: "Align", handleColor: "อบขาว", handleL: "กุญแจ+ล็อค", handleR: "ล็อค+ดัมมี่" },
  profiles: [
    // คานผสม "2×4+4×4" ห้ามเข้า boxCode ตรงๆ (ได้รหัสผี กล่อง 2"x4+4") → แตก 2 โปรไฟล์เหมือน SlimLux
    { name: "คานรับราง", code: (o) => beamBoxCodes(o.beam ?? "2×4")[0] ?? "-", len: (o) => o.W, qty: () => 1, note: "ตัดเท่าช่อง" },
    { name: "คานรับราง (กล่องตัวที่ 2 — คานผสม)", code: (o) => beamBoxCodes(o.beam ?? "2×4")[1] ?? "-", len: (o) => o.W, qty: (o) => (beamBoxCodes(o.beam ?? "2×4").length > 1 ? 1 : 0) },
    { name: "เสารับบาน (กล่อง)", code: "-", len: (o) => o.H - trBeam(o), qty: (o) => (trOut(o) === 1 ? 1 : 2), note: "ไฟล์ไม่ผูกรหัสกล่อง" },
    { name: "ชนกลางรับบาน", code: "-", len: (o) => o.H - trBeam(o), qty: () => 1, note: "ไฟล์ตั้ง 1 ตายตัว" },
    { name: "รางบน Hafele", code: "-", len: (o) => (o.fit === "ยัดในช่อง" ? o.W - 5 : o.W * 2), qty: trSlide, note: "⚠ แปะนอก = W×2 (ไฟล์ตั้งใจว่า 2 ท่อนเท่า W)" },
    { name: 'ฉาก 4" ปิดราง', code: "-", len: (o) => o.W, qty: () => 2 },
    { name: "เสากุญแจ B20051 (SMS·ตั้ง)", code: "B20051", len: (o) => o.H - trBeam(o) - 5.1, qty: (o) => (trSMS(o) ? trLock(o) : 0) },
    { name: "เสาเกี่ยว B20009 (SMS·ตั้ง)", code: "B20009", len: (o) => o.H - trBeam(o) - 5.1, qty: (o) => (trSMS(o) ? trHook(o) : 0) },
    { name: "ขวางบน/ล่าง B20054 (SMS·นอน)", code: "B20054", len: (o) => (o.W - trCsms(o) - trOv(o) * 4) / o.N, qty: (o) => (trSMS(o) ? 2 * o.N : 0) },
    { name: "เสากุญแจยูโร (ตั้ง)", code: "-", len: (o) => o.H - trBeam(o) - 5.1, qty: (o) => (trSMS(o) ? 0 : trLock(o)), note: "ไฟล์เขียนรหัสว่า 'ยูโร' ไม่ใช่ B####" },
    { name: "เสากุญแจยูโร (นอน 45°)", code: "-", len: (o) => (o.W - trCeuro(o) + trOv(o) * 8) / o.N, qty: (o) => (trSMS(o) ? 0 : 2 * o.N) },
    { name: "ตบเกี่ยวยูโร", code: "-", len: (o) => o.H - trBeam(o) - 5.1, qty: (o) => (trSMS(o) ? 0 : trHook(o)) },
  ],
  // ⑤ อุปกรณ์ toprail (มี SKU · ใช้ตาราง lookup มือจับเดียวกับ SMS) · ล้อ/น็อต = จำนวนบานเลื่อน (C16=trSlide)
  hardware: [
    { name: "ล้อรางบน Hafele 100kg", sku: "JR00544", qty: trSlide, unit: "กล่อง", note: "1/บานเลื่อน" },
    ...handleHardware("LR"),
    { name: "น็อตประกอบบาน 1\"", sku: "JR00864", qty: (o) => 4 * trSlide(o), unit: "ตัว", note: "ไม่มีน็อตเฟรม" },
    { name: "สักหลาด 5×3", sku: "JR00794", unit: "เมตร", noStock: true, note: "กรอบบาน+เฟรมข้าง (สะสมม้วน)",
      qty: (o, ctx) => {
        const post = trSMS(o) ? ctx.len("เสากุญแจ B20051 (SMS·ตั้ง)") : ctx.len("เสากุญแจยูโร (ตั้ง)");
        const cross = trSMS(o) ? ctx.len("ขวางบน/ล่าง B20054 (SMS·นอน)") : ctx.len("เสากุญแจยูโร (นอน 45°)");
        return Math.round((4 * (post + cross) * trSlide(o) + 2 * o.H) / 100 * 10) / 10;
      } },
    { name: "ไกด์ดำ", sku: "JR00558", qty: (o) => (o.sashMode === "ลากจูง" ? 1 : 2), unit: "ตัว", note: "เปิดคู่กลาง/อิสระ 2 · ลากจูง 1 · สโตร์ JR00558 ไกด์รางแขวน-ดำ (ไฟล์ตัดไม่ได้ใส่รหัสไว้)" },
  ],
};


/**
 * ㉕ เฟี้ยมยก (JR_เฟี้ยมยก.xlsx sheet "JR คำนวณ" · ไฟล์เป็น ซม. อยู่แล้ว)
 * = เฟี้ยมยูโรหมุน 90° (พับขึ้น) — โปรไฟล์/อุปกรณ์ชุดเดียวกับ EURO_BIFOLD เป๊ะ เปลี่ยนเฉพาะ "ระยะตัด"
 * ⚠ N คงที่ 2 บาน (ไฟล์ล็อกไว้ C7=2 · สูตรกรอบ/คิ้ว ÷2 ตายตัว) — ไม่ใช่ตัวแปร
 * ค่าหักทุกตัวมาจากแผง ⑦ ในไฟล์ (F32-F43) ห้ามเดา:
 *   เฟรมข้าง 2 · เฟรมล่าง 11 · เฟรมบน 0 · คิ้วเฟรมบน 15 · ตบตั้ง 6.5 · ตบนอน 11
 *   กรอบตั้ง 8.2 (แล้ว ÷2) · กรอบนอน 12.4 · คิ้วกระจกตั้ง 39.5 (แล้ว ÷2) · คิ้วกระจกนอน 24
 *   กระจกหักจากกรอบ 13 (ไฟล์เขียน "ยืนยันพี่ JR") · เส้นสต็อก 640
 * ⚠ ชื่อโปรไฟล์ในไฟล์วงเล็บ "(เดิมเฟรมบน)/(เดิมเฟรมข้าง)" ไว้เตือนว่าหมุน 90° แล้วบทบาทสลับ — คงชื่อตามไฟล์
 */
export const EURO_LIFT: CutSpec = {
  id: "euro_lift",
  name: "เฟี้ยมยก (พับขึ้น · 2 บาน)",
  stockLen: 640,
  rails: [],
  opts: [{ key: "glass", label: "กระจก (มม.)", type: "number" }],
  defaults: { W: 200, H: 120, N: 2, rail: "", honk: false, glass: 6 },
  profiles: [
    { name: "เฟรมข้าง (เดิมเฟรมบน)", code: "F7968", len: (o) => o.H - 2, qty: () => 2 },
    { name: "เฟรมล่าง", code: "F7969", len: (o) => o.W - 11, qty: () => 1 },
    { name: "เฟรมบน (เดิมเฟรมข้าง)", code: "F7970", len: (o) => o.W - 0, qty: () => 1 },
    { name: "คิ้วเฟรมบน", code: "F7971", len: (o) => o.W - 15, qty: () => 1 },
    { name: "ตบปิดเฟรม ตั้ง (ข้าง)", code: "F7973", len: (o) => o.H - 6.5, qty: () => 2 },
    { name: "ตบปิดเฟรม นอน (ล่าง)", code: "F7973", len: (o) => o.W - 11, qty: () => 1 },
    { name: "กรอบบาน ตั้ง", code: "F7972", len: (o) => (o.H - 8.2) / 2, qty: () => 4 },
    { name: "กรอบบาน นอน", code: "F7972", len: (o) => o.W - 12.4, qty: () => 4 },
    { name: "คิ้วกระจก ตั้ง", code: "F7935", len: (o) => (o.H - 39.5) / 2, qty: () => 4 },
    { name: "คิ้วกระจก นอน", code: "F7935", len: (o) => o.W - 24, qty: () => 4 },
  ],
  // อุปกรณ์ชุดเดียวกับชีตถอดทุน "คิดทุน เฟี้ยมยก" (เจ้าของสั่งเติม 24 ส.ค.69 — ไฟล์ตัดประกอบมีแต่เส้นอลู ช่างเปิดใบตัดแล้วไม่เห็นบานพับ)
  //   HD-641 = กว้าง ≤270 ซม. ใช้ 7 · เกิน = 10 (ตามสูตรคิดราคา) · HD-213/HD-200 คิดต่อบาน (เฟี้ยมยก N=2)
  hardware: [
    { name: "HD-640 บานพับล้อบน", sku: "HD-640", qty: () => 1, unit: "ตัว" },
    { name: "HD-641 บานพับเฟี้ยม", sku: "HD-641", qty: (o) => (o.W <= 270 ? 7 : 10), unit: "ตัว" },
    { name: "HD-642 บานพับมือจับ", sku: "HD-642", qty: () => 1, unit: "ตัว" },
    { name: "HD-643 บานพับไกด์ล่าง", sku: "HD-643", qty: () => 1, unit: "ตัว" },
    { name: "HD-474 มือจับกลอน", sku: "JR00213", qty: () => 1, unit: "ตัว" },
    { name: "HD-312 ตลับกลอนล็อค", sku: "HD-312", qty: () => 1, unit: "ตัว" },
    { name: "HD-1180 ก้านสไลด์", sku: "HD-1180", qty: () => 2, unit: "ตัว" },
    { name: "HD-213 ฉากเข้ามุม", sku: "HD-213", qty: (o) => 4 * o.N, unit: "ตัว" },
    { name: "HD-200 ฉากประคองมุม", sku: "HD-200", qty: (o) => 12 * o.N, unit: "ตัว" },
    // ยาง 3 เส้น — สูตรเดียวกับคิดราคา 4.0 (ชีต "คิดทุน เฟี้ยมยก") · รหัสเจ้าของให้ 28 ส.ค.69
    //   ไฟล์ตัดประกอบมีแต่เส้นอลู ช่างเปิดใบตัดแล้วไม่เห็นยาง (เหมือนเคสอุปกรณ์ HD ที่เจ้าของสั่งเติมไปแล้ว)
    { name: "ยางอัด", sku: "JR00768", qty: (o) => Math.round(2 * ((o.W - 25.4) + ((o.H - 8.2) / 2 - 13)) * o.N / 100 * 100) / 100, unit: "ม." },
    { name: "ยางรอง", sku: "JR00769", qty: (o) => Math.round(2 * ((o.W - 25.4) + ((o.H - 8.2) / 2 - 13)) * o.N / 100 * 100) / 100, unit: "ม." },
    { name: "ยางลูกโป่ง 6mm", sku: "JR00770", qty: (o) => Math.round(2 * ((o.W - 12.4) + ((o.H - 8.2) / 2)) * o.N / 100 * 100) / 100, unit: "ม." },
  ],
};

export const CUT_SPECS: CutSpec[] = [
  SMS_SLIDE_FREE, SMS_SLIDE_CENTER, SMS_SLIDE_TOW,
  SLIMLUX_SLIDE, FIXED_PANEL,
  VELORA_SWING, SMS240_BIFOLD, EURO_BIFOLD, EURO_BIFOLD_CORNER, EURO_LIFT,
  FUJI_SLIDE, FUJI_SLIDE_CENTER, FUJI_SLIDE_MULTI, FUJI_SWING, FUJI_DOOR, FUJI_FIX, FUJI_HUNG,
  PC_DOOR, GATE_SLIDE, SOLID_DOOR, WOODJAMB_SWING,
  AWNING, AWNING_L, AWNING_MULTI, GABLE_STRAIGHT, GABLE_MULTI, GLASSHOUSE, GLASSHOUSE_MULTI, LOUVER_PANEL, TOPRAIL_FRAME,
];
export const CUT_SPEC_BY_ID: Record<string, CutSpec> = Object.fromEntries(CUT_SPECS.map((s) => [s.id, s]));
