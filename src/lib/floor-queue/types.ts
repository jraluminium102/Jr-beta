// ประเภทข้อมูล "จัดคิวงานพื้น" — ตรงกับ supabase/migrations/0121_floor_queue.sql

export type FloorQueueStatus = "confirmed" | "wait_cf" | "wait_cf_jr";
export type FloorQueueBucket = "scheduled" | "after_jr" | "deposit_wait";
export type FloorQueueKind = "work" | "assess";

export type FloorQueueEntry = {
  id: string;
  job_id: string | null;
  customer_name: string;
  work_desc: string;
  extra_note: string;
  duration_note: string;
  scheduled_date: string | null; // ISO YYYY-MM-DD หรือ null (อยู่ในถัง)
  start_time: string;            // "HH:MM"
  status: FloorQueueStatus;
  bucket: FloorQueueBucket;
  kind: FloorQueueKind;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const FLOOR_QUEUE_STATUS_LABEL: Record<FloorQueueStatus, string> = {
  confirmed: "ยืนยันแล้ว",
  wait_cf: "รอ CF",
  wait_cf_jr: "รอ CF JR",
};

export const FLOOR_QUEUE_BUCKET_LABEL: Record<FloorQueueBucket, string> = {
  scheduled: "ลงคิวแล้ว",
  after_jr: "รอต่อหลัง JR เสร็จ",
  deposit_wait: "มัดจำแล้ว รอลงคิว",
};

export const FLOOR_QUEUE_KIND_LABEL: Record<FloorQueueKind, string> = {
  work: "งาน",
  assess: "ประเมิน/คุยงาน",
};
