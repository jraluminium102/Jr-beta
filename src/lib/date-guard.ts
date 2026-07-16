/**
 * ยามวันที่ธุรกิจ — วันที่ที่ "คนกรอกเอง" (วันส่งใบเสนอ / วันมัดจำ / วันออกบิล ฯลฯ)
 *
 * ที่มา (16 ก.ค. 2569): ตรวจ jobs.quote_sent_date ย้อนหลังพบ
 *   - 2026-12-06 / 2026-11-06 / 2026-09-06 = พิมพ์วัน-เดือนสลับกัน แล้วไม่มีใครค้าน
 *   - ไม่มีการตรวจสักชั้น ทั้งฝั่งหน้าเว็บและ API → อะไรก็ลงได้
 * ฝั่งหน้าเว็บ DateField กัน พ.ศ. ให้แล้ว แต่ API เปิดรับ z.string() เปล่า ๆ
 * → ใครยิง API ตรง/หน้าเว็บเก่าค้าง cache ก็ลงค่าเพี้ยนได้อยู่ดี ต้องกันที่ server ด้วย
 *
 * ⚠️ กันได้แค่ "ค่าที่เป็นไปไม่ได้" (อนาคต/พ.ศ./ปีมั่ว) เท่านั้น
 *    วัน-เดือนสลับที่ยังอยู่ในอดีต (5/6 ↔ 6/5) กันไม่ได้ — ต้องอาศัยค่าตั้งต้นที่ถูกแทน
 */

/** เก่าสุดที่ยอมรับ — JR เริ่มใช้ระบบปี 2025 ค่าที่เก่ากว่านี้คือกรอกผิดแน่ ๆ */
export const MIN_BUSINESS_DATE = "2020-01-01";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ตรวจวันที่ธุรกิจ — คืนข้อความปัญหา (ภาษาไทย) ถ้าใช้ไม่ได้ · คืน null ถ้าผ่าน
 * @param allowFuture วันที่ในอนาคตได้ไหม (เช่น วันนัดติดตั้ง = ได้ · วันส่งใบเสนอ = ไม่ได้)
 */
export function businessDateIssue(
  iso: string,
  opts: { allowFuture?: boolean; label?: string } = {}
): string | null {
  const label = opts.label ?? "วันที่";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${label}ต้องเป็นรูปแบบ ปปปป-ดด-วว`;

  const [y, m, d] = iso.split("-").map(Number);
  // ปี พ.ศ. หลุดเข้ามา (2569) — เคยลามหลายคอลัมน์มาแล้ว (migration 0060)
  if (y >= 2500) return `${label}เป็นปี พ.ศ. (${y}) — ต้องกรอกเป็น ค.ศ. ${y - 543}`;

  // ต้องเป็นวันที่มีจริง (กัน 2026-02-31)
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    return `${label}ไม่มีอยู่จริง (${iso})`;

  if (iso < MIN_BUSINESS_DATE) return `${label}เก่าเกินไป (${iso})`;
  if (!opts.allowFuture && iso > todayISO())
    return `${label}เป็นวันในอนาคต (${iso}) — ตรวจว่าสลับวันกับเดือนหรือเปล่า`;

  return null;
}
