// ตรรกะ "ติดตามงานลูกค้า" — หาว่าลูกค้าอยู่เฟสไหนในเส้นทาง 13 เฟส
// อ่านจาก jobs.current_stage (authoritative) → fallback status (macro) + productions/installations (micro)

export type PhaseKey =
  | "LEAD" | "QUOTE" | "NEGOTIATE" | "DEPOSIT" | "MEASURE" | "MEETING"
  | "MATERIAL" | "PROD_QUEUE" | "PRODUCING" | "QC" | "INSTALL" | "HANDOVER"
  | "CANCELLED";

export const PHASE_ORDER: PhaseKey[] = [
  "LEAD", "QUOTE", "NEGOTIATE", "DEPOSIT", "MEASURE", "MEETING",
  "MATERIAL", "PROD_QUEUE", "PRODUCING", "QC", "INSTALL", "HANDOVER",
];

// tone: ใช้กับ Chip (ฝั่ง OMS ธีมเข้ม) — ระบุ chip class + dot
export const PHASE_META: Record<PhaseKey, { th: string; chip: string; dot: string }> = {
  LEAD:       { th: "เข้าประเมิน",     chip: "bg-slate-500/25 text-slate-100 border-slate-300/30", dot: "#94a3b8" },
  QUOTE:      { th: "ทำใบเสนอราคา",   chip: "bg-sky-500/25 text-sky-100 border-sky-300/30",       dot: "#38bdf8" },
  NEGOTIATE:  { th: "เจรจาปิดการขาย", chip: "bg-blue-500/25 text-blue-100 border-blue-300/30",     dot: "#60a5fa" },
  DEPOSIT:    { th: "ลูกค้ามัดจำ",     chip: "bg-emerald-500/25 text-emerald-100 border-emerald-300/30", dot: "#34d399" },
  MEASURE:    { th: "เข้าวัดจริง",     chip: "bg-teal-500/25 text-teal-100 border-teal-300/30",     dot: "#2dd4bf" },
  MEETING:    { th: "ประชุมแบบ",       chip: "bg-cyan-500/25 text-cyan-100 border-cyan-300/30",     dot: "#22d3ee" },
  MATERIAL:   { th: "ถอดวัสดุ/สั่งของ", chip: "bg-lime-500/25 text-lime-100 border-lime-300/30",     dot: "#a3e635" },
  PROD_QUEUE: { th: "เข้าคิวผลิต",     chip: "bg-amber-500/25 text-amber-100 border-amber-300/30",   dot: "#fbbf24" },
  PRODUCING:  { th: "ผลิตงาน",         chip: "bg-orange-500/25 text-orange-100 border-orange-300/30", dot: "#fb923c" },
  QC:         { th: "ตรวจ QC",         chip: "bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-300/30", dot: "#e879f9" },
  INSTALL:    { th: "เข้าติดตั้ง",     chip: "bg-violet-500/25 text-violet-100 border-violet-300/30", dot: "#a78bfa" },
  HANDOVER:   { th: "ส่งงาน/จบ",       chip: "bg-indigo-500/25 text-indigo-100 border-indigo-300/30", dot: "#818cf8" },
  CANCELLED:  { th: "ยกเลิก",          chip: "bg-rose-500/25 text-rose-100 border-rose-300/30",     dot: "#fb7185" },
};

// เกินกี่วันในเฟสถือว่าค้าง (overdue) — ตามกลุ่มงาน
export function overdueDays(phase: PhaseKey): number {
  if (["LEAD", "QUOTE", "NEGOTIATE"].includes(phase)) return 5;     // ฝั่งขาย
  if (["INSTALL", "HANDOVER"].includes(phase)) return 3;            // ติดตั้ง
  if (phase === "CANCELLED") return Infinity;
  return 7;                                                          // ผลิต/อื่นๆ
}

type ProdRow = { status?: string; status_updated_at?: string | null; planned_install_date?: string | null };
type InstRow = { status?: string; updated_at?: string | null };
type JobLike = {
  status: string;
  current_stage?: number | null;   // authoritative 24-stage index (0014)
  design_state?: string | null;    // designer board state (0016)
  updated_at?: string | null;
  created_at?: string | null;
  productions?: ProdRow[] | ProdRow | null;
  installations?: InstRow[] | InstRow | null;
};

const arr = <T,>(v: T[] | T | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

// Map jobs.current_stage (1-24) → PhaseKey
// Stages 3-4 split by design_state: if APPROVED/REJECTED we've moved past design → QUOTE; otherwise DESIGNING
export function phaseFromStage(stage: number, design_state?: string | null): PhaseKey {
  if (stage <= 2)  return "LEAD";
  if (stage === 3) return "QUOTE"; // เขียนแบบ = งานก่อนเสนอราคา (จัดกลุ่ม QUOTE; design_state ไม่เปลี่ยนเฟส)
  if (stage === 4)  return "QUOTE";       // เซลล์ตรวจแบบ
  if (stage === 5)  return "QUOTE";       // ทำใบเสนอราคา
  if (stage === 6)  return "NEGOTIATE";   // เจรจาราคา
  if (stage === 7)  return "NEGOTIATE";   // ส่งใบเสนอให้ลูกค้า
  if (stage === 8)  return "DEPOSIT";     // ลูกค้ามัดจำ
  if (stage === 9)  return "MEASURE";     // รอวัดจริง
  if (stage === 10) return "MEASURE";     // หัวหน้าช่างเข้าวัด
  if (stage === 11) return "MEETING";     // ประชุมหลังวัด
  if (stage === 12) return "MEETING";     // แก้แบบ + ใบเสนอ
  if (stage === 13) return "MEETING";     // คอนเฟิร์มลูกค้า
  if (stage === 14) return "MATERIAL";    // ทำเอกสารลูกค้า
  if (stage === 15) return "PROD_QUEUE";  // ลงคิวผลิต
  if (stage === 16) return "PRODUCING";   // สั่งอลูมิเนียม
  if (stage === 17) return "PRODUCING";   // สั่งกระจก
  if (stage === 18) return "PRODUCING";   // ผลิตงาน
  if (stage === 19) return "QC";          // QC โรงงาน
  if (stage === 20) return "INSTALL";     // ผลิตเสร็จ/รอติดตั้ง
  if (stage === 21) return "INSTALL";     // เข้าติดตั้ง
  if (stage === 22) return "INSTALL";     // รอลูกค้าตรวจรับ
  if (stage === 23) return "INSTALL";     // แก้งาน
  if (stage >= 24)  return "HANDOVER";    // ส่งงาน + รับประกัน
  return "LEAD";
}

// แมป production.status → เฟส
function prodPhase(s: string): PhaseKey {
  switch (s) {
    case "PENDING_MEASURE": return "MEASURE";
    case "MEASURED":        return "MEETING";
    case "PENDING_MEETING": return "MEETING";
    case "REVISING":        return "MEETING";
    case "PENDING_CONFIRM": return "MATERIAL";
    case "QUEUED":          return "PROD_QUEUE";
    case "MANUFACTURING":   return "PRODUCING";
    case "QC":              return "QC";
    case "READY":           return "INSTALL";
    case "ISSUE":           return "PRODUCING";
    default:                return "MATERIAL";
  }
}

// หาเฟสปัจจุบันของงาน
// Priority: CANCELLED → current_stage (authoritative 24-stage) → productions/installations (micro) → status (macro fallback)
export function derivePhase(job: JobLike): PhaseKey {
  if (job.status === "CANCELLED") return "CANCELLED";

  // Use current_stage when available (> 0); this is the authoritative source of truth
  if (job.current_stage && job.current_stage > 0) {
    return phaseFromStage(job.current_stage, job.design_state);
  }

  // Legacy fallback: read from productions/installations join rows
  const inst = arr(job.installations);
  if (inst.length) {
    return inst.some((i) => i.status === "COMPLETED") ? "HANDOVER" : "INSTALL";
  }
  const prod = arr(job.productions);
  if (prod.length) return prodPhase(prod[0].status ?? "");

  // Last resort: macro status enum
  switch (job.status) {
    case "LEAD":             return "LEAD";
    case "PENDING_QUOTE":    return "QUOTE";
    case "QUOTE_SENT":       return "NEGOTIATE";
    case "PENDING_DECISION": return "NEGOTIATE";
    case "DEPOSITED":        return "DEPOSIT";
    case "IN_PRODUCTION":    return "PRODUCING";
    case "INSTALLING":       return "INSTALL";
    case "COMPLETED":        return "HANDOVER";
    default:                 return "LEAD";
  }
}

// วันที่อ้างอิงล่าสุดของเฟส (ไว้คำนวณวันค้าง) — ถ้าถึงเฟสติดตั้งใช้ของ installation ก่อน
export function phaseSince(job: JobLike): string | null {
  const inst = arr(job.installations);
  if (inst.length) return inst[0].updated_at || job.updated_at || job.created_at || null;
  const prod = arr(job.productions);
  return prod[0]?.status_updated_at || job.updated_at || job.created_at || null;
}

export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
