/**
 * เกตปิดงาน (installations.status → COMPLETED) — ผลิต/ติดตั้ง แยกชุด + Hold (0131)
 *
 * เจ้าของเคาะ 1 ก.ย.2569:
 *   3) ชุด "active" (ไม่ hold) ต้องติดตั้งครบก่อนปิดงาน
 *   4) ยังมีชุด hold ค้าง → ห้ามปิดงาน แม้ active จะครบแล้ว (คงงานเปิดไว้ รอปลด hold)
 *
 * ใช้ร่วมกัน 3 จุดที่ตั้ง installations.status='COMPLETED': install-complete, install-assignments/complete,
 * installation/[id] PATCH — ห้ามเขียนเช็คนี้ซ้ำที่อื่น (กันหลุดกันเหมือน buildScheduleRows)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export async function installCompleteBlockReason(sb: Sb, jobId: string): Promise<string | null> {
  const { data } = await sb.from("production_sets").select("id, hold, install_status").eq("job_id", jobId);
  const rows: { id: number; hold: boolean | null; install_status: string | null }[] = data ?? [];
  if (rows.length === 0) return null; // งานเก่า/ไม่มี worksheet แยกชุด — ไม่บล็อก (backward-compat)

  const holdCount = rows.filter((s) => s.hold).length;
  const activeNotInstalled = rows.filter((s) => !s.hold && s.install_status !== "INSTALLED").length;

  if (activeNotInstalled > 0) {
    return `ยังติดตั้งไม่ครบ — เหลือ ${activeNotInstalled} ชุดที่ยังไม่ติดตั้ง (ติ๊ก "ติดตั้งชุดนี้แล้ว" ให้ครบก่อน)`;
  }
  if (holdCount > 0) {
    return `มี ${holdCount} ชุดที่ hold ค้างอยู่ — ปลด hold ก่อนจึงจะปิดงานได้`;
  }
  return null;
}
