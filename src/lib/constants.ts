import type { JobStatus, ProdStatus, InstStatus, Channel } from "@/lib/database.types";

export const JOB_STATUS: Record<JobStatus, { th: string; dot: string; chip: string }> = {
  LEAD:             { th: "ลูกค้าใหม่",   dot: "#a3a3a3", chip: "bg-neutral-500/25 text-neutral-100 border-neutral-300/30" },
  PENDING_QUOTE:    { th: "รอเสนอราคา",  dot: "#94a3b8", chip: "bg-slate-500/25 text-slate-100 border-slate-300/30" },
  QUOTE_SENT:       { th: "ส่งลูกค้าแล้ว", dot: "#60a5fa", chip: "bg-blue-500/25 text-blue-100 border-blue-300/30" },
  PENDING_DECISION: { th: "รอตัดสินใจ",   dot: "#fbbf24", chip: "bg-amber-500/25 text-amber-100 border-amber-300/30" },
  DEPOSITED:        { th: "มัดจำแล้ว",    dot: "#34d399", chip: "bg-emerald-500/25 text-emerald-100 border-emerald-300/30" },
  IN_PRODUCTION:    { th: "กำลังผลิต",    dot: "#fb923c", chip: "bg-orange-500/25 text-orange-100 border-orange-300/30" },
  INSTALLING:       { th: "กำลังติดตั้ง",  dot: "#a78bfa", chip: "bg-violet-500/25 text-violet-100 border-violet-300/30" },
  CANCELLED:        { th: "ยกเลิก",       dot: "#fb7185", chip: "bg-rose-500/25 text-rose-100 border-rose-300/30" },
  COMPLETED:        { th: "จบงาน",        dot: "#818cf8", chip: "bg-indigo-500/25 text-indigo-100 border-indigo-300/30" },
};

export const PROD_STATUS: Record<ProdStatus, string> = {
  PENDING_MEASURE: "รอวัดหน้างาน", MEASURED: "วัดแล้ว", PENDING_MEETING: "รอประชุมแบบ",
  REVISING: "แก้แบบหลังวัด", PENDING_CONFIRM: "รอลูกค้าคอนเฟิร์ม", QUEUED: "รอลงผลิต",
  MANUFACTURING: "กำลังผลิต", QC: "ตรวจ QC", READY: "พร้อมติดตั้ง", ISSUE: "มีปัญหา",
};

// 2 เลนงานผลิต (ให้ ออฟฟิศ/ช่าง เห็นชัดว่าใครดูแลช่วงไหน) — ไม่ตัดสถานะ แค่จัดกลุ่มให้เข้าใจ
// office = ก่อนลงมือผลิต (วัด/ประชุม/แบบ/คอนเฟิร์ม/รอลงผลิต) · chang = ตอนผลิต (ผลิต/QC/พร้อม) · issue = ปัญหา
export type ProdLane = "office" | "chang" | "issue";
export const PROD_LANE: Record<ProdStatus, ProdLane> = {
  PENDING_MEASURE: "office", MEASURED: "office", PENDING_MEETING: "office",
  REVISING: "office", PENDING_CONFIRM: "office", QUEUED: "office",
  MANUFACTURING: "chang", QC: "chang", READY: "chang", ISSUE: "issue",
};
export const PROD_LANE_META: Record<ProdLane, { label: string; short: string; icon: string; fg: string; bg: string }> = {
  office: { label: "ช่วงออฟฟิศ · ก่อนลงมือผลิต", short: "ออฟฟิศ", icon: "🏢", fg: "#93c5fd", bg: "rgba(55,138,221,.14)" },
  chang:  { label: "ช่วงช่าง · กำลังผลิต",        short: "ช่าง",   icon: "🔧", fg: "#a7e08a", bg: "rgba(99,153,34,.16)" },
  issue:  { label: "มีปัญหา · ต้องแก้ก่อน",       short: "ปัญหา",  icon: "⚠️", fg: "#fca5a5", bg: "rgba(226,75,74,.14)" },
};
// ลำดับขั้นในเลน (โชว์ progress "ขั้นที่ x/n") — ISSUE เป็นทางแยก ไม่นับ
export const PROD_FLOW_STEPS: ProdStatus[] = [
  "PENDING_MEASURE", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM", "QUEUED", "MANUFACTURING", "QC", "READY",
];

export const INST_STATUS: Record<InstStatus, string> = {
  PENDING: "รอติดตั้ง", INSTALLING: "กำลังติดตั้ง", PENDING_INSPECT: "รอลูกค้าตรวจ",
  REVISING: "แก้งาน", COMPLETED: "จบงาน", ISSUE: "มีปัญหา",
};

export const CHANNEL: Record<Channel, string> = {
  LINE: "LINE", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", OTHER: "อื่นๆ",
};

export const MENU_LABEL: Record<string, string> = {
  dashboard: "Dashboard", jobs: "งานทั้งหมด", production: "Production",
  prodqueue: "ตารางผลิต (ช่าง)",
  designer: "งานเขียนแบบ",
  installation: "ติดตั้ง", issues: "Issues", finance: "บัญชี", users: "Users", settings: "ตั้งค่า",
};
