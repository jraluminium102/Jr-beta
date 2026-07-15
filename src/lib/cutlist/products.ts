/**
 * cutlist/products — สเปกใบตัดต่อรุ่น (นำร่อง SMS เลื่อนอิสระ)
 * พอร์ตสูตรตรงจาก Excel: ตัดประกอบ/JR_SMS_เลื่อนอิสระ_รวม.xlsx (sheet "เลื่อนอิสระ/สลับ")
 * หน่วย ซม. · เส้นสต็อก 6.4 ม. · รหัสอลู B#### ผูกกับสต็อก (sku)
 *
 * ⑦ ค่าหัก (แก้ที่เดียว): เฟรม 4.4 · เสากุญแจ เสียบ6.1/เตี้ย3 · ฝาปิด เสียบ5/เตี้ย2.3
 *   · ขวางบน สปส.4.2 + คงที่11.2 · ตบร่องใน 7
 */
import type { CutSpec } from "./engine";

const isPlug = (rail: string) => rail === "3รางเสียบ"; // 3รางเสียบ → ค่าหัก "เสียบ" · ไม่งั้น "เตี้ย"

export const SMS_SLIDE_FREE: CutSpec = {
  id: "sms_slide_free",
  name: "SMS บานเลื่อนอิสระ/สลับ",
  stockLen: 640, // 6.4 ม. (ซม.)
  rails: ["3รางเสียบ", "รางเตี้ย7มม"],
  defaults: { W: 350, H: 159, N: 3, rail: "3รางเสียบ", honk: false },
  profiles: [
    { name: "เฟรมล่าง", code: (o) => (isPlug(o.rail) ? "B20041" : "B20046"), len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมบน", code: "B20001", len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมข้าง", code: "B20003", len: (o) => o.H, qty: () => 2 },
    { name: "เสากุญแจ ML", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: () => 2 },
    { name: "เสาเกี่ยว", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (o.honk ? o.N - 1 : 2 * (o.N - 1)) },
    { name: "เสาเกี่ยวโหนก", code: "B20010", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (o.honk ? o.N - 1 : 0) },
    { name: "ขวางบน", code: "B20054", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N, qty: (o) => o.N },
    { name: "ขวางล่าง", code: "B20054", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N, qty: (o) => o.N },
    { name: "ฝาปิดเฟรมข้าง", code: "B20019", len: (o) => o.H - (isPlug(o.rail) ? 5 : 2.3), qty: () => 4 },
    { name: "ตบเฟรมบน/ล่าง ร่องใน", code: "-", len: (o) => o.W - 7, qty: (o) => Math.max(3 - o.N, 0) * 2 },
    { name: "เบรคบาน (ธรณี)", code: "B20050", len: (o) => o.W - 4.4, qty: (o) => (o.rail === "รางเตี้ย7มม" ? 2 : 0) },
  ],
};

/**
 * ② SMS เปิดคู่กลาง (sheet "เปิดคู่กลาง") — จำนวนบานคงที่ 4 (Excel หาร 4 ตายตัว)
 * ⚠ ตบร่องกลาง ใช้ +9.7 ตามที่ Excel คำนวณจริง (แผงค่าหักเขียน 11.5 แต่ไม่มีสูตรอ้าง — รอเจ้าของเคาะ)
 * ⚠ เสากุญแจ เตี้ยหัก 3.2 ตามชีตนี้ (ชีตอิสระ/ลากจูง = 3 — รอเจ้าของยืนยันว่าตั้งใจต่าง)
 */
export const SMS_SLIDE_CENTER: CutSpec = {
  id: "sms_slide_center",
  name: "SMS บานเลื่อนเปิดคู่กลาง (4 บาน)",
  stockLen: 640,
  rails: ["3รางเสียบ", "รางเตี้ย7มม"],
  defaults: { W: 350, H: 159, N: 4, rail: "3รางเสียบ", honk: false },
  profiles: [
    { name: "เฟรมล่าง", code: (o) => (isPlug(o.rail) ? "B20041" : "B20046"), len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมบน", code: "B20001", len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมข้าง", code: "B20003", len: (o) => o.H, qty: () => 2 },
    { name: "เสากุญแจมัลติพ้อย", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: () => 2 },
    { name: "เสากุญแจบานตาย", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: () => 2 },
    { name: "เสาเกี่ยว", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: (o) => (o.honk ? 2 : 4) },
    { name: "เสาเกี่ยวโหนก", code: "B20010", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: (o) => (o.honk ? 2 : 0) },
    { name: "ชนกลาง", code: "B20046", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3.2), qty: () => 1 },
    { name: "ขวางบน", code: "B20054", len: (o) => (o.W - 35.3) / 4, qty: () => 4 },
    { name: "ขวางล่าง", code: "B20054", len: (o) => (o.W - 35.3) / 4, qty: () => 4 },
    { name: "ฝาปิดเฟรมข้าง", code: "B20019", len: (o) => o.H - (isPlug(o.rail) ? 5 : 2.3), qty: () => 4 },
    { name: "ตบเฟรมบน/ล่าง ร่องใน", code: "-", len: (o) => o.W - 7, qty: () => 2 },
    { name: "ตบเฟรมบน/ล่าง ร่องกลาง", code: "-", len: (o) => (o.W - 4.4) - 2 * ((o.W - 35.3) / 4 + 9.7), qty: () => 2, note: "เฟรมบน − 2×(ขวางล่าง+9.7)" },
    { name: "เบรคบาน (ธรณี)", code: "B20050", len: (o) => o.W - 4.4, qty: (o) => (o.rail === "รางเตี้ย7มม" ? 2 : 0) },
  ],
};

/** ③ SMS ลากจูง (sheet "ลากจูง" · กองข้างเดียว) — N=3 ลากจูง · N=2 เลื่อนเดี่ยว · รหัสเสากุญแจไฟล์พิมพ์ "20051" (ตกตัว B → ใช้ B20051) */
export const SMS_SLIDE_TOW: CutSpec = {
  id: "sms_slide_tow",
  name: "SMS บานเลื่อนลากจูง (กองข้างเดียว)",
  stockLen: 640,
  rails: ["3รางเสียบ", "รางเตี้ย7มม"],
  defaults: { W: 200, H: 240, N: 3, rail: "3รางเสียบ", honk: false },
  profiles: [
    { name: "เฟรมล่าง", code: (o) => (isPlug(o.rail) ? "B20041" : "B20046"), len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมบน", code: "B20001", len: (o) => o.W - 4.4, qty: () => 1 },
    { name: "เฟรมข้าง", code: "B20003", len: (o) => o.H, qty: () => 2 },
    { name: "เสากุญแจ ML", code: "B20051", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: () => 2 },
    { name: "เสาเกี่ยว", code: "B20009", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (o.honk ? o.N - 1 : 2 * (o.N - 1)) },
    { name: "เสาเกี่ยวโหนก", code: "B20010", len: (o) => o.H - (isPlug(o.rail) ? 6.1 : 3), qty: (o) => (o.honk ? o.N - 1 : 0) },
    { name: "ขวางบน", code: "B20054", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N, qty: (o) => o.N },
    { name: "ขวางล่าง", code: "B20054", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N, qty: (o) => o.N },
    { name: "ฝาปิดเฟรมข้าง", code: "B20019", len: (o) => o.H - (isPlug(o.rail) ? 5 : 2.3), qty: () => 4 },
    { name: "ตบร่องบานเลื่อน", code: "-", len: (o) => (o.W - 4.2 * o.N - 11.2) / o.N + 4.7, qty: () => 2, note: "ขวางบน + 4.7" },
    { name: "ตบร่องบานตาย", code: "-", len: (o) => (o.W - 4.4) - (o.W - 4.2 * o.N - 11.2) / o.N - 11, qty: () => 2, note: "เฟรมบน − ขวางบน − 11" },
    { name: "เบรคบาน (ธรณี)", code: "B20050", len: (o) => o.W - 4.4, qty: (o) => (o.rail === "รางเตี้ย7มม" ? 2 : 0) },
  ],
};

/**
 * ④ SlimLux บานเลื่อนรางบน (JR_SlimLux_บานเลื่อน.xlsx)
 * ⚠ ชีตไม่มีคอลัมน์เส้นสต็อก → ใส่ 640 ไว้ก่อน (TODO เจ้าของยืนยัน)
 * ⚠ ตบเรียบบานตาย: Excel จำนวน = 0 คงที่ (F57) ไม่ผูกจำนวนบานตาย — พอร์ตตาม (แก้มือเมื่อมีบานตาย)
 * รหัสรุ่นเป็น OPK/XSW/WM (ไม่ใช่ B####) — ถ้าจะผูกสต็อกต้องมี sku พวกนี้ในหน้าสต๊อก
 */
const slimBeamCut = (beam?: string) =>
  ({ "1×2": 2.5, "2×2": 5, "1×4": 2.5, "2×4": 5, "1×4+1×1.6": 2.5, "2×4+4×4": 10.2, "4×4": 10.2 } as Record<string, number>)[beam ?? "1×4"] ?? 2.5;
const slimDead = (m?: string) => (m === "ลากจูง" ? 1 : m === "เปิดคู่กลาง" ? 2 : 0);

export const SLIMLUX_SLIDE: CutSpec = {
  id: "slimlux_slide",
  name: "SlimLux บานเลื่อนรางบน",
  stockLen: 640, // TODO: ยืนยันความยาวเส้นสต็อก SlimLux — Excel ไม่มีคอลัมน์นี้
  rails: [],
  opts: [
    { key: "fit", label: "รูปแบบช่องปูน", choices: ["ยัดในช่อง", "แปะนอก"] },
    { key: "sashMode", label: "รูปแบบบาน", choices: ["อิสระ", "ลากจูง", "เปิดคู่กลาง"] },
    { key: "beam", label: "คาน (กล่อง)", choices: ["1×2", "2×2", "1×4", "2×4", "1×4+1×1.6", "2×4+4×4", "4×4"] },
    { key: "handle", label: "มือจับ", choices: ["X-J", "ไม่มี"] },
  ],
  defaults: { W: 300, H: 240, N: 3, rail: "", honk: false, fit: "ยัดในช่อง", sashMode: "อิสระ", beam: "1×4", handle: "X-J" },
  profiles: [
    { name: "คาน", code: (o) => `กล่อง ${o.beam ?? "1×4"}`, len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W), qty: () => 1, note: "ยัดในช่อง=W · แปะนอก=W×2" },
    { name: "รางบน (รางแขวน)", code: "XSW40008", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W - 5), qty: (o) => o.N - slimDead(o.sashMode), note: "จำนวน = บานเลื่อน" },
    { name: "เสารับบาน", code: (o) => (o.N === 1 ? "กล่อง 1×2" : o.N === 2 ? "กล่อง 1×4" : "กล่อง 1×3"), len: (o) => o.H - slimBeamCut(o.beam), qty: (o) => (o.fit === "แปะนอก" ? 1 : 2) },
    { name: "บังใบ 4 หุน", code: "-", len: (o) => o.H - slimBeamCut(o.beam) - 3.6, qty: () => 2 },
    { name: "ขวางบน-ล่าง", code: "OPK-A201", len: (o) => (o.fit === "แปะนอก" ? (o.W - 0.8) / o.N + 0.2 * o.N : (o.W - 5) / o.N + 0.2 * o.N), qty: (o) => 2 * o.N },
    { name: "เสากุญแจ", code: "OPK-A202", len: (o) => o.H - slimBeamCut(o.beam) - 12.1, qty: (o) => 2 * o.N },
    { name: "ตบเรียบหน้าเสากุญแจ (บานเลื่อน)", code: "OPK-A203", len: (o) => o.H - slimBeamCut(o.beam) - 5.1, qty: (o) => (o.fit === "แปะนอก" ? 1 : 2) },
    { name: "ตบเรียบหน้าเสากุญแจ (บานตาย)", code: "OPK-A203", len: (o) => o.H - slimBeamCut(o.beam), qty: () => 0, note: "Excel = 0 คงที่ (แก้มือเมื่อมีบานตาย — รอเจ้าของเคาะสูตร)" },
    { name: "ตบเกี่ยวใส่สักหลาด", code: "OPK-A204", len: (o) => o.H - slimBeamCut(o.beam) - 5.1, qty: (o) => o.N - slimDead(o.sashMode) + 1 + (o.fit === "แปะนอก" ? 1 : 0), note: "บานเลื่อน+1 (+1 ถ้าแปะนอก)" },
    { name: "มือจับ X-J (เสามือจับ)", code: "-", len: (o) => o.H - slimBeamCut(o.beam) - 12.1, qty: (o) => (o.handle === "X-J" ? (o.sashMode === "เปิดคู่กลาง" ? 4 : 2) : 0), note: "ยาวเท่าเสากุญแจ" },
    { name: 'ฉากปิดราง 2"', code: "-", len: (o) => o.W, qty: () => 2 },
    { name: "ตบปิดใต้รางริม", code: "WM-K20", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W - 5), qty: () => 2, note: "ยาวเท่ารางบน" },
    { name: "ตบปิดใต้รางกลาง", code: "WM-K20", len: (o) => (o.fit === "แปะนอก" ? o.W * 2 : o.W - 5), qty: (o) => Math.max(o.N - slimDead(o.sashMode) - 1, 0), note: "บานเลื่อน − 1" },
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
    { name: "กล่อง 1.6×3 — ตั้ง", code: "-", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? o.N + 1 : 0) },
    { name: "กล่อง 1.6×3 — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? 2 * o.N : 0) },
    { name: "9014 คัลเทิลวอล — ตั้ง", code: "-", len: (o) => o.H, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? o.N + 1 : 0) },
    { name: "9014 คัลเทิลวอล — นอน", code: "-", len: (o) => o.W - 9, qty: (o) => (boxIs(o, "กล่อง 1.6×3 + 9014") ? 2 * o.N : 0) },
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
    { name: "เทปหนุนกระจก", qty: (o) => Math.round(((2 * o.W + 2 * o.H) * o.N) / 100 * 10) / 10, unit: "ม." },
  ],
};

/**
 * ⑥ Velora บานเปิด (JR_Velora_บานเปิด.xlsx · 1 บาน/ชุด — หลายบานใช้ "ชุด")
 * rail = รูปแบบใส่ช่อง (ยัดในช่อง/ครอบวงกบ) · ⚠ ไฟล์ไม่มีรหัสอลู + ไม่ระบุเส้นสต็อก (ใส่ 640 รอเจ้าของ)
 */
const vFit = (rail: string) => rail === "ยัดในช่อง";
export const VELORA_SWING: CutSpec = {
  id: "velora_swing",
  name: "Velora บานเปิด",
  stockLen: 640, // TODO: ไฟล์ไม่ระบุ — รอเจ้าของยืนยัน
  rails: ["ยัดในช่อง", "ครอบวงกบ"],
  defaults: { W: 220, H: 200, N: 1, rail: "ยัดในช่อง", honk: false },
  profiles: [
    { name: "วงกบบน", code: "-", len: (o) => o.W + (vFit(o.rail) ? 0 : 2), qty: () => 1, note: "ตัด 45° 2 ฝั่ง" },
    { name: "วงกบข้าง", code: "-", len: (o) => o.H + (vFit(o.rail) ? 0 : 1), qty: () => 2, note: "ตัด 45° 1 ฝั่ง" },
    { name: "กรอบบาน แนวนอน", code: "-", len: (o) => o.W - (vFit(o.rail) ? 5.7 : 3.5), qty: () => 2, note: "เข้ามุม 45°" },
    { name: "กรอบบาน แนวตั้ง", code: "-", len: (o) => o.H - (vFit(o.rail) ? 3.3 : 2.2), qty: () => 2, note: "เข้ามุม 45°" },
    { name: "ลูกฟูก 2 ทาง แนวตั้ง", code: "-", len: (o) => o.H + (vFit(o.rail) ? 0 : 1), qty: (o) => (vFit(o.rail) ? 2 : 0) },
    { name: "ลูกฟูก 2 ทาง แนวนอน", code: "-", len: (o) => o.W + (vFit(o.rail) ? 0 : 2), qty: (o) => (vFit(o.rail) ? 1 : 0) },
  ],
  hardware: [
    { name: "บานพับ", qty: () => 4, unit: "ตัว" },
    { name: "มือจับ (ล็อค)", qty: () => 1, unit: "ชุด" },
    { name: "ซิลิโคน ใน+นอก", qty: (o) => Math.ceil(((2 * (o.W + o.H)) / 100) * 2 / 12.5), unit: "หลอด" },
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
const smsSashW = (o: { W: number; rail: string; N: number }) => (o.W - smsCfg(o).d - 11.325 * (smsN(o) - 1)) / smsN(o);
const smsBead = (o: { glass?: number }) => (Number(o.glass ?? 6) <= 6 ? "B24008" : Number(o.glass ?? 6) <= 12 ? "B24016" : "B24013");

export const SMS240_BIFOLD: CutSpec = {
  id: "sms240_bifold",
  name: "SMS 240 บานเฟี้ยม (HOMELIFE)",
  stockLen: 640,
  rails: Object.keys(SMS240_CFG),
  opts: [{ key: "glass", label: "กระจก (มม.)", type: "number" }],
  defaults: { W: 350, H: 250, N: 4, rail: "2L2R", honk: false, glass: 6 },
  profiles: [
    { name: "เฟรมบน", code: "B24001", len: (o) => o.W - 6, qty: () => 1 },
    { name: "บังใบบน", code: "B24002", len: (o) => o.W - 8.6, qty: () => 1 },
    { name: "เฟรมล่าง", code: "B24003", len: (o) => o.W - 6, qty: () => 1 },
    { name: "ตัวตับธรณี", code: "B24004", len: (o) => o.W - 6, qty: () => 1 },
    { name: "เฟรมข้าง (ซ้าย+ขวา)", code: "B24005", len: (o) => o.H, qty: () => 2 },
    { name: "บังใบข้าง (ซ้าย+ขวา)", code: "B24006", len: (o) => o.H - 9.6, qty: () => 2 },
    { name: "ขวางบน+ล่าง", code: "B24007", len: smsSashW, qty: (o) => 2 * smsN(o) },
    { name: "เสา", code: "B24007", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).post },
    { name: "เสากุญแจ", code: "B24007", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).lock },
    { name: "เสากุญแจมือจับ", code: "B24007", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).handle },
    { name: "บังใบ (บานสวิง)", code: "B24009", len: (o) => o.H - 9.2, qty: (o) => smsCfg(o).stop },
    { name: "คิ้วตบกระจกแนวนอน", code: smsBead, len: smsSashW, qty: (o) => 2 * smsN(o) },
    { name: "คิ้วตบกระจกแนวตั้ง", code: smsBead, len: (o) => o.H - 24.2, qty: (o) => 2 * smsN(o) },
  ],
  // กระจก (ไม่ใช่เส้นตัดอลู): (H−21.5) × (ขวาง−1.3) ซม. × N แผ่น
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
  // กระจก: (ขวาง−13มม.=1.3ซม.… ตามไฟล์ (sashW−1.3)×(sashH−1.3) × N แผ่น · ฮาร์ดแวร์ HD-### LUT รอเฟสถัดไป
};

export const CUT_SPECS: CutSpec[] = [
  SMS_SLIDE_FREE, SMS_SLIDE_CENTER, SMS_SLIDE_TOW,
  SLIMLUX_SLIDE, FIXED_PANEL,
  VELORA_SWING, SMS240_BIFOLD, EURO_BIFOLD,
];
export const CUT_SPEC_BY_ID: Record<string, CutSpec> = Object.fromEntries(CUT_SPECS.map((s) => [s.id, s]));
