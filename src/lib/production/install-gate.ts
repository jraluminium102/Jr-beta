/**
 * เกตปิดงาน (installations.status → COMPLETED) — ผลิต/ติดตั้ง แยกชุด + Hold (0131)
 *
 * เจ้าของเคาะ 1 ก.ย.2569:
 *   3) ชุด "active" (ไม่ hold) ต้องติดตั้งครบก่อนปิดงาน
 *   4) ยังมีชุด hold ค้าง → ห้ามปิดงาน แม้ active จะครบแล้ว (คงงานเปิดไว้ รอปลด hold)
 *
 * 🔄 ปรับ 15 ก.ย.2569 (เจ้าของสั่งเลิกระบบลงคิว "รายชุด" → กลับเป็น "ชื่อ/ทั้งงาน"):
 *   ลงคิวติดตั้งด้วยชื่อทั้งงาน = ไม่ติ๊กรายชุด → เดิมชุด active ไม่เคยถูกมาร์ค INSTALLED → ปิดงานไม่ได้ตลอด
 *   แก้: เลิกบังคับ "ทุกชุดต้องติดตั้งครบ" · เหลือบล็อกเฉพาะชุดที่ hold ค้าง (holdSetsBlockReason)
 *        ตอนปิดสำเร็จแล้วค่อยมาร์คชุด active ที่ยังไม่ติดตั้ง = INSTALLED (markActiveSetsInstalledForClose)
 *   ★ ลำดับสำคัญ (กันแก้ข้อมูลทั้งที่ปิดไม่สำเร็จ): เช็ค hold ก่อน → ปิด installations → ค่อยมาร์คชุด
 *
 * ใช้ร่วมกัน 3 จุดที่ตั้ง installations.status='COMPLETED': install-complete, install-assignments/complete,
 * installation/[id] PATCH — ห้ามเขียนเช็คนี้ซ้ำที่อื่น (กันหลุดกันเหมือน buildScheduleRows)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/**
 * บล็อกปิดงานเฉพาะ "ชุด hold ค้าง" (เจตนาพักงาน) — เช็คก่อน mutate ใด ๆ · ไม่มี hold/ไม่มีชุด = null (ปิดได้)
 */
export async function holdSetsBlockReason(sb: Sb, jobId: string): Promise<string | null> {
  const { data } = await sb.from("production_sets").select("id, hold").eq("job_id", jobId);
  const holdCount = ((data ?? []) as { hold: boolean | null }[]).filter((s) => s.hold).length;
  if (holdCount > 0) return `มี ${holdCount} ชุดที่ hold ค้างอยู่ — ปลด hold ก่อนจึงจะปิดงานได้`;
  return null;
}

/**
 * ปิดงานทั้งงาน (name-based) → ชุด active (ไม่ hold) ที่ยังไม่ติดตั้ง ให้ถือว่าติดตั้งพร้อมงาน มาร์ค INSTALLED ให้เอง
 *   (เจ้าของสั่ง 15 ก.ย.69: ไม่บังคับติ๊กรายชุด — ลงคิว/ปิดด้วยชื่อทั้งงานได้เหมือนเดิม)
 *   ★ เรียก "หลัง" ปิด installations สำเร็จแล้วเท่านั้น (กันมาร์คทั้งที่ปิดไม่สำเร็จ)
 *   คืนจำนวนชุดที่มาร์ค (ไว้ทำ audit) · best-effort ไม่ให้ล้มการปิดงาน
 */
export async function markActiveSetsInstalledForClose(sb: Sb, jobId: string, actor: string): Promise<number> {
  try {
    const { data } = await sb.from("production_sets").select("id, hold, install_status").eq("job_id", jobId);
    const rows: { id: number; hold: boolean | null; install_status: string | null }[] = data ?? [];
    const toInstall = rows.filter((s) => !s.hold && s.install_status !== "INSTALLED").map((s) => s.id);
    if (toInstall.length === 0) return 0;
    await sb.from("production_sets")
      .update({ install_status: "INSTALLED", installed_by: actor, installed_at: new Date().toISOString() })
      .in("id", toInstall);
    return toInstall.length;
  } catch { return 0; /* best-effort — คอลัมน์ยังไม่มี/แก้ไม่ได้ ก็ไม่ล้มการปิดงาน */ }
}
