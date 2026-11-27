/**
 * คิวถ่ายผลงาน (เจ้าของสั่ง 27 พ.ย.69) — คิวประเภทใหม่ในหน้าคิวงาน
 *   "ไม่ต้องเกี่ยวกับใบเสนอราคาหรือเซลล์ · มีให้แค่ใส่ชื่อคนไปถ่าย ได้ 1–3 คน · เวลา · ลูกค้า · โลเคชั่นเหมือนคิว · ไม่ต้องมีติ๊กอะไรเลย"
 *
 * เก็บในตารางคิวเดิม (queue_entries) ไม่มี migration:
 *   · job_type   = "ถ่ายผลงาน"  ← ตัวบอกประเภท ต้องตรงเป๊ะ ห้ามว่าง (ว่าง = ระบบถือเป็นคิวประเมิน แล้วจะสร้างงาน/ลูกค้าให้ตอนปิดคิว)
 *   · note_ai    = รายชื่อคนไปถ่าย คั่นด้วย ", " (คอลัมน์นี้มีในตารางมาตั้งแต่แรกแต่ไม่มีหน้าจอไหนใช้)
 *   · sales_id   = ว่างเสมอ → ไม่เข้าสถิติเซลล์ / ลิงก์คิวของเซลล์ / ปฏิทินรายเซลล์ / ตัวจัดคิวอัตโนมัติ
 *   · assess_fee = ว่างเสมอ → ไม่เข้า "เช็คค่าประเมิน"
 *   · status     = CONFIRMED ตอนสร้าง · เลยวันแล้วระบบปิดเป็น "เสร็จ" ให้เอง (ตัวเดียวกับโชว์รูม/เคลียร์แบบ — ไม่สร้างงาน ไม่เข้าแบบ)
 * ฟังก์ชันล้วน ไม่แตะ DB
 */

export const PHOTO_JOB_TYPE = "ถ่ายผลงาน";
export const PHOTO_CREW_MAX = 3;

type PhotoLike = { job_type?: string | null; note_ai?: string | null } | null | undefined;

export const isPhotoQueue = (e: PhotoLike): boolean => String(e?.job_type ?? "").trim() === PHOTO_JOB_TYPE;

/** รายชื่อคนไปถ่าย (สูงสุด 3) จากค่าที่เก็บ */
export function photoCrew(e: PhotoLike): string[] {
  return String(e?.note_ai ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, PHOTO_CREW_MAX);
}

/** ค่าที่จะเก็บ จากช่องกรอกชื่อ (ตัดช่องว่าง · ตัดชื่อซ้ำ · สูงสุด 3) */
export function photoCrewField(names: string[]): string {
  const out: string[] = [];
  for (const n of names) {
    const t = String(n ?? "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, PHOTO_CREW_MAX).join(", ");
}

// ── ประวัติถ่ายผลงาน (เจ้าของ 27 พ.ย.69: "ถ่ายผลงานมักมาจากลูกค้าที่ทำงานกับเราเสร็จแล้ว อยากได้เป็นประวัติด้วยว่าเคยถ่าย
//    และดึงข้อมูลหน้างานได้ ไม่ต้องกรอกซ้ำ · ลูกค้าไม่มีในระบบก็ให้กรอกแยกไปเลย ไม่ต้องสร้างในทะเบียน") ──
//   คิวที่เลือกจากงานในระบบ เก็บลิงก์ไว้ที่ target_job_id (งาน) + target_customer_id (ลูกค้า) ของตารางคิวเดิม
//     2 ช่องนี้เดิมใช้กับคิวประเมินลูกค้าเก่า/เคลียร์แบบ — กับคิวถ่ายผลงานไม่มีผลข้างเคียง เพราะทุกจุดที่ทำอะไรกับมันเช็ค job_type ก่อน
//   ลูกค้านอกระบบ = 2 ช่องนี้ว่าง · ไม่สร้างลูกค้าในทะเบียน
export type PhotoHistoryItem = {
  id: string; status: string;
  queue_date: string | null; queue_time: string | null;
  customer_name: string; tel: string | null; address: string | null; location_url: string | null; note_admin: string | null;
  crew: string[];
  target_job_id: string | null; target_customer_id: number | null; job_code: string | null;
};

/** ถ่ายไปแล้วหรือยัง: ปิดคิวแล้ว หรือเลยวันนัดแล้ว = ถ่ายแล้ว · ยังไม่ถึงวัน = นัดไว้ */
export function photoIsDone(h: { status?: string | null; queue_date?: string | null }, today: string): boolean {
  return h.status === "DONE" || (!!h.queue_date && h.queue_date.slice(0, 10) < today);
}

/** วันที่แบบสั้น 27/11/69 (พ.ศ. 2 หลัก) */
export function photoDateShort(iso: string | null | undefined): string {
  if (!iso) return "ยังไม่ลงวัน";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${String((Number(y) + 543) % 100).padStart(2, "0")}`;
}

/** ข้อความสั้นของประวัติ 1 รายการ: "ถ่ายแล้ว 27/11/69 · เป, ส้ม" / "นัดถ่าย 3/12/69 · เป" */
export function photoHistoryLabel(h: Pick<PhotoHistoryItem, "status" | "queue_date" | "crew">, today: string): string {
  return `${photoIsDone(h, today) ? "ถ่ายแล้ว" : "นัดถ่าย"} ${photoDateShort(h.queue_date)}${h.crew.length ? ` · ${h.crew.join(", ")}` : ""}`;
}

const copyTime = (t: string | null | undefined) => {
  const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}.${m[2]}` : "";
};

/** ข้อความคิวถ่ายผลงาน ไว้ก๊อปส่งไลน์ให้คนไปถ่าย */
export function buildPhotoCopy(e: {
  queue_date?: string | null; queue_time?: string | null; customer_name?: string | null; tel?: string | null;
  address?: string | null; location_url?: string | null; note_admin?: string | null; note_ai?: string | null; job_type?: string | null;
}, dateLabel: string): string {
  const crew = photoCrew(e);
  const t = copyTime(e.queue_time);
  return [
    `คิวถ่ายผลงาน ${dateLabel}${t ? ` เวลา ${t} น.` : ""}`,
    `คนไปถ่าย: ${crew.length ? crew.join(", ") : "-"}`,
    "",
    `${String(e.customer_name ?? "").trim()}${e.tel?.trim() ? ` ${e.tel.trim()}` : ""}`,
    ...(e.address?.trim() ? [e.address.trim().replace(/\s+/g, " ")] : []),
    ...(e.location_url?.trim() ? ["", e.location_url.trim()] : []),
    ...(e.note_admin?.trim() ? ["", `หมายเหตุ: ${e.note_admin.trim()}`] : []),
  ].join("\n");
}
