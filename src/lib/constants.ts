import type { JobStatus, ProdStatus, InstStatus, Channel } from "@/lib/database.types";

export const JOB_STATUS: Record<JobStatus, { th: string; dot: string; chip: string }> = {
  PENDING_QUOTE:    { th: "รอเสนอราคา",  dot: "#94a3b8", chip: "bg-slate-500/25 text-slate-100 border-slate-300/30" },
  QUOTE_SENT:       { th: "ส่งลูกค้าแล้ว", dot: "#60a5fa", chip: "bg-blue-500/25 text-blue-100 border-blue-300/30" },
  PENDING_DECISION: { th: "รอตัดสินใจ",   dot: "#fbbf24", chip: "bg-amber-500/25 text-amber-100 border-amber-300/30" },
  DEPOSITED:        { th: "มัดจำแล้ว",    dot: "#34d399", chip: "bg-emerald-500/25 text-emerald-100 border-emerald-300/30" },
  CANCELLED:        { th: "ยกเลิก",       dot: "#fb7185", chip: "bg-rose-500/25 text-rose-100 border-rose-300/30" },
  COMPLETED:        { th: "จบงาน",        dot: "#818cf8", chip: "bg-indigo-500/25 text-indigo-100 border-indigo-300/30" },
};

export const PROD_STATUS: Record<ProdStatus, string> = {
  PENDING_MEASURE: "รอวัดจริง", MEASURED: "วัดแล้ว", PENDING_MEETING: "รอประชุม",
  REVISING: "แก้แบบ", PENDING_CONFIRM: "รอคอนเฟิร์ม", QUEUED: "ลงคิวผลิต",
  MANUFACTURING: "กำลังผลิต", QC: "QC", READY: "พร้อมติดตั้ง", ISSUE: "มีปัญหา",
};

export const INST_STATUS: Record<InstStatus, string> = {
  PENDING: "รอติดตั้ง", INSTALLING: "กำลังติดตั้ง", PENDING_INSPECT: "รอลูกค้าตรวจ",
  REVISING: "แก้งาน", COMPLETED: "จบงาน", ISSUE: "มีปัญหา",
};

export const CHANNEL: Record<Channel, string> = {
  LINE: "LINE", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", OTHER: "อื่นๆ",
};

export const MENU_LABEL: Record<string, string> = {
  dashboard: "Dashboard", jobs: "งานทั้งหมด", production: "Production",
  installation: "ติดตั้ง", issues: "Issues", finance: "บัญชี", users: "Users", settings: "ตั้งค่า",
};
