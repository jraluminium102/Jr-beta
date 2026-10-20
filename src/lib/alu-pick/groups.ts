/**
 * ใบเบิกอลู — ค่าคงที่ที่ทั้งหน้ามือถือช่าง / สโตร์อลู / API ใช้ร่วมกัน
 *   ⚠ ไฟล์นี้ถูก import ฝั่งหน้าเว็บ (มือถือช่าง) — ห้าม import ของหนัก (สูตรคิดราคา/ใบตัด) ที่นี่
 *     ตัวจัดหมวดเส้นอยู่ที่ ./classify.ts (ใช้ฝั่ง server เท่านั้น)
 *
 * เจ้าของเคาะ 19 ต.ค.69:
 *   · ช่างเลือกชื่อตัวเองจากรายการ (ยังไม่ทำบัญชีช่าง) — PICKER_NAMES
 *   · งานที่ไม่มีชื่อลูกค้า ต้องเลือกเหตุผล: งานซ่อม / อื่นๆ (ระบุ)
 */

/** ชื่อช่างที่เบิกได้ (เจ้าของให้มา 19 ต.ค.69) — พิมพ์ชื่ออื่นเองได้ด้วย */
export const PICKER_NAMES = ["เนียน", "จอย", "แบงค์", "ต้น", "เป", "โรง3", "ชัย"];

export const PICK_REASONS: { key: "repair" | "other"; label: string }[] = [
  { key: "repair", label: "งานซ่อม" },
  { key: "other", label: "อื่นๆ (ระบุ)" },
];
export const reasonLabel = (reason: string, note?: string | null) =>
  reason === "repair" ? "งานซ่อม" : reason === "other" ? `อื่นๆ${note ? ": " + note : ""}` : "";

/**
 * หมวดในหน้าเบิก (เจ้าของเคาะ 20 ต.ค.69)
 *   · ตามประเภทบาน ไม่ใช่ตามยี่ห้ออย่างเดียว → ชิปยี่ห้อด้านใน
 *   · ประตู + บานติดตาย ยุบเข้า "บานเปิด / กระทุ้ง" · SlimLux แยกหมวด · เมืองทอง แยกหมวด
 *   · เส้นบานเลื่อนขึ้นแค่หมวดบานเลื่อน · ลูกฟูก/ยู อยู่กับ ฉาก/Z · ไม่เอาหลังคา
 *   · บานยก แยกหมวด (รอบ 3) · มือจับ xj + รางสแตนเลสโค้ง อยู่ SlimLux
 */
export type PickTypeKey = "slide" | "slimlux" | "swing" | "lift" | "bifold" | "muangthong" | "louver" | "box" | "angle" | "other";
export const PICK_TYPES: { key: PickTypeKey; label: string }[] = [
  { key: "slide", label: "บานเลื่อน" },
  { key: "slimlux", label: "SlimLux" },
  { key: "swing", label: "บานเปิด / กระทุ้ง" },
  { key: "lift", label: "บานยก" },
  { key: "bifold", label: "บานเฟี้ยม" },
  { key: "muangthong", label: "เมืองทอง" },
  { key: "louver", label: "บานระแนง" },
  { key: "box", label: "กล่อง" },
  { key: "angle", label: "ฉาก / Z / ลูกฟูก / ยู" },
  { key: "other", label: "อื่นๆ" },
];
export const PICK_BRANDS: { key: string; label: string }[] = [
  { key: "fuji", label: "Euro Fuji" }, { key: "sms", label: "SMS" }, { key: "market", label: "ตลาด" },
];
