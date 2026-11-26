// คิวงาน — types + helper (Supabase เป็น source of truth, ไม่มี Google Sheet แล้ว)

export type QueueStatus = "PENDING" | "PROPOSED" | "CONFIRMED" | "DONE" | "CANCELLED";
export type QueueTeam = "BKK" | "PHUKET";
export type JobSize = "SINGLE" | "MULTI" | "FULLDAY";
export type QueueSalesRole = "MAIN" | "ASSISTANT";  // (0019)
export type OfficeHalf = "AM" | "PM";
export type OfficeSlot = { weekday: number; half: OfficeHalf };  // (0030) weekday 0=อา..6=ส
export type OfficeOverride = { date: string; half: OfficeHalf; action: "add" | "remove" }; // (0031) ทับรายวัน

export type QueueSales = {
  id: string;
  code: string;
  name: string;
  team: QueueTeam;
  start_label: string | null;
  start_lat: number | null;
  start_lng: number | null;
  profile_id: string | null;
  active: boolean;
  role: QueueSalesRole;             // (0019) ผู้ช่วยเซลล์
  parent_sales_id: string | null;   // (0019) สังกัดเซลล์หลัก
  office_slots?: OfficeSlot[] | null;        // (0030) วันอยู่ออฟฟิศประจำ (ครึ่งวัน)
  office_overrides?: OfficeOverride[] | null; // (0031) override รายวัน (ย้าย/เอาออก)
};

// office มีผลไหม ในวันนั้น/ช่วงนั้น — override รายวันทับ pattern ประจำสัปดาห์
export function isOfficeOn(sales: QueueSales, date: string, weekday: number, half: OfficeHalf): boolean {
  const ovr = (sales.office_overrides ?? []).find((o) => o.date === date && o.half === half);
  if (ovr) return ovr.action === "add";
  return (sales.office_slots ?? []).some((o) => o.weekday === weekday && o.half === half);
}

export type QueueEntry = {
  id: string;
  status: QueueStatus;
  queue_date: string | null;
  queue_time: string | null;
  job_type: string | null;
  sales_id: string | null;
  sales?: { id: string; name: string; code: string; team: QueueTeam } | null;
  assistant_id: string | null;  // (0019) ผู้ช่วยเซลล์ที่ไปด้วย
  assistant?: { id: string; name: string; code: string } | null;
  line_contact: string | null;
  contact_channel: string;        // (0043) LINE | FB
  lead_source?: string | null;       // (0175) ที่มาของลูกค้า — ชุดปิด LEAD_SOURCES · null = ยังไม่ระบุ
  lead_source_code?: string | null;  // (0175) รหัสแอด เช่น A12
  customer_name: string;
  tel: string | null;
  address: string | null;
  location_url: string | null;
  lat: number | null;
  lng: number | null;
  job_size: JobSize | null;
  job_count: number | null;
  assess_fee: number | null;
  payment: string | null;
  receipt_done: boolean;
  fee_paid: boolean;            // (0042) ชำระค่าประเมินแล้ว
  note_admin: string | null;
  note_ai: string | null;
  target_job_id: string | null;      // (0044) เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม
  target_customer_id: number | null; // (0045) ลูกค้าเก่าหน้างานใหม่: customer_id เดิม
  old_customer?: boolean | null;     // (0168) ลูกค้าเก่าที่ไม่มีในระบบ (รีมาร์คอย่างเดียว)
  bill_choice?: string | null;       // (0070) SITE | OTHER_ADDR | COMPANY
  bill_kind?: string | null;         // (0070) INDIVIDUAL | COMPANY
  bill_name?: string | null;         // (0070) ชื่อที่ออกเอกสาร
  bill_tax_id?: string | null;       // (0070) เลขผู้เสียภาษี
  bill_branch?: string | null;       // (0070) สาขา
  bill_address?: string | null;      // (0070) ที่อยู่ออกบิล (ที่อยู่อื่น / ที่อยู่บริษัท)
  bill_postal?: string | null;       // (0077) รหัสไปรษณีย์
  created_at: string;
  updated_at: string;
};

// ---------- ลูกค้าเก่า (เจ้าของ 3 พ.ย.69: แท็กเดียวกันทั้งมีและไม่มีในระบบ) ----------
//   มีในระบบ = ผูก target_customer_id (หน้างานใหม่/เดิม) หรือ target_job_id (เคลียร์แบบ) · ไม่มีในระบบ = old_customer (0168)
export type OldCustomerSrc = { old_customer?: boolean | null; target_customer_id?: number | null; target_job_id?: string | null } | null | undefined;
export const isOldCustomer = (e: OldCustomerSrc): boolean =>
  !!e && (!!e.old_customer || e.target_customer_id != null || e.target_job_id != null);
export const OLD_CUSTOMER_LABEL = "ลูกค้าเก่า";

// ---------- ที่มาของลูกค้า + รหัสแอด (0175 · เจ้าของ 20 พ.ย.69) ----------
//   ลิงก์ไลน์ของแต่ละแอดเปิดแชทพร้อมข้อความพิมพ์รอไว้ มีรหัสในวงเล็บ เช่น "สนใจหน้าต่างบานยกครับ (A12)"
//   → แอดมินวางข้อความลูกค้าในฟอร์มคิว ระบบหยิบรหัสให้เอง ไม่ต้องถามลูกค้าว่ามาจากไหน
//   contact_channel = ช่องทางที่ใช้คุย (LINE/FB) · lead_source = ลูกค้ารู้จักเราจากไหน — คนละเรื่องกัน
export const LEAD_SOURCES = ["FB_AD", "TIKTOK", "YOUTUBE", "GOOGLE_MAPS", "REFERRAL", "OTHER", "UNKNOWN"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
//   26 พ.ย.69 เจ้าของ: แก้แคปชั่นแอดที่ยิงอยู่ไม่ได้ → ใช้แบบสอบถามสั้น ๆ ให้ลูกค้าตอบเป็นเลข 1–6 แทน
//   ชื่อ + ลำดับตัวเลือกในฟอร์มคิวต้อง "ตรงกับแบบสอบถาม" (เจ้าของท้วงว่าไม่แมช) — แก้ชื่อที่นี่ที่เดียว ค่าในฐานข้อมูลไม่เปลี่ยน
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  FB_AD: "เฟซบุ๊ก / ไอจี",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  GOOGLE_MAPS: "Google Maps",
  REFERRAL: "เพื่อนหรือคนรู้จักแนะนำ",
  OTHER: "อื่น ๆ",
  UNKNOWN: "ไม่ทราบ",
};
// เลขข้อในแบบสอบถามที่ส่งให้ลูกค้า (ลูกค้าตอบเป็นตัวเลข) — "ไม่ทราบ" ไม่มีเลข (ลูกค้าไม่ตอบ)
export const LEAD_SURVEY_NO: Partial<Record<LeadSource, number>> = { FB_AD: 1, TIKTOK: 2, YOUTUBE: 3, GOOGLE_MAPS: 4, REFERRAL: 5, OTHER: 6 };
// ชื่อตัวเลือกในฟอร์มคิว: "1 · เฟซบุ๊ก / ไอจี" … "ไม่ทราบ / ลูกค้าไม่ตอบ"
export const leadSourceOptionLabel = (k: LeadSource): string =>
  LEAD_SURVEY_NO[k] ? `${LEAD_SURVEY_NO[k]} · ${LEAD_SOURCE_LABEL[k]}` : "ไม่ทราบ / ลูกค้าไม่ตอบ";
// แบบสอบถามที่แอดมินก๊อปส่งลูกค้า (ถ้อยคำเจ้าของเคาะ 26 พ.ย.69) — ตัวเลือกสร้างจากรายการเดียวกับฟอร์ม กันเลขเพี้ยน
export const LEAD_SURVEY_TEXT = [
  "หากลูกค้าสะดวก รบกวนตอบแบบสอบถามสั้น ๆ ให้ทางร้านหน่อยนะคะ 🙏",
  "ลูกค้ารู้จัก JR จากช่องทางไหนคะ",
  ...LEAD_SOURCES.filter((k) => LEAD_SURVEY_NO[k]).map((k) => `${LEAD_SURVEY_NO[k]} ${LEAD_SOURCE_LABEL[k]}`),
  "ตอบเป็นตัวเลขได้เลยค่ะ ขอบคุณมากนะคะ",
].join("\n");
// ค่าในฐานข้อมูล → คีย์ที่ใช้รายงาน · ว่าง/ค่าแปลก = ไม่ทราบ (ไม่ซ่อน ไม่เดา)
export const leadSourceKey = (v: unknown): LeadSource =>
  (LEAD_SOURCES as readonly string[]).includes(String(v ?? "")) ? (v as LeadSource) : "UNKNOWN";
// รหัสแอด: ตัวพิมพ์ใหญ่ ไม่มีช่องว่าง ยาวไม่เกิน 20 ตัว (ตัดให้ ไม่เด้งเตือน)
export const LEAD_CODE_MAX = 20;
//   ตัดทีละ "ตัวอักษรจริง" (Array.from) — slice ธรรมดาตัดกลางอีโมจิแล้วได้ตัวอักษรเสีย (QA 20 พ.ย.69)
export const normLeadCode = (v: unknown): string =>
  Array.from(String(v ?? "").replace(/\s+/g, "").toUpperCase()).slice(0, LEAD_CODE_MAX).join("");
// คิวนี้ "บอกที่มา" ไหม — มีรหัส หรือเลือกที่มาที่ไม่ใช่ "ไม่ทราบ" · เลือก "ไม่ทราบ" เฉย ๆ = ไม่มีข้อมูล (ไม่ให้ไปทับที่มาจริงของคิวอื่น)
export const hasLeadInfo = (q: { lead_source?: string | null; lead_source_code?: string | null } | null | undefined): boolean =>
  !!q && (!!normLeadCode(q.lead_source_code) || (!!q.lead_source && q.lead_source !== "UNKNOWN"));
// ตัวอักษรนำของรหัส → ที่มา · ตัวอื่นไม่เดา (คืน null)
const LEAD_PREFIX: Record<string, LeadSource> = { A: "FB_AD", T: "TIKTOK", Y: "YOUTUBE", G: "GOOGLE_MAPS" };
export const leadSourceFromCode = (code: unknown): LeadSource | null => {
  const m = normLeadCode(code).match(/^([A-Z])\d/);
  return m ? LEAD_PREFIX[m[1]] ?? null : null;
};
// หารหัสแอดในข้อความที่วาง — ต้องเป็น "(ตัวอักษรนำที่รู้จัก A/T/Y/G + เลข 1–4 หลัก)" อยู่ท้ายบรรทัดเท่านั้น
//   เช่น (A12) (T3) (Y1) (G05) · ไม่เจอ = null ปล่อยว่าง ห้ามเดา
//   ข้ามบรรทัดที่เป็นลิงก์ · วงเล็บกลางบรรทัด (เช่น "อาคาร (A2) ชั้น 3") ไม่นับ
//   ตัวอักษรนำอื่นไม่นับ — "บานเลื่อน (S2)" "ห้อง (B12)" "รุ่น FUJI (F2)" เป็นรุ่น/เลขห้อง ไม่ใช่รหัสแอด (QA 20 พ.ย.69)
//   จะเพิ่มแอดช่องทางใหม่ → เพิ่มตัวอักษรใน LEAD_PREFIX ที่เดียว · รหัสรูปแบบอื่นแอดมินพิมพ์เองในช่องรหัสได้เสมอ
const LEAD_CODE_RE = /[(（]\s*([A-Za-z]{1,2}\d{1,4})\s*[)）][\s.。]*$/;
export function parseLeadCode(
  text: string, skipLine?: (line: string) => boolean,
): { code: string; source: LeadSource; line: number } | null {
  const lines = String(text ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || /https?:\/\//i.test(l) || skipLine?.(l)) continue;
    const m = l.match(LEAD_CODE_RE);
    if (!m) continue;
    const code = normLeadCode(m[1]);
    const source = leadSourceFromCode(code);
    if (!source) continue; // ไม่ใช่ตัวอักษรนำที่รู้จัก → ไม่ใช่รหัสแอด
    return { code, source, line: i };
  }
  return null;
}
// ── ฝั่ง API (สร้าง/แก้คิว) — ใช้ร่วมกัน 2 route ──
// คิวต้องบันทึกได้เสมอ: ถ้ายังไม่ได้รัน migration ที่เพิ่มคอลัมน์ (0077 bill_postal · 0175 lead_source) ฐานข้อมูลจะตอบว่าไม่รู้จักคอลัมน์
//   → ตัดคอลัมน์กลุ่มนั้นออกแล้วให้ลองใหม่ (คืน null = ไม่ใช่ error แบบนี้ ไม่ต้องลองใหม่)
const OPTIONAL_QUEUE_COLS: { re: RegExp; cols: string[] }[] = [
  { re: /bill_postal/i, cols: ["bill_postal"] },
  { re: /lead_source/i, cols: ["lead_source", "lead_source_code"] },
];
export function dropMissingQueueCols(row: Record<string, unknown>, errMessage: unknown): Record<string, unknown> | null {
  const msg = String(errMessage ?? "");
  // เฉพาะ error "ไม่มีคอลัมน์" — ไม่ใช่ค่าผิดกติกา (check constraint) ซึ่งต้องเด้งตามปกติ
  if (!/column|schema cache/i.test(msg)) return null;
  const hit = OPTIONAL_QUEUE_COLS.find((g) => g.re.test(msg) && g.cols.some((c) => c in row));
  if (!hit) return null;
  const next = { ...row };
  for (const c of hit.cols) delete next[c];
  return next;
}

// ตัดรหัสแอดท้ายบรรทัดออก (ใช้ตอนหยิบชื่อลูกค้า — ไม่ให้ "(A12)" ติดไปกับชื่อ)
export const stripLeadCode = (line: string): string => String(line ?? "").replace(LEAD_CODE_RE, "").trim();

// ---------- ออกใบเสนอราคาในนามอื่น (0070) — บรรทัดท้ายข้อความก๊อปคิว (เจ้าของ 3 พ.ย.69) ----------
//   เจ้าของ 16 พ.ย.69: "ก๊อปแล้วที่อยู่ออกบิลไม่ไป แต่กรอกไปแล้ว" — เดิมพิมพ์แค่ชื่อ (ที่อยู่อื่น ไม่มีช่องชื่อ → ออกเป็น "-")
//   ที่อยู่อื่น  → บรรทัดเดียว: หัวข้อ + ที่อยู่ออกบิลที่กรอก
//   นามบริษัท → ชื่อ · เลขผู้เสียภาษี (สาขา) · ที่อยู่ + รหัสไปรษณีย์ — พิมพ์เฉพาะบรรทัดที่กรอก
export type BillingSrc = {
  bill_choice?: string | null; bill_kind?: string | null; bill_name?: string | null;
  bill_tax_id?: string | null; bill_branch?: string | null; bill_address?: string | null; bill_postal?: string | null;
};
export function billingNameLine(e: BillingSrc): string {
  const choice = String(e.bill_choice ?? "SITE");
  if (choice === "SITE") return "";
  const one = (v?: string | null) => String(v ?? "").replace(/\s*\n\s*/g, " ").trim();
  const postal = one(e.bill_postal);
  const addrRaw = one(e.bill_address);
  const addr = addrRaw && postal && !addrRaw.includes(postal) ? `${addrRaw} ${postal}` : addrRaw || postal;
  const isCompany = choice === "COMPANY" || String(e.bill_kind ?? "") === "COMPANY";
  if (!isCompany) return `ออกใบเสนอราคาในนามบุคคล (ที่อยู่อื่น): ${addr || "-"}`;
  const taxId = one(e.bill_tax_id);
  const branch = one(e.bill_branch);
  return [
    `ออกใบเสนอราคาในนามบริษัท: ${one(e.bill_name) || "-"}`,
    taxId ? `เลขผู้เสียภาษี ${taxId}${branch ? ` (${branch})` : ""}` : "",
    addr ? `ที่อยู่ออกบิล: ${addr}` : "",
  ].filter(Boolean).join("\n");
}

// ---------- สถานะ ----------
export const STATUS_META: Record<QueueStatus, { th: string; tone: "gray" | "amber" | "sky" | "emerald" | "red" }> = {
  PENDING:   { th: "รอจัด", tone: "gray" },
  PROPOSED:  { th: "เสนอคิว (รอลูกค้ายืนยัน)", tone: "amber" },
  CONFIRMED: { th: "ยืนยันแล้ว", tone: "emerald" },
  DONE:      { th: "เสร็จ", tone: "emerald" },
  CANCELLED: { th: "ยกเลิก", tone: "red" },
};
export const STATUS_ORDER: QueueStatus[] = ["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"];

// ---------- ขนาดงาน ----------
export const JOB_SIZE_META: Record<JobSize, string> = {
  SINGLE: "จุดเดียว",
  MULTI: "หลายจุด",
  FULLDAY: "เต็มวัน",
};

// ---------- ค่าประเมิน (dropdown + พิมพ์เอง) ----------
export const FEE_OPTIONS = [1000, 2000, 2500, 3000, 3500];

// ---------- การชำระค่าประเมิน — ตัวเลือกแหล่งเดียว (ฟอร์มคิว + ดรอปดาวในตารางคิว) ----------
//   เจ้าของ 19 พ.ย.69 เพิ่ม "รอค่าประเมิน" + "มัดจำจองคิว" — เป็นโน้ตเฉย ๆ ไม่มีผลกับระบบ
//   (มัดจำจองคิว = มัดจำไม่เต็ม ไม่ลงเข้าระบบ · ต่างจาก "มัดจำหน้างาน" ตัวเดียวที่ปิดคิวแล้วมัดจำ+เข้าผลิตอัตโนมัติ)
//   + "อื่นๆ" (เจ้าของ 19 พ.ย.69) — โน้ตเฉย ๆ เหมือนกัน
//   + "ไม่จ่าย (ซ่อน)" / "ยกเลิกค่าประเมิน" (เจ้าของ 26 พ.ย.69) — สถานะของหน้าต่างเช็คค่าประเมิน เก็บในช่องเดียวกันนี้
//     ต้องสะกดตรงกับ FEE_HIDDEN / FEE_VOID ใน src/lib/fee-check.ts
export const PAYMENT_OPTIONS = ["โอน", "จ่ายสด", "รอค่าประเมิน", "ไม่จ่าย (ซ่อน)", "ยกเลิกค่าประเมิน", "ลูกค้าเก่า", "มัดจำจองคิว", "มัดจำหน้างาน", "อื่นๆ"] as const;
// คิวที่ไม่มีค่าประเมิน — เลือกได้เฉพาะเรื่องมัดจำ (ไม่เกี่ยวกับค่าประเมิน) + อื่นๆ
export const PAYMENT_OPTIONS_NO_FEE = ["มัดจำจองคิว", "มัดจำหน้างาน", "อื่นๆ"] as const;
// มีค่าประเมินจริงไหม (ลงไว้และมากกว่า 0) — ไม่มี = ขีดทั้งช่องค่าประเมิน/ชำระ ไม่ต้องกรอก ไม่ต้องติ๊ก
//   แม้เคยติ๊ก "ชำระแล้ว" ค้างไว้ก็ไม่โชว์ (เจ้าของ 12 + 18 พ.ย.69: "ยังขึ้นอยู่")
export const hasAssessFee = (e: { assess_fee?: number | string | null } | null | undefined): boolean =>
  Number(e?.assess_fee ?? 0) > 0;

// ---------- วันในสัปดาห์ + สีประจำวัน (ไทย) ----------
// index: 0=อาทิตย์ … 6=เสาร์ (ตรงกับ Date.getDay())
const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export type DayColor = { name: string; row: string; chip: string; dot: string };
const DAY_COLORS: DayColor[] = [
  { name: "อาทิตย์", row: "bg-red-50",     chip: "bg-red-100 text-red-800",        dot: "#dc2626" },
  { name: "จันทร์",  row: "bg-yellow-50",  chip: "bg-yellow-100 text-yellow-800",  dot: "#ca8a04" },
  { name: "อังคาร",  row: "bg-pink-50",    chip: "bg-pink-100 text-pink-800",      dot: "#db2777" },
  { name: "พุธ",     row: "bg-green-50",   chip: "bg-green-100 text-green-800",     dot: "#16a34a" },
  { name: "พฤหัสบดี", row: "bg-orange-50", chip: "bg-orange-100 text-orange-800",   dot: "#ea580c" },
  { name: "ศุกร์",   row: "bg-sky-50",     chip: "bg-sky-100 text-sky-800",         dot: "#0284c7" },
  { name: "เสาร์",   row: "bg-purple-50",  chip: "bg-purple-100 text-purple-800",   dot: "#9333ea" },
];

// "2026-06-01" -> index วัน (0–6) หรือ null
function dowIndex(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
}

export function dayLabel(isoDate: string | null): string {
  const i = dowIndex(isoDate);
  return i === null ? "" : DOW_TH[i];
}

export function dayColor(isoDate: string | null): DayColor | null {
  const i = dowIndex(isoDate);
  return i === null ? null : DAY_COLORS[i];
}

// แปลง ISO -> วันที่ไทยอ่านง่าย ปี ค.ศ. เต็ม (1 มิ.ย. 2026)
const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function thaiDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${TH_MON[m]} ${y}`;
}

// ---------- พิกัด: ดึง lat,lng จากข้อความ/ลิงก์ Google Maps (ฝั่ง client) ----------
// รองรับ: "13.7,100.5" · ".../@13.7,100.5,17z" · "?q=13.7,100.5" · "query=13.7,100.5"
// ลิงก์ย่อ maps.app.goo.gl ดึงไม่ได้ฝั่ง client → ให้วางพิกัดตรง ๆ แทน
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const s = input.trim();
  const valid = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat, lng } : null;

  const plain = s.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (plain) return valid(Number(plain[1]), Number(plain[2]));
  const at = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) return valid(Number(at[1]), Number(at[2]));
  const q = s.match(/[?&](?:q|query|ll|center)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (q) return valid(Number(q[1]), Number(q[2]));
  return null;
}

// ---------- ระยะทาง/เวลา (ใช้เต็มที่ตอนเฟส 2 — ระยะเส้นตรงโดยประมาณ) ----------
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// โซนใต้ (13 จังหวัด) → ทีมภูเก็ต (เซลล์บาส) · นอกนั้น = ทีม กทม.
export const SOUTH_PROVINCES = [
  "กระบี่", "ชุมพร", "ตรัง", "นครศรีธรรมราช", "นราธิวาส", "ปัตตานี", "พังงา",
  "พัทลุง", "ภูเก็ต", "ยะลา", "ระนอง", "สงขลา", "สตูล",
];
// ดูโซนจาก "พิกัด" ก่อน (แม่นกว่าคำในที่อยู่) — ใต้/ภูเก็ต lat < ~11.5 (กทม.13.7, ภูเก็ต7.8, ชุมพร10.5)
// ไม่มีพิกัด → ดูคำจังหวัดในที่อยู่ · ไม่เข้าเงื่อนไข = กทม.
export function detectTeam(address?: string | null, lat?: number | null, lng?: number | null): QueueTeam {
  if (lat != null && Number.isFinite(lat) && lat < 11.5 && (lng == null || (lng > 96 && lng < 101))) return "PHUKET";
  if (address && SOUTH_PROVINCES.some((p) => address.includes(p))) return "PHUKET";
  return "BKK";
}

// แปลงระยะเส้นตรง -> นาทีเดินทางโดยประมาณ (ปรับ avgSpeed/detour ได้จาก queue_settings)
export function estimateMinutes(
  a: { lat: number; lng: number }, b: { lat: number; lng: number },
  opts: { avgSpeedKmh?: number; detourFactor?: number } = {}
): number {
  const avg = opts.avgSpeedKmh ?? 40;
  const detour = opts.detourFactor ?? 1.3;
  const km = haversineKm(a, b) * detour;
  return Math.round((km / avg) * 60);
}
