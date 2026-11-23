/**
 * เช็คค่าประเมินหน้างาน — ใครจ่ายแล้ว / ใครยังไม่จ่าย (เจ้าของสั่ง 23 พ.ย.69 · เริ่มนับคิวเดือน พ.ย.69)
 *   ไม่มีคอลัมน์ใหม่ อ่านจากของเดิมในคิว: assess_fee (ค่าประเมิน) · fee_paid (ติ๊กชำระแล้ว) · payment (ช่องชำระ)
 *     · จ่ายแล้ว            = fee_paid
 *     · ส่งเลขแล้ว รอโอน     = ยังไม่จ่าย + ช่องชำระ "รอค่าประเมิน"
 *     · ยังไม่ดำเนินการ      = ยังไม่จ่าย + ช่องชำระว่าง
 *     · เลือกวิธีแล้วยังไม่ติ๊ก = ยังไม่จ่าย + ช่องชำระเป็นอย่างอื่น (โอน/จ่ายสด/อื่นๆ …) → ให้คนเช็คยอดแล้วติ๊ก
 *   คิวที่ไม่มีค่าประเมิน / ยกเลิก ไม่อยู่ในรายการ
 * ฟังก์ชันล้วน ไม่แตะ DB — ใช้ร่วมกัน API + หน้าจอ
 */

/** คิวตั้งแต่วันนี้เป็นต้นไปเท่านั้นที่เอามาเช็ค (เจ้าของ: "เริ่มเดือน 11") */
export const FEE_CHECK_FROM = "2026-11-01";
/** ค่าในช่องชำระที่แปลว่า ส่งเลขบัญชีให้ลูกค้าแล้ว รอโอน */
export const FEE_WAITING = "รอค่าประเมิน";

export type FeeBucket = "TODO" | "WAITING" | "UNCONFIRMED" | "PAID";
export type FeeRow = {
  assess_fee?: number | string | null;
  fee_paid?: boolean | null;
  payment?: string | null;
  status?: string | null;
  queue_date?: string | null;
  queue_time?: string | null;
};

export const FEE_BUCKET_TH: Record<FeeBucket, string> = {
  TODO: "ยังไม่ดำเนินการ",
  WAITING: "ส่งเลขแล้ว รอโอน",
  UNCONFIRMED: "เลือกวิธีชำระแล้ว แต่ยังไม่ติ๊กว่าจ่าย",
  PAID: "จ่ายแล้ว",
};

/** กลุ่มของคิว · null = ไม่ต้องเช็ค (ไม่มีค่าประเมิน หรือคิวยกเลิก) */
export function feeBucket(e: FeeRow): FeeBucket | null {
  if (!(Number(e.assess_fee ?? 0) > 0) || e.status === "CANCELLED") return null;
  if (e.fee_paid) return "PAID";
  const p = String(e.payment ?? "").trim();
  if (!p) return "TODO";
  return p === FEE_WAITING ? "WAITING" : "UNCONFIRMED";
}

const dayNum = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86400000);

/** ห่างจากวันคิวกี่วัน: ลบ = เลยวันคิวมาแล้ว (เข้าหน้างานไปแล้ว) · 0 = วันนี้ · บวก = ยังไม่ถึง · null = ยังไม่ลงวัน */
export function feeDaysToQueue(queueDate: string | null | undefined, today: string): number | null {
  if (!queueDate) return null;
  const a = dayNum(queueDate), b = dayNum(today);
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
}

/** ข้อความบอกจังหวะ + late = เข้าหน้างานไปแล้วแต่ยังไม่ได้เงิน (ต้องตามก่อน) */
export function feeDayNote(queueDate: string | null | undefined, today: string): { text: string; late: boolean } {
  const d = feeDaysToQueue(queueDate, today);
  if (d === null) return { text: "ยังไม่ลงวัน", late: false };
  if (d < 0) return { text: `เข้าหน้างานไปแล้ว ${-d} วัน`, late: true };
  if (d === 0) return { text: "คิววันนี้", late: false };
  return { text: d === 1 ? "คิวพรุ่งนี้" : `อีก ${d} วันถึงคิว`, late: false };
}

/** เรียงคนที่ยังไม่จ่าย: เลยวันคิวนานสุดขึ้นก่อน → วันนี้ → ใกล้ถึงคิว → ยังไม่ลงวันท้ายสุด */
export function sortUnpaid<T extends FeeRow>(rows: T[]): T[] {
  const key = (e: T) => (e.queue_date ? `0${e.queue_date.slice(0, 10)} ${e.queue_time ?? ""}` : "1");
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

export function feeSum(rows: FeeRow[]): number {
  return rows.reduce((s, e) => s + (Number(e.assess_fee ?? 0) || 0), 0);
}
