/**
 * doc-revision — "เอกสารใบนี้อ้าง Rev เก่าหรือยัง"
 *
 * ที่มา (เจ้าของสั่ง 1 ก.ย.69 · migration 0127):
 *   เดิมระบบบังคับให้ยกเลิกเอกสารเป็นทอด ๆ ก่อนแก้ใบเสนอราคา — งานจริงแก้ราคาบ่อย เลยวุ่นวายมาก
 *   ตอนนี้แก้ได้ตลอด แล้วใช้ป้ายเตือนแทน: บิล/ใบเสร็จที่ออกตอน Rev เก่า จะขึ้นว่า "เช็คยอดใหม่"
 *
 * กติกา (ตั้งใจให้หลวม — เจ้าของย้ำว่า "ห้ามฟิก"):
 *   · ระบบ ไม่ แตะยอดในเอกสารที่ออกไปแล้ว (เจ้าของเคาะ: เตือนอย่างเดียว)
 *   · คนกด "รับทราบ" ได้ → ป้ายหาย จนกว่าใบเสนอจะ Rev ใหม่อีกรอบ
 *   · ไม่มีอะไรถูกล็อกเพราะป้ายนี้ — เป็นข้อมูลประกอบการตัดสินใจล้วน ๆ
 */

export type RevStamped = {
  source_revision_no?: number | null;   // ออกเอกสารตอนใบเสนออยู่ Rev ไหน
  ack_revision_no?: number | null;      // กดรับทราบตอน Rev ไหน
};

export type RevWarning = {
  stale: boolean;        // อ้าง Rev เก่ากว่าปัจจุบัน
  acked: boolean;        // เก่าแต่รับทราบแล้ว → ไม่ต้องเด้ง
  show: boolean;         // ควรขึ้นป้ายเตือนไหม (stale && !acked)
  from: number;          // Rev ที่เอกสารอ้าง
  to: number;            // Rev ปัจจุบันของใบเสนอ
  text: string;          // ข้อความพร้อมโชว์
};

const n = (v: unknown) => Number(v) || 0;

/**
 * เทียบ Rev ของเอกสาร กับ Rev ปัจจุบันของใบเสนอ
 * @param doc            แถวเอกสาร (billing_notes / receipts)
 * @param currentRevNo   revision_no ปัจจุบันของใบเสนอ
 */
export function revWarning(doc: RevStamped | null | undefined, currentRevNo: unknown): RevWarning {
  const to = n(currentRevNo);
  const raw = doc?.source_revision_no;
  // ⚠ ยังไม่ได้รัน 0127 (คอลัมน์ไม่มี) หรือเอกสารเก่าที่ยังไม่ได้ backfill → ห้ามเดาว่า Rev 0
  //   ไม่งั้นบิลทั้งระบบจะขึ้นป้ายเตือนพร้อมกันทันทีที่ deploy (ตกใจกันทั้งบริษัท)
  if (raw == null) return { stale: false, acked: false, show: false, from: 0, to, text: "" };
  const from = n(raw);
  const acked = n(doc?.ack_revision_no) >= to;
  const stale = from < to;
  return {
    stale, acked, show: stale && !acked, from, to,
    text: stale
      ? `⚠ ใบนี้ออกตอนใบเสนอ Rev ${from} · ตอนนี้ใบเสนอเป็น Rev ${to} แล้ว — ตรวจยอดอีกครั้งก่อนใช้`
      : "",
  };
}

/** ป้ายสั้นสำหรับตาราง/รายการ */
export function revBadge(w: RevWarning): string {
  return w.show ? `Rev เก่า (${w.from}→${w.to})` : "";
}
