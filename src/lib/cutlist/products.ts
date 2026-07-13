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

export const CUT_SPECS: CutSpec[] = [SMS_SLIDE_FREE];
export const CUT_SPEC_BY_ID: Record<string, CutSpec> = Object.fromEntries(CUT_SPECS.map((s) => [s.id, s]));
