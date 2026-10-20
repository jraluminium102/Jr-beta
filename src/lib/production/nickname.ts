/**
 * ชื่อเรียกในงานผลิต (productions.nickname · 0159) — โชว์เป็นวงเล็บหลังชื่อลูกค้า
 *   เจ้าของสั่ง 20 ต.ค.69: โน้ตเฉย ๆ ไม่แตะชื่อลูกค้า/ใบเสนอ/ทะเบียนลูกค้า · ขึ้นหน้าผลิต (ออฟฟิศ+ช่าง) และติดตั้ง
 *   ที่เดียวที่ต่อวงเล็บ — ทุกหน้าที่โชว์ต้องเรียกตัวนี้ ห้ามต่อเอง
 */
export function withNickname(name: string | null | undefined, nickname: string | null | undefined): string {
  const n = String(name ?? "").trim();
  const k = String(nickname ?? "").trim();
  if (!k) return n;
  if (!n) return `(${k})`;
  return `${n} (${k})`;
}

/** ดึงชื่อเรียกของหลายงานพร้อมกัน (job_id → nickname) · คอลัมน์ยังไม่มี (ยังไม่รัน 0159) = คืน map ว่าง ไม่ล้มหน้า */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nicknamesByJob(sb: { from: (t: string) => any }, jobIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(jobIds.filter(Boolean))];
  if (!ids.length) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await sb.from("productions").select("job_id, nickname").in("job_id", ids.slice(i, i + 300));
    if (error) return out;
    for (const r of (data ?? []) as { job_id: string; nickname: string | null }[]) {
      if (r.nickname && String(r.nickname).trim()) out[r.job_id] = String(r.nickname).trim();
    }
  }
  return out;
}
