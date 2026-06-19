/**
 * Thai phone number utilities (0044)
 *
 * formatThaiPhone — รับ raw string, คืน formatted:
 *   10 หลัก → XXX-XXX-XXXX
 *   9  หลัก → XX-XXX-XXXX
 *   อื่นๆ   → เลขล้วน (ไม่ใส่ขีด)
 *
 * normalizePhone — ตัดทุกอักขระที่ไม่ใช่ตัวเลข
 *   ใช้ฝั่ง server/dedup
 */

export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[^0-9]/g, "");
}

export function formatThaiPhone(raw: string | null | undefined): string {
  const digits = normalizePhone(raw);
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return digits;
}
