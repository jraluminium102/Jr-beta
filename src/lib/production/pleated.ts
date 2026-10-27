/**
 * มุ้งจีบของชุดงาน — แหล่งเดียว (หน้าผลิต · ตารางผลิต · หน้าต่างสถานะกระจก/มุ้งจีบ)
 *   เจ้าของ 27 ต.ค.69: "ดรอปดาวน์มุ้งเลือกมุ้งจีบไว้อยู่แล้ว ไม่อยากเลือก 2 ช่อง · ให้รายชื่อเก่าเข้าสถานะมุ้งจีบเอง"
 *   → ชุดนี้ "มีมุ้งจีบ" = ช่องมุ้ง (screen_type หรือ screen_type_2) มีคำว่า "มุ้งจีบ"
 *      (หรือเคยกรอก "สั่งมุ้งจีบ" ไว้แล้ว — กันข้อมูลที่กรอกก่อนหน้านี้หาย)
 *   → สถานะสั่ง = screen_order (0162) · ยังไม่กรอก = "ยังไม่สั่ง"
 *      แต่ถ้าช่อง "ใส่มุ้ง" ของช่องที่เป็นมุ้งจีบ = "มาแล้ว" ถือว่ามาแล้ว (ข้อมูลเก่าก่อนมีช่องสั่ง)
 *   → ใส่แล้ว = จบ ใช้ "ใส่มุ้ง" ของช่องที่เป็นมุ้งจีบ (ช่อง 1 หรือช่อง 2)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const PLEATED = "มุ้งจีบ";
export const PLEATED_DONE = "ใส่แล้ว";

const str = (v: unknown) => String(v ?? "").trim();

/** ช่องมุ้งไหนเป็นมุ้งจีบ: 1 / 2 / 0 = ไม่มีในช่องมุ้ง */
export function pleatedSlot(s: any): 0 | 1 | 2 {
  if (str(s?.screen_type).includes(PLEATED)) return 1;
  if (str(s?.screen_type_2).includes(PLEATED)) return 2;
  return 0;
}

export type PleatedInfo = { type: string; order: string; installed: string; done: boolean };

/** ข้อมูลมุ้งจีบของชุด · null = ชุดนี้ไม่มีมุ้งจีบ */
export function pleatedOf(s: any): PleatedInfo | null {
  const slot = pleatedSlot(s);
  const order = str(s?.screen_order);
  if (!slot && !order) return null;
  const type = slot === 2 ? str(s?.screen_type_2) : str(s?.screen_type) || PLEATED;
  const installed = slot === 2 ? str(s?.screen_installed_2) : str(s?.screen_installed);
  // ยังไม่กรอกช่องสั่ง แต่ "ใส่มุ้ง" บอกว่ามาแล้ว (ข้อมูลเดิม) → นับเป็นมาแล้ว
  const effOrder = order || (installed === "มาแล้ว" ? "มาแล้ว" : "");
  return { type, order: effOrder, installed, done: installed === PLEATED_DONE };
}
