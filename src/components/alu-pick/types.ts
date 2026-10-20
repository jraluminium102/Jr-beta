/** รูปแบบข้อมูลจาก /api/alu-picks (ช่าง + สโตร์ใช้ร่วมกัน) */
export type PickItem = {
  id: number; stock_item_id: number; qty: number; returned: number;
  sku: string; name: string; color: string; image_url: string; unit: string; on_hand: number;
};
export type Pick = {
  id: number; code: string; job_id: string | null; reason: string; reason_note: string; picker_name: string;
  status: "open" | "checked" | "cancelled"; checked_at: string | null; checked_by_name: string;
  cancelled_at: string | null; cancel_reason: string; note: string; created_at: string; updated_at: string;
  job_code: string | null; customer_name: string | null; items: PickItem[];
};
export type PickableItem = {
  id: number; sku: string; name: string; color: string; unit: string; qty: number; min_qty: number; image_url: string;
  /** ประเภทบาน (slide/swing/door/bifold/fixed/louver/box/angle/other) — เส้นเดียวอยู่ได้หลายประเภท */
  types: string[];
  /** ยี่ห้อ fuji/sms/market · "" = ไม่แยก */
  brand: string;
  /** คีย์โปรไฟล์ — ทุกสีของโปรไฟล์เดียวกันมีคีย์เดียวกัน */
  pkey: string;
  /** ชื่อโปรไฟล์ (ไม่มีสี) */
  base: string;
  /** รหัสโปรไฟล์ B/F (เส้นทั่วไปว่าง) */
  code: string;
};
/** โปรไฟล์ = ทุกสีของเส้นเดียวกันรวมเป็นแถวเดียว */
export type PickProfile = { pkey: string; code: string; base: string; image_url: string; brand: string; types: string[]; colors: PickableItem[]; total: number };
export type PickJob = {
  job_id: string; title: string; job_code: string | null; subtitle: string | null;
  due_date: string | null; install_date: string | null; status: string;
  /** ทำอะไร — ชื่อชุดงานแบบสั้น (กั้นห้องกระจก (หน้าบ้าน) · หลังคากันสาด …) */
  what?: string[]; set_count?: number;
  /** โรงที่ผลิต (โรงงาน 1 / โรงงาน 3) */
  factories?: string[];
  sales_name?: string | null;
  /** ที่อยู่แบบสั้นที่ช่างจำได้ (หมู่บ้านนันทวัน · บางเขน) */
  place?: string;
};
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-10-19" → "19 ต.ค." */
export const fmtDay = (iso?: string | null) => {
  const m = String(iso ?? "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])} ${TH_MON[Number(m[1]) - 1]}` : "";
};
/** "โรงงาน 1" → "โรง 1" */
export const shortFactory = (f: string) => f.replace(/โรงงาน\s*/, "โรง ");

export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
};
export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
