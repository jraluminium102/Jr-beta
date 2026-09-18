/**
 * saveFetch — ยิงบันทึกแบบ "ไม่มีทางค้าง" (เจ้าของแจ้ง 18 ก.ย.69: หน้าใบเสนอพิมพ์แล้วค้าง กดอะไรไม่ได้ ไม่เซฟ ต้องกดออก)
 *   ต้นเหตุ: ปุ่มบันทึกตั้ง busy=true แล้ว await fetch/res.json() ตรง ๆ — ถ้าเน็ตหลุด/เซิร์ฟเวอร์ตอบช้าจน Vercel ตัด
 *   (ได้หน้า HTML แทน JSON) → โยน error ออกไปก่อนถึง setBusy(false) → ปุ่มบันทึก+ยกเลิกถูกล็อกตลอด
 *   ตัวนี้: มีเวลาหมด · ไม่โยน error · คืนข้อความไทยที่บอกว่าต้องทำอะไรต่อ — ผู้เรียกปลด busy ได้เสมอ
 */
export type SaveResult<T = unknown> = { ok: boolean; status: number; json: T | null; error: string; timedOut: boolean };

export async function saveFetch<T = unknown>(url: string, init: RequestInit, timeoutMs = 60000): Promise<SaveResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const json = (await res.json().catch(() => null)) as T | null;
    const apiErr = (json as { error?: string } | null)?.error;
    return {
      ok: res.ok, status: res.status, json, timedOut: false,
      error: res.ok ? "" : (apiErr || `บันทึกไม่สำเร็จ (รหัส ${res.status}) — ข้อมูลที่พิมพ์ยังอยู่ กดบันทึกอีกครั้งได้`),
    };
  } catch {
    const timedOut = ctrl.signal.aborted;
    return {
      ok: false, status: 0, json: null, timedOut,
      error: timedOut
        ? "เซิร์ฟเวอร์ตอบช้าเกิน " + Math.round(timeoutMs / 1000) + " วินาที — ข้อมูลที่พิมพ์ยังอยู่ · ลองกดบันทึกอีกครั้ง (ถ้าเลือกขึ้น Rev ไว้ ให้รีเฟรชเช็คก่อนว่าบันทึกไปแล้วหรือยัง กัน Rev ซ้ำ)"
        : "เชื่อมต่อไม่สำเร็จ (เน็ตหลุด?) — ข้อมูลที่พิมพ์ยังอยู่ กดบันทึกอีกครั้งได้",
    };
  } finally {
    clearTimeout(timer);
  }
}
