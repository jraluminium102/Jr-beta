/**
 * cutlist/products — สเปกใบตัดต่อรุ่น (นำร่อง SMS เลื่อนอิสระ)
 * พอร์ตสูตรตรงจาก Excel: ตัดประกอบ/JR_SMS_เลื่อนอิสระ_รวม.xlsx (sheet "เลื่อนอิสระ/สลับ")
 * หน่วย ซม. · เส้นสต็อก 6.4 ม. · รหัสอลู B#### ผูกกับสต็อก (sku)
 *
 * ⑦ ค่าหัก (แก้ที่เดียว): เฟรม 4.4 · เสากุญแจ เสียบ6.1/เตี้ย3 · ฝาปิด เสียบ5/เตี้ย2.3
 *   · ขวางบน สปส.4.2 + คงที่11.2 · ตบร่องใน 7
 */
import type { CutSpec, CutInput } from "./engine";

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
  stockLen: 600, // เจ้าของยืนยัน: เส้น 6 ม. (เสากุญแจมี 2 ขนาด 4.8/6 → ระบุ stockLens ต่อโปรไฟล์)
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
    { name: "เสากุญแจ", code: "OPK-A202", len: (o) => o.H - slimBeamCut(o.beam) - 12.1, qty: (o) => 2 * o.N, stockLens: [480, 600], note: "เส้นมี 2 ขนาด 4.8/6 ม. — เลือกอันคุ้มสุด" },
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
export const FUJI_SLIDE: CutSpec = {
  id: "fuji_slide", name: "FUJI บานเลื่อนสลับ (2/3 ราง)", stockLen: 640,
  rails: ["2ราง", "3ราง"],
  defaults: { W: 350, H: 240, N: 2, rail: "2ราง", honk: false },
  profiles: [
    { name: "เฟรมข้าง", code: "F7978", len: (o) => o.H, qty: () => 2 },
    { name: "เฟรม บน-ล่าง", code: "F7976", len: (o) => o.W - 4.2, qty: () => 2 },
    { name: "ตบกันสาด", code: "F7992", len: (o) => o.W, qty: () => 1 },
    { name: "เสา", code: "F7980", len: (o) => o.H - 7.4, qty: (o) => 2 * frc(o).p },
    { name: "ขวาง", code: "F7980", len: fSash, qty: (o) => 2 * frc(o).p, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: "F7919", len: (o) => o.H - 7.4 - 15.6, qty: (o) => 2 * frc(o).p },
    { name: "คิ้ว ขวาง", code: "F7919", len: (o) => fSash(o) - 12.6, qty: (o) => 2 * frc(o).p, note: "อลูเดียวกับคิ้วตั้ง" },
    { name: "ตบเกี่ยว", code: "F7983", len: (o) => o.H - 7.4, qty: (o) => frc(o).hook },
    { name: "ยูข้าง", code: "F7986", len: (o) => o.H - 9.0, qty: () => 2 },
    { name: "ตบเฟรมบน", code: "F7993", len: (o) => o.W - 4.2, qty: () => 3, stockLens: [500] },
    { name: "ตบยูข้าง", code: "F7988", len: (o) => o.H - 9.0, qty: () => 2 },
    { name: "ปิดตบเกี่ยว", code: "-", len: (o) => o.H - 7.4, qty: (o) => frc(o).hook, note: "Excel รวมสต็อกกับ F7988 — รอเจ้าของเคาะรหัส" },
    { name: "ตบกันสาด#2", code: "-", len: (o) => o.W, qty: () => 1, note: "Excel รวมสต็อกกับ F7988 — รอเจ้าของเคาะ" },
    { name: "ราง", code: "F7994", len: (o) => o.W - 4.2, qty: () => 3, stockLens: [500] },
  ],
  hardware: [
    { name: "ล้อ 27", qty: (o) => 2 * frc(o).p, unit: "ตัว" },
    { name: "มือจับ Align", qty: (o) => 2 * frc(o).p, unit: "ตัว" },
    { name: "ชุดล็อค", qty: () => 1, unit: "ชุด" },
    { name: "น็อตประกอบ", qty: () => 4, unit: "ตัว" },
  ],
};

// ⑩ FUJI บานเปิด/กระทุ้ง (casement · JR_FUJI_บานเปิด-บานกระทุ้ง.xlsx)
export const FUJI_SWING: CutSpec = {
  id: "fuji_swing", name: "FUJI บานเปิด (เปิด/กระทุ้ง)", stockLen: 640, rails: [],
  defaults: { W: 80, H: 140, N: 1, rail: "", honk: false },
  profiles: [
    { name: "เฟรมข้าง", code: "F7859", len: (o) => o.H, qty: () => 2 },
    { name: "เฟรม บน", code: "F7859", len: (o) => o.W - 5.0, qty: () => 1, note: "อลูเดียวกับเฟรมข้าง" },
    { name: "เฟรม ล่าง", code: "F7939", len: (o) => o.W - 5.0, qty: () => 1 },
    { name: "เสา", code: "F7943", len: (o) => o.H - 3.7, qty: () => 2 },
    { name: "ขวาง", code: "F7943", len: (o) => o.W - 3.7, qty: () => 2, note: "อลูเดียวกับเสา" },
    { name: "คิ้ว ตั้ง", code: "F7935", len: (o) => o.H - 3.7 - 16.0, qty: () => 2 },
    { name: "คิ้ว ขวาง", code: "F7935", len: (o) => o.W - 3.7 - 12.0, qty: () => 2, note: "อลูเดียวกับคิ้วตั้ง" },
  ],
  hardware: [
    { name: "บานพับ hyda", qty: () => 4, unit: "ตัว" },
    { name: "มือจับ+ล็อค", qty: () => 1, unit: "ชุด" },
    { name: "กลอน", qty: () => 1, unit: "ตัว" },
    { name: "น็อตเฟรม", qty: () => 6, unit: "ตัว" },
  ],
};

// ⑪ FUJI ประตูเดี่ยว มีธรณี (dropdown เสา 10/8 ซม.)
export const FUJI_DOOR: CutSpec = {
  id: "fuji_door", name: "FUJI ประตูเดี่ยว มีธรณี", stockLen: 640, rails: [],
  opts: [{ key: "box", label: "เสา", choices: ["10 cm · 7864", "8 cm · 7943B"] }],
  defaults: { W: 90, H: 210, N: 1, rail: "", honk: false, box: "10 cm · 7864" },
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
  hardware: [
    { name: "บานพับ hyda", qty: () => 4, unit: "ตัว" }, { name: "มือจับ+ล็อค", qty: () => 1, unit: "ชุด" },
    { name: "กลอน", qty: () => 1, unit: "ตัว" }, { name: "น็อตเฟรม", qty: () => 8, unit: "ตัว" },
  ],
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
export const FUJI_HUNG: CutSpec = {
  id: "fuji_hung", name: "FUJI บานยก (HUNG)", stockLen: 640, rails: [],
  defaults: { W: 104.3, H: 288.8, N: 1, rail: "", honk: false },
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
};

// ═══════════════════════ ประตู 4 รุ่น (ไฟล์เป็น ซม. อยู่แล้ว — ไม่ต้อง ÷10) ═══════════════════════
// รหัสกล่องอลู → ชื่อในสต็อก "หมวดอลูมิเนียม" รูปแบบ: กล่อง 2"x4" (แยกต่อสี · เลือกสีที่ dropdown สีอลู)
// ⚠ ห้ามใช้รหัสหลวมอย่าง "2x4" — หมวด "อุปกรณ์" มีกล่องไฟฟ้า (กล่องลอย-2x4/กล่องกันนํ้า-2x4) จะหักผิดของ
const boxCode = (size: string) => {
  const [a, b] = String(size).split(/[×xX*]/).map((s) => s.trim());
  return b ? `กล่อง ${a}"x${b}"` : `กล่อง ${a}`;
};

// ⑮ PC Door (JR_PCDoor) — บานเปิดเมืองทอง + บานเลื่อน sms · N มาจาก split
// ⚠ ไฟล์ไม่มีคอลัมน์เส้นสต็อก → ใช้ 600 (รอเจ้าของยืนยัน — มีชิ้น sms ที่ปกติ 640)
const pcBeamCut = (o: CutInput) => (o.beam === "2×4" ? 5 : 2.5);
const pcN = (o: CutInput) => (o.split === "แบ่ง 4" ? 4 : 2);
const pcNoSill = (o: CutInput) => o.sill === "ไม่มีธรณี";
export const PC_DOOR: CutSpec = {
  id: "pc_door", name: "ประตู PC Door (เปิดเมืองทอง + เลื่อน sms)", stockLen: 600, rails: [],
  opts: [
    { key: "beam", label: "คาน (กล่อง)", choices: ["1×4", "2×4"] },
    { key: "split", label: "รูปแบบบาน", choices: ["แบ่ง 2", "แบ่ง 4"] },
    { key: "sill", label: "ธรณี", choices: ["มีธรณี", "ไม่มีธรณี"] },
  ],
  defaults: { W: 300, H: 240, N: 2, rail: "", honk: false, beam: "1×4", split: "แบ่ง 2", sill: "มีธรณี" },
  profiles: [
    { name: "คาน", code: (o) => boxCode(o.beam ?? "1×4"), len: (o) => o.W, qty: () => 1, note: "ตัดเท่าช่อง" },
    { name: "ฝาครอบรางบน", code: "-", len: (o) => o.W - 3.3 - 2.5, qty: () => 1 },
    { name: "รางบนบานเลื่อน", code: "-", len: (o) => o.W - 4.5 - 2.5, qty: () => 1 },
    { name: "วงกบบานเปิด", code: "-", len: (o) => o.H - pcBeamCut(o), qty: () => 1 },
    { name: "เสารับบานเลื่อน", code: "-", len: (o) => o.H - pcBeamCut(o), qty: () => 1 },
    { name: "ชนกลางรับบานเลื่อน", code: "-", len: (o) => o.H - pcBeamCut(o) - 4, qty: () => 1 },
    { name: "ชนกลางบานเลื่อน", code: "B20046", len: (o) => o.H - pcBeamCut(o) - 4, qty: () => 1, note: "ไฟล์เขียนรหัสเปล่า '20046'" },
    { name: "กรอบบานเปิด เมืองทอง (สูง)", code: "-", len: (o) => o.H - pcBeamCut(o) - (pcNoSill(o) ? 3 : 6.3), qty: pcN },
    { name: "กรอบบานเปิด เมืองทอง (กว้าง)", code: "-", len: (o) => o.W / pcN(o) + (o.split === "แบ่ง 4" ? 0.5 : -0.7), qty: pcN },
    { name: "กรอบบานเลื่อน sms (สูง)", code: "-", len: (o) => o.H - pcBeamCut(o) - (pcNoSill(o) ? 5.8 : 10.3), qty: pcN },
    { name: "กรอบบานเลื่อน sms (กว้าง)", code: "-", len: (o) => o.W / pcN(o) - (o.split === "แบ่ง 4" ? 10 : 11.4), qty: pcN },
  ],
  hardware: [
    { name: "บานพับ hyda", qty: (o) => (o.split === "แบ่ง 2" ? 4 : 8), unit: "ตัว" },
    { name: "ล้อ + ซอฟโค้ด", qty: (o) => (o.split === "แบ่ง 2" ? 1 : 2), unit: "ชุด" },
    { name: "มือจับ Align SMS", qty: pcN, unit: "บาน" },
    { name: "กลอนบานลอง", qty: () => 1, unit: "ชุด" },
    { name: "น็อตเฟรม", qty: (o) => (pcNoSill(o) ? 6 : 8), unit: "ตัว" },
    { name: "ยาง", qty: (o) => Math.round((2 * (o.W + o.H)) / 100 * pcN(o)), unit: "ม." },
    { name: "ซิลิโคน ใน+นอก", qty: (o) => Math.ceil((2 * (o.W + o.H)) / 100 * 2 / 12.5), unit: "หลอด" },
  ],
};

// ⑯ ประตูรั้วบานเลื่อน (JR_ประตูรั้ว) — โครงกล่อง 2×4 (+หาง) + ระแนง · เส้น 600 ยืนยันในไฟล์
const GATE_SHOW: Record<string, number> = { "1 cm": 1, "5 cm": 5, '1"': 2.54, '1½"': 3.81, '1.6"': 4.06, '4"': 10.16 };
const gShow = (s?: string) => GATE_SHOW[s ?? '1.6"'] ?? 4.06;
const gStand = (o: CutInput) => o.H - (o.fit === "แปะนอก" ? 17.5 : 15.5);
const gSpan = (o: CutInput) => (o.slatDir === "นอน" ? gStand(o) : o.W);
const gSlatLen = (o: CutInput) =>
  o.slatDir === "นอน"
    ? (o.fit === "แปะนอก" ? o.W : o.W - 20.4)
    : (o.fit === "แปะนอก" ? gStand(o) + 5 : gStand(o) - 20.4);
const GATE_DIAG = Math.round(Math.sqrt(30 ** 2 + (40 - 15) ** 2) * 10) / 10; // เส้นทแยงค้ำมุม = 39.1 คงที่
const gAlt = (o: CutInput) => o.slatType === "ระแนงสลับ";
function gCounts(o: CutInput) {
  const span = gSpan(o), fA = gShow(o.showA), fB = gShow(o.showB), gap = o.gap ?? 5;
  const aRun = Math.max(1, Math.round(o.aRun ?? 3)), bRun = Math.max(1, Math.round(o.bRun ?? 5));
  const E6 = fA + gap;
  const E9 = Math.max(Math.trunc((span + gap) / E6), 2);
  const d1 = Math.abs((span - E9 * fA) / (E9 - 1) - gap);
  const d2 = Math.abs((span - (E9 + 1) * fA) / E9 - gap);
  const single = d1 <= d2 ? E9 : E9 + 1;
  let cum = 0, aCount = 0, bCount = 0;
  for (let k = 1; k <= 400; k++) {
    const isA = ((k - 1) % (aRun + bRun)) < aRun;
    cum += isA ? fA : fB;
    if (cum + (k - 1) * gap <= span + 1e-9) { if (isA) aCount++; else bCount++; } else break;
  }
  return { single, aCount, bCount };
}
export const GATE_SLIDE: CutSpec = {
  id: "gate_slide", name: "ประตูรั้วบานเลื่อน (โครงกล่อง 2×4 + ระแนง)", stockLen: 600, rails: [],
  opts: [
    { key: "fit", label: "แบบประกอบ", choices: ["ยัดใน", "แปะนอก"] },
    { key: "slatDir", label: "แนวระแนง", choices: ["ตั้ง", "นอน"] },
    { key: "slatType", label: "ชนิดใบ", choices: ["ระแนง", "ระแนงสลับ"] },
    { key: "showA", label: "ด้านโชว์ A", choices: ["1 cm", "5 cm", '1"', '1½"', '1.6"', '4"'] },
    { key: "showB", label: "ด้านโชว์ B (สลับ)", choices: ["1 cm", "5 cm", '1"', '1½"', '1.6"', '4"'] },
    { key: "gap", label: "ช่องห่าง (ซม.)", type: "number" },
    { key: "aRun", label: "สลับ: A ท่อน/ชุด", type: "number" },
    { key: "bRun", label: "สลับ: B ท่อน/ชุด", type: "number" },
  ],
  defaults: { W: 350, H: 180, N: 1, rail: "", honk: false, fit: "ยัดใน", slatDir: "ตั้ง", slatType: "ระแนง", showA: '1.6"', showB: '1.6"', gap: 5, aRun: 3, bRun: 5 },
  profiles: [
    { name: "เสาตั้งข้าง (กล่อง 2×4)", code: boxCode("2×4"), len: gStand, qty: () => 2 },
    { name: "เสานอนบน (2×4, รวมหาง)", code: boxCode("2×4"), len: (o) => o.W + 30, qty: () => 1, note: "W+30" },
    { name: "เสานอนล่าง (2×4, รวมหาง)", code: boxCode("2×4"), len: (o) => o.W + 30, qty: () => 1 },
    { name: "เสาตั้งท้ายหาง (2×4)", code: boxCode("2×4"), len: gStand, qty: () => 1 },
    { name: "เส้นทแยงค้ำมุมบน (2×4)", code: boxCode("2×4"), len: () => GATE_DIAG, qty: () => 1, note: "√(30²+25²)=39.1" },
    { name: "ใบระแนง A", code: "-", len: gSlatLen, qty: (o) => (gAlt(o) ? gCounts(o).aCount : gCounts(o).single) },
    { name: "ใบระแนง B (สลับ)", code: "-", len: (o) => (gAlt(o) ? gSlatLen(o) : 0), qty: (o) => (gAlt(o) ? gCounts(o).bCount : 0) },
    { name: 'ฉากข้อ 2" (แปะนอก)', code: "-", len: (o) => o.W, qty: (o) => (o.fit === "แปะนอก" ? 1 : 0) },
    { name: "เสารับไกด์ (กล่อง 4×4) — เสาแยก", code: boxCode("4×4"), len: (o) => (o.fit === "แปะนอก" ? o.H + 5 : o.H), qty: () => 1 },
    { name: "ราง (ฉากเหล็ก+เพลา)", code: "-", len: (o) => o.W * 2 - 50, qty: () => 1, note: "W×2−50" },
  ],
  hardware: [
    { name: 'ล้อวิ่ง 3"', qty: () => 2, unit: "ลูก" },
    { name: "ล้อไกด์ประคองหลัง", qty: () => 4, unit: "ชิ้น" },
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
export const SOLID_DOOR: CutSpec = {
  id: "solid_door", name: "บานโซลิด (เปิดทึบ+ลูกฟูก · แม่-ลูก)", stockLen: 600, rails: [],
  opts: [
    { key: "sill", label: "ธรณี", choices: ["มี", "ไม่มี"] },
    { key: "doorSplit", label: "แบ่งบาน", choices: ["แม่-ลูก", "เท่ากัน"] },
    { key: "motherW", label: "บานแม่ กว้าง (ซม.)", type: "number" },
  ],
  defaults: { W: 120, H: 279, N: 2, rail: "", honk: false, sill: "มี", doorSplit: "แม่-ลูก", motherW: 80 },
  profiles: [
    { name: "วงกบบน F7859", code: "F7859", len: (o) => o.W - 5, qty: () => 1 },
    { name: "วงกบข้าง F7859", code: "F7859", len: (o) => o.H, qty: () => 2 },
    { name: "ธรณี F7938B", code: "F7938B", len: (o) => o.W - 5, qty: (o) => (sHasSill(o) ? 1 : 0) },
    { name: "ตบธรณี F7960", code: "F7960", len: (o) => o.W - 5, qty: (o) => (sHasSill(o) ? 1 : 0) },
    { name: "เสริมใต้บาน F7863", code: "F7863", len: (o) => o.W - 5, qty: (o) => (sHasSill(o) ? 0 : 1) },
    { name: "กรอบบานตั้ง 7864", code: "7864", len: (o) => o.H - 3.7, qty: (o) => 2 * o.N },
    { name: "คิ้วตั้ง F7935", code: "F7935", len: (o) => o.H - 23.7, qty: (o) => 2 * o.N },
    { name: "เปิดกลาง F7945c", code: "F7945c", len: (o) => o.H - 5.4, qty: sChildN },
    { name: "กรอบนอน บานแม่ 7864", code: "7864", len: (o) => sMother(o) - (o.N === 1 ? 3.7 : 1.95), qty: () => 2 },
    { name: "กรอบนอน บานลูก 7864", code: "7864", len: (o) => (sChild(o) > 0 ? sChild(o) - (o.N === 1 ? 3.7 : 1.95) : 0), qty: (o) => 2 * sChildN(o) },
    { name: "คิ้วนอน บานแม่ F7935", code: "F7935", len: (o) => sMother(o) - (o.N === 1 ? 19.7 : 17.95), qty: () => 2 },
    { name: "คิ้วนอน บานลูก F7935", code: "F7935", len: (o) => (sChild(o) > 0 ? sChild(o) - (o.N === 1 ? 19.7 : 17.95) : 0), qty: (o) => 2 * sChildN(o) },
    { name: "ลูกฟูก บานแม่ (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sCorrM(o) * 2 },
    { name: "ลูกฟูก บานลูก (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sCorrC(o) * 2 * sChildN(o) },
    { name: "เส้นคาด บานแม่ (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sBattenM(o) * 2 },
    { name: "เส้นคาด บานลูก (2ฝั่ง)", code: "-", len: sFrameH, qty: (o) => sBattenC(o) * 2 * sChildN(o) },
  ],
  hardware: [
    { name: "บานพับ hyda", qty: (o) => (o.H > 300 || sMother(o) > 120 ? 5 : 4) * o.N, unit: "ชิ้น" },
    { name: "มือจับ+ล็อค ใบหลัก", qty: () => 1, unit: "ชิ้น" },
    { name: "ชุดกลอน ใบลอง", qty: sChildN, unit: "ชิ้น" },
    { name: "น็อตเฟรม", qty: (o) => (sHasSill(o) ? 8 : 6), unit: "ชิ้น" },
    { name: "ยาง", qty: (o) => Math.round((2 * (o.W + o.H)) / 100 * o.N), unit: "ม." },
    { name: "ซิลิโคน ใน+นอก", qty: (o) => Math.ceil((2 * (o.W + o.H)) / 100 * 2 / 12.5), unit: "หลอด" },
  ],
};

// ⑱ บานเปิดครอบวงกบไม้ (JR_บานเปิดครอบวงกบไม้) — กล่องเรียบ/บังใบล้วน · N ∈ {1,2}
// ⚠ ไฟล์ไม่มีคอลัมน์เส้นสต็อก → ใช้ 600 (รอเจ้าของยืนยัน) · ไฟล์ไม่ระบุ "ขนาดกล่องเรียบ" → ยังไม่ผูกสต็อก
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
    { name: "กล่องเรียบ แนวตั้ง (ครอบข้าง)", code: "-", len: (o) => o.H - 4.3, qty: () => 2 },
    { name: "กล่องเรียบ แนวนอน (ครอบบน)", code: "-", len: (o) => o.W - 0.7, qty: () => 1 },
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
    { name: "ซิลิโคน ใน+นอก", qty: (o) => Math.ceil((2 * (o.W + o.H)) / 100 * 2 / 12.5), unit: "หลอด" },
  ],
};

export const CUT_SPECS: CutSpec[] = [
  SMS_SLIDE_FREE, SMS_SLIDE_CENTER, SMS_SLIDE_TOW,
  SLIMLUX_SLIDE, FIXED_PANEL,
  VELORA_SWING, SMS240_BIFOLD, EURO_BIFOLD, EURO_BIFOLD_CORNER,
  FUJI_SLIDE, FUJI_SWING, FUJI_DOOR, FUJI_FIX, FUJI_HUNG,
  PC_DOOR, GATE_SLIDE, SOLID_DOOR, WOODJAMB_SWING,
];
export const CUT_SPEC_BY_ID: Record<string, CutSpec> = Object.fromEntries(CUT_SPECS.map((s) => [s.id, s]));
