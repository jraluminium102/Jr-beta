/**
 * fetch-all — ดึงข้อมูล "ทุกแถว" แบบแบ่งหน้า (กัน cap ~1,000 แถว/query ของ PostgREST/Supabase)
 *
 * ทำไมต้องมี: ตารางที่โตเกิน 1,000 แถว (เช่น stock_items ~1,800) ถ้า select ครั้งเดียว
 * จะได้แค่ 1,000 แถวแรก "โดยไม่มี error" → ของที่เหลือหายเงียบ
 * เจอจริงบน production 16 ก.ค.69: ใบตัดโชว์ "ไม่มีในสต็อก" + ข้ามตอนหักสต็อก ทั้งที่ของมีจริง
 *
 * วิธีใช้: ส่ง builder ที่รับ (from, to) แล้วคืน query ที่ใส่ .range(from, to) แล้ว
 * ⚠ query ต้องมี .order(...) ที่ "คงที่และไม่ซ้ำ" (จบด้วย id เสมอ) — ไม่งั้นหน้าถัดไปแถวซ้ำ/หาย
 */
export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; ; i += pageSize) {
    const { data, error } = await build(i, i + pageSize - 1);
    if (error || !data) break; // ได้เท่าที่ได้ ดีกว่าล้มทั้งหน้า (พฤติกรรมเดิมของหน้าพวกนี้ก็ไม่เช็ค error)
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
