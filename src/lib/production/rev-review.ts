/**
 * Rev. หลังมัดจำ (0169) — ตรรกะกลาง
 *   · createRevReview(): เรียกจาก quotations PATCH ตอนขึ้น Rev ขณะงานมัดจำแล้ว
 *   · loadRevInfo(): ให้หน้าผลิตออฟฟิศ + ตารางช่าง รู้ว่างานไหน Rev เท่าไร / มี Rev รอตรวจไหม
 *   · PROD_STATUS_TH: ชื่อเฟสจริงไว้รีมาร์ค ("งานอยู่เฟส กำลังผลิต")
 */
import type { RevChange } from "@/lib/quotation-diff";

type Sb = { from: (t: string) => any };

export const PROD_STATUS_TH: Record<string, string> = {
  PENDING_MEASURE: "รอวัดจริง", MEASURED: "วัดแล้ว", PENDING_MEETING: "รอประชุมแบบ", REVISING: "แก้แบบ",
  PENDING_CONFIRM: "รอคอนเฟิร์ม", QUEUED: "รอลงผลิต", MANUFACTURING: "กำลังผลิต", QC: "ตรวจ QC", READY: "พร้อมติดตั้ง", ISSUE: "มีปัญหา",
};
export const statusTh = (s: string | null | undefined) => (s ? PROD_STATUS_TH[s] ?? s : "—");

/** สถานะงานที่ถือว่า "มัดจำแล้ว" → Rev ต้องผ่านฝ่ายผลิต */
export const AFTER_DEPOSIT = new Set(["DEPOSITED", "IN_PRODUCTION", "INSTALLING"]);
/** เฟสผลิตที่ "ลงมือแล้ว" → ห้ามลบชุดผลิตทิ้งอัตโนมัติ (ความคืบหน้าช่างจะหาย) ให้ฝ่ายผลิตตัดสินเอง */
export const IN_PROGRESS = new Set(["QUEUED", "MANUFACTURING", "QC", "READY", "ISSUE"]);

export type RevPending = {
  id: number; rev_no: number; rev_label: string; from_status: string; summary: RevChange[];
  sets_regen: string; cover_sync: string; created_at: string; created_by_name: string;
};
export type RevInfo = { rev_no: number; rev_label: string; pending: RevPending | null; pending_count: number };

/** ข้อมูล Rev ต่องาน (batch) — ใบเสนอที่ไม่ยกเลิกของงาน (0156 = 1 ใบ/งาน) + รีวิวที่ยังไม่รับทราบ */
export async function loadRevInfo(sb: Sb, jobIds: string[]): Promise<Record<string, RevInfo>> {
  const out: Record<string, RevInfo> = {};
  if (!jobIds.length) return out;
  const { data: quos } = await sb.from("quotations").select("job_id, revision_no, revision_label, status").in("job_id", jobIds).neq("status", "cancelled");
  for (const q of (quos ?? []) as { job_id: string; revision_no: number | null; revision_label: string | null }[]) {
    const cur = out[q.job_id];
    const no = Number(q.revision_no) || 0;
    if (!cur || no > cur.rev_no) out[q.job_id] = { rev_no: no, rev_label: String(q.revision_label ?? ""), pending: null, pending_count: 0 };
  }
  // ตารางอาจยังไม่มี (0169 ยังไม่รัน) → ข้ามเงียบ
  const { data: revs, error } = await sb.from("job_rev_reviews")
    .select("id, job_id, rev_no, rev_label, from_status, summary, sets_regen, cover_sync, created_at, created_by_name")
    .in("job_id", jobIds).is("ack_at", null).order("created_at", { ascending: false });
  if (error) return out;
  for (const r of (revs ?? []) as (RevPending & { job_id: string })[]) {
    const info = out[r.job_id] ?? (out[r.job_id] = { rev_no: r.rev_no, rev_label: r.rev_label, pending: null, pending_count: 0 });
    info.pending_count += 1;
    if (!info.pending) info.pending = { id: r.id, rev_no: r.rev_no, rev_label: r.rev_label, from_status: r.from_status, summary: Array.isArray(r.summary) ? r.summary : [], sets_regen: r.sets_regen, cover_sync: r.cover_sync, created_at: r.created_at, created_by_name: r.created_by_name };
  }
  return out;
}

/** บันทึก "Rev หลังมัดจำ รอฝ่ายผลิตตรวจ" — best-effort (ยังไม่รัน 0169 = คืน false ไม่ล้ม Rev) */
export async function createRevReview(sb: Sb, row: {
  job_id: string; quotation_id: number; rev_no: number; rev_label: string; from_status: string; job_status: string;
  summary: RevChange[]; sets_regen: string; cover_sync: string; created_by: string | null; created_by_name: string;
}): Promise<boolean> {
  const { error } = await sb.from("job_rev_reviews").insert(row);
  if (error) { console.warn("[rev-review] insert failed:", error.message); return false; }
  return true;
}
