import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ออกเลขเอกสาร (BL/INV/QT/WR) ตามวันที่ที่จะออกจริง (p_date) — ไม่ใช่ now()
 *
 * ต้นตอบั๊กเดิม (accountant, ก.ค.69): RPC next_document_code(p_doc_type) เดิมใช้ now() หาเดือนเสมอ
 * แต่ตอน insert เก็บ issue_date จาก body → เลขเดือนไม่ตรงวันที่บนใบ (สร้าง ส.ค. กรอก 31 ก.ค. → เลขเป็น 08)
 *
 * fallback: ถ้า migration 0118 (overload 2 พารามิเตอร์) ยังไม่รัน → เรียกตัวเดิม (1 พารามิเตอร์ ใช้ now())
 *   สร้างเอกสาร "วันนี้" ตามปกติยังถูกต้องเหมือนเดิม ต่างเฉพาะกรณี backdate ก่อน migration รัน
 */
export async function nextDocumentCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  docType: string,
  isoDate: string,
): Promise<{ code: string | null; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  let { data: code, error } = await sb.rpc("next_document_code", { p_doc_type: docType, p_date: isoDate });
  if (error && /42883|does not exist/i.test(error.message ?? error.code ?? "")) {
    // migration 0118 ยังไม่รัน — ตัวใหม่ (2 พารามิเตอร์) ไม่มี → fallback ตัวเดิม
    ({ data: code, error } = await sb.rpc("next_document_code", { p_doc_type: docType }));
  }
  if (error || !code) return { code: null, error: error?.message ?? "ออกรหัสไม่สำเร็จ" };
  return { code: code as string, error: null };
}

/**
 * แกะเดือน/ปี(พ.ศ.) ที่ "ฝังอยู่ในเลขเอกสาร" — รูปแบบ next_document_code เสมอ:
 *   <prefix ตัวอักษร><ปี พ.ศ. 4 หลัก><เดือน 2 หลัก><running 4 หลัก>  เช่น BL2568080001
 *
 * ใช้เช็คว่าวันที่ใหม่ที่จะแก้ "ยังอยู่เดือนเดิม" ไหม (เดือนที่เลขนี้ถูกนับจริง — ไม่ใช่เดือนจาก issue_date เดิม
 * เพราะ issue_date เดิมอาจไม่ตรงเลขอยู่แล้ว จากบั๊กต้นตอที่กำลังปิดในรอบนี้)
 */
export function parseCodeMonth(code: string): { yearBe: number; month: number } | null {
  const m = /^[A-Za-z]+(\d{4})(\d{2})\d{4}$/.exec(code.trim());
  if (!m) return null;
  const yearBe = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(yearBe) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { yearBe, month };
}

/** ปี(พ.ศ.)/เดือน ของวันที่ ISO YYYY-MM-DD */
export function beMonthOf(iso: string): { yearBe: number; month: number } {
  const [y, m] = iso.split("-").map(Number);
  return { yearBe: y + 543, month: m };
}
