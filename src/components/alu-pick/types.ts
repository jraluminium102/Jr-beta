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
  id: number; sku: string; name: string; color: string; unit: string; qty: number; min_qty: number; image_url: string; group: string;
};
export type PickJob = {
  job_id: string; title: string; job_code: string | null; subtitle: string | null;
  due_date: string | null; install_date: string | null; status: string;
};

export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
};
export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
