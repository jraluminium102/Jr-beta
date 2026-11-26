/**
 * เช็คค่าประเมินหน้างาน — ใครจ่ายแล้ว / ใครยังไม่จ่าย (เจ้าของสั่ง 23 พ.ย.69 · เริ่มนับคิวเดือน พ.ย.69)
 *   ไม่มีคอลัมน์ใหม่ อ่านจากของเดิมในคิว: assess_fee (ค่าประเมิน) · fee_paid (ติ๊กชำระแล้ว) · payment (ช่องชำระ)
 *     · จ่ายแล้ว            = fee_paid
 *     · ส่งเลขแล้ว รอโอน     = ยังไม่จ่าย + ช่องชำระ "รอค่าประเมิน"
 *     · ยังไม่ดำเนินการ      = ยังไม่จ่าย + ช่องชำระว่าง
 *     · เลือกวิธีแล้วยังไม่ติ๊ก = ยังไม่จ่าย + ช่องชำระเป็นอย่างอื่น (โอน/จ่ายสด/อื่นๆ …) → ให้คนเช็คยอดแล้วติ๊ก
 *     · ซ่อนไว้             = ยังไม่จ่าย + ช่องชำระ "ไม่จ่าย (ซ่อน)" — ลูกค้าเงียบนานจนน่าจะโดนเท เก็บไว้ให้กดดูได้ ไม่นับเป็นยอดค้าง
 *     · ยกเลิก              = ยังไม่จ่าย + ช่องชำระ "ยกเลิกค่าประเมิน" — ไม่เก็บค่าประเมินแล้ว (เช่น เข้าหน้างานแล้วไม่ทำต่อ)
 *       (2 ตัวหลัง เจ้าของ 26 พ.ย.69 · ไม่แตะสถานะคิว/งาน — แค่เลิกทวงค่าประเมิน)
 *   คิวที่ไม่มีค่าประเมิน / ยกเลิก ไม่อยู่ในรายการ
 * ฟังก์ชันล้วน ไม่แตะ DB — ใช้ร่วมกัน API + หน้าจอ
 */

/** คิวตั้งแต่วันนี้เป็นต้นไปเท่านั้นที่เอามาเช็ค (เจ้าของ: "เริ่มเดือน 11") */
export const FEE_CHECK_FROM = "2026-11-01";
/** ค่าในช่องชำระที่แปลว่า ส่งเลขบัญชีให้ลูกค้าแล้ว รอโอน */
export const FEE_WAITING = "รอค่าประเมิน";
/** ลูกค้าไม่จ่ายนานมาก — ซ่อนจากรายชื่อที่ต้องทวง (ยังกดดูได้) */
export const FEE_HIDDEN = "ไม่จ่าย (ซ่อน)";
/** ยกเลิก ไม่เก็บค่าประเมินแล้ว */
export const FEE_VOID = "ยกเลิกค่าประเมิน";

export type FeeBucket = "TODO" | "WAITING" | "UNCONFIRMED" | "PAID" | "HIDDEN" | "VOID";
/** ยังต้องทวงอยู่ไหม (ยังไม่จ่าย และไม่ได้ซ่อน/ยกเลิก) */
export const feeIsOpen = (b: FeeBucket | null): b is "TODO" | "WAITING" | "UNCONFIRMED" => b === "TODO" || b === "WAITING" || b === "UNCONFIRMED";
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
  HIDDEN: "ซ่อนไว้ (ลูกค้าไม่จ่ายนาน)",
  VOID: "ยกเลิก ไม่เก็บค่าประเมิน",
};

/** กลุ่มของคิว · null = ไม่ต้องเช็ค (ไม่มีค่าประเมิน หรือคิวยกเลิก) */
export function feeBucket(e: FeeRow): FeeBucket | null {
  if (!(Number(e.assess_fee ?? 0) > 0) || e.status === "CANCELLED") return null;
  if (e.fee_paid) return "PAID";
  const p = String(e.payment ?? "").trim();
  if (!p) return "TODO";
  if (p === FEE_HIDDEN) return "HIDDEN";
  if (p === FEE_VOID) return "VOID";
  return p === FEE_WAITING ? "WAITING" : "UNCONFIRMED";
}

// ── ป้ายสถานะค่าประเมินของ "งาน" (หน้าใบเสนอราคา · เช็คลิสต์ — เจ้าของ 25 พ.ย.69) ──────────
//   ดูอย่างเดียว อ่านจากคิวประเมินที่ผูกกับงาน (งานหนึ่งอาจมีหลายคิว) · แก้ได้ที่หน้าคิวงานที่เดียว
//     ไม่มีค่าประเมิน   = ไม่มีคิวไหนลงค่าประเมิน (หรือคิวยกเลิก)
//     จ่ายค่าประเมินแล้ว = ทุกคิวที่มีค่าประเมิน ติ๊กชำระแล้ว
//     รอค่าประเมิน     = ยังมีคิวที่มีค่าประเมินแต่ยังไม่ติ๊กชำระ (ไม่ว่าช่องชำระจะเลือกอะไรไว้)
//     ยกเลิกค่าประเมิน   = คิวที่มีค่าประเมินถูกกดยกเลิกทั้งหมด (ไม่เก็บแล้ว) · คิวที่ซ่อนไว้ ยังนับเป็น รอค่าประเมิน
//     null (ไม่โชว์ป้าย) = คิวที่ยังไม่ติ๊กเป็นคิวก่อน พ.ย.69 ทั้งหมด — ตอนนั้นยังไม่ได้ใช้ช่องติ๊กชำระ
//                        (ก.ย.–ต.ค.69 ไม่มีคิวไหนติ๊กเลย) แยกไม่ได้ว่ายังไม่จ่ายจริงหรือแค่ไม่ได้ติ๊ก → ไม่เดา
export type FeeStatus = "NONE" | "WAITING" | "PAID" | "VOID";
export const FEE_STATUS_TH: Record<FeeStatus, string> = {
  NONE: "ไม่มีค่าประเมิน",
  WAITING: "รอค่าประเมิน",
  PAID: "จ่ายค่าประเมินแล้ว",
  VOID: "ยกเลิกค่าประเมิน",
};
export function feeStatusOf(rows: (FeeRow & { created_at?: string | null })[], trackedFrom: string = FEE_CHECK_FROM): FeeStatus | null {
  const all = rows.filter((e) => feeBucket(e) !== null);
  const withFee = all.filter((e) => feeBucket(e) !== "VOID");
  if (withFee.length === 0) return all.length > 0 ? "VOID" : "NONE";
  const unpaid = withFee.filter((e) => feeBucket(e) !== "PAID");
  if (unpaid.length === 0) return "PAID";
  return unpaid.some((e) => String(e.queue_date ?? e.created_at ?? "").slice(0, 10) >= trackedFrom) ? "WAITING" : null;
}

const dayNum = (iso: string) => Math.round(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86400000);

/** ห่างจากวันคิวกี่วัน: ลบ = เลยวันคิวมาแล้ว (เข้าหน้างานไปแล้ว) · 0 = วันนี้ · บวก = ยังไม่ถึง · null = ยังไม่ลงวัน */
export function feeDaysToQueue(queueDate: string | null | undefined, today: string): number | null {
  if (!queueDate) return null;
  const a = dayNum(queueDate), b = dayNum(today);
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : null;
}

/** ถึงวันคิวแล้วหรือยัง (วันนี้ + ที่ผ่านมา = ต้องทวง) · คิวล่วงหน้า/ยังไม่ลงวัน = ยังไม่ต้องทวง ไว้ท้ายรายการ (เจ้าของ 24 พ.ย.69) */
export function feeIsDue(e: FeeRow, today: string): boolean {
  return !!e.queue_date && e.queue_date.slice(0, 10) <= today;
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

// ── ข้อความถามเซลล์ทางไลน์ "ลูกค้าจ่ายค่าประเมินยัง" (เจ้าของ 24 พ.ย.69) ──────────────
//   เอาเฉพาะคิวที่ยังไม่ได้ติ๊ก/เลือกอะไรในช่องชำระเลย (กลุ่ม TODO) · วันคิวตั้งแต่ from ถึง to (วันนี้)
//   เจ้าของ: "เอาแค่ถึงวันนี้ ไม่ต้องรวมคิวล่วงหน้า … โฟกัสแค่วันนี้ และอดีต เพราะเอาไว้ทวง"
//   แยกก้อนตามเซลล์ · หัวก้อน "พี่แม็ก จ่ายค่าประเมินยัง" · คิวละ 3 บรรทัด (คิว วันที่ / เวลา ชื่อ / ที่อยู่) เว้นบรรทัดคั่น

export const FEE_ASK_TAIL = "จ่ายค่าประเมินยัง";
export const FEE_ASK_NO_SALES = "ยังไม่ระบุเซลล์";

/** เลื่อนวัน (YYYY-MM-DD) ไป n วัน */
export function feeAddDays(iso: string, n: number): string {
  return new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);
}
/** เวลาแบบที่ใช้พิมพ์ในไลน์ "14.00" — รับทั้ง "14:00" "14.00" "9.30" · ไม่มีเวลา = "" */
export function feeTime(t: string | null | undefined): string {
  const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}.${m[2]}` : "";
}
/** วันที่แบบ 23/11/69 (ปี พ.ศ. 2 หลัก) */
export function feeAskDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${String((Number(y) + 543) % 100).padStart(2, "0")}`;
}

export type FeeAskRow = FeeRow & {
  customer_name?: string | null;
  address?: string | null;
  sales_id?: string | null;
  sales?: { name?: string | null } | null;
};

/** 1 คิว = 3 บรรทัด (ฟอร์มที่เจ้าของให้มา 24 พ.ย.69): "คิว 23/11/69" / "เวลา 13.00 ชื่อลูกค้า" / ที่อยู่ */
export function feeAskBlock(e: FeeAskRow): string {
  const one = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
  const t = feeTime(e.queue_time);
  return [
    e.queue_date ? `คิว ${feeAskDate(e.queue_date)}` : "",
    [t ? `เวลา ${t}` : "", one(e.customer_name)].filter(Boolean).join(" "),
    one(e.address),
  ].filter(Boolean).join("\n");
}
/** หัวก้อน: "พี่แม็ก จ่ายค่าประเมินยัง" (ชื่อที่ขึ้นต้นด้วย พี่ อยู่แล้วไม่เติมซ้ำ) */
export function feeAskHead(sales: string): string {
  const who = sales === FEE_ASK_NO_SALES || /^พี่/.test(sales) ? sales : `พี่${sales}`;
  return `${who} ${FEE_ASK_TAIL}`;
}

export type FeeAskGroup<T> = { key: string; sales: string; rows: T[]; text: string };

/** จัดก้อนข้อความตามเซลล์ · เรียงวัน/เวลาในก้อน · เซลล์เรียงตามชื่อ · คิวที่ยังไม่ระบุเซลล์ไว้ท้าย */
export function feeAskGroups<T extends FeeAskRow>(rows: T[], from: string, to: string): FeeAskGroup<T>[] {
  const pick = rows
    .filter((e) => feeBucket(e) === "TODO" && !!e.queue_date && e.queue_date.slice(0, 10) >= from && e.queue_date.slice(0, 10) <= to)
    .sort((a, b) => `${a.queue_date!.slice(0, 10)} ${feeTime(a.queue_time) || "99"}`.localeCompare(`${b.queue_date!.slice(0, 10)} ${feeTime(b.queue_time) || "99"}`));
  const map = new Map<string, FeeAskGroup<T>>();
  for (const e of pick) {
    const name = String(e.sales?.name ?? "").trim();
    const key = name ? (e.sales_id || name) : "";
    if (!map.has(key)) map.set(key, { key, sales: name || FEE_ASK_NO_SALES, rows: [], text: "" });
    map.get(key)!.rows.push(e);
  }
  const groups = [...map.values()].sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : a.sales.localeCompare(b.sales, "th")));
  // หัวก้อน แล้วตามด้วยคิวทีละก้อน เว้นบรรทัดว่างคั่นระหว่างคิว
  for (const g of groups) g.text = `${feeAskHead(g.sales)}\n${g.rows.map(feeAskBlock).join("\n\n")}`;
  return groups;
}

export function feeSum(rows: FeeRow[]): number {
  return rows.reduce((s, e) => s + (Number(e.assess_fee ?? 0) || 0), 0);
}
